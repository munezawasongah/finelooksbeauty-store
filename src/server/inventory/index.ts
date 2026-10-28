/**
 * Inventory engine — sections 6.2 to 6.5 of the architecture document.
 *
 *   available_to_sell = max(0, on_hand − reserved − safety_stock)
 *
 * Every change to on_hand writes exactly one append-only stock_movements row
 * inside the same transaction. Website reservations use a single conditional
 * UPDATE, so two checkouts can never reserve the same last unit.
 */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db, type Tx } from "../db";
import {
  inventoryBalances,
  locations,
  productVariants,
  stockMovements,
  stockReservations,
} from "../db/schema";
import { audit, raiseAlert, type Actor } from "../audit";

export class OutOfStockError extends Error {
  constructor(
    public readonly variantId: string,
    public readonly requested: number,
    public readonly available: number,
  ) {
    super(`Only ${available} available for variant ${variantId} (requested ${requested})`);
  }
}

export type MovementType = (typeof stockMovements.$inferInsert)["movementType"];

export function availableToSell(b: { onHand: number; reserved: number; safetyStock: number; checkoutPaused?: boolean }) {
  if (b.checkoutPaused) return 0;
  return Math.max(0, b.onHand - b.reserved - b.safetyStock);
}

let defaultLocationCache: { id: string; at: number } | null = null;

export async function defaultLocationId(tx?: Tx): Promise<string> {
  if (defaultLocationCache && Date.now() - defaultLocationCache.at < 60_000) return defaultLocationCache.id;
  const loc = await (tx ?? db()).query.locations.findFirst({ where: eq(locations.isDefault, true) });
  if (!loc) throw new Error("No default stock location configured");
  defaultLocationCache = { id: loc.id, at: Date.now() };
  return loc.id;
}

/** For tests and after editing locations. */
export function resetLocationCache() {
  defaultLocationCache = null;
}

/** Make sure a balance row exists (new variants start at zero). */
export async function ensureBalance(tx: Tx, variantId: string, locationId: string, safetyStock = 0) {
  await tx
    .insert(inventoryBalances)
    .values({ variantId, locationId, onHand: 0, reserved: 0, safetyStock })
    .onConflictDoNothing();
}

/* ------------------------------------------------------------------ */
/* Reservations (website checkout)                                     */
/* ------------------------------------------------------------------ */

export type ReserveLine = { variantId: string; quantity: number };

/**
 * Reserve stock for every line of an order, all-or-nothing.
 * Lines are processed in variant-id order so concurrent checkouts lock rows in
 * the same order and cannot deadlock. Must be called inside a transaction.
 */
export async function reserveForOrder(
  tx: Tx,
  orderId: string,
  lines: ReserveLine[],
  locationId: string,
  expiresAt: Date,
) {
  const merged = mergeLines(lines);
  for (const line of merged) {
    const updated = await tx
      .update(inventoryBalances)
      .set({
        reserved: sql`${inventoryBalances.reserved} + ${line.quantity}`,
        version: sql`${inventoryBalances.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(inventoryBalances.variantId, line.variantId),
          eq(inventoryBalances.locationId, locationId),
          eq(inventoryBalances.checkoutPaused, false),
          sql`${inventoryBalances.onHand} - ${inventoryBalances.reserved} - ${inventoryBalances.safetyStock} >= ${line.quantity}`,
        ),
      )
      .returning({ variantId: inventoryBalances.variantId });

    if (updated.length === 0) {
      const bal = await tx.query.inventoryBalances.findFirst({
        where: and(eq(inventoryBalances.variantId, line.variantId), eq(inventoryBalances.locationId, locationId)),
      });
      throw new OutOfStockError(line.variantId, line.quantity, bal ? availableToSell(bal) : 0);
    }

    await tx.insert(stockReservations).values({
      orderId,
      variantId: line.variantId,
      locationId,
      quantity: line.quantity,
      status: "active",
      expiresAt,
    });
  }
}

/**
 * Convert an order's active reservations into a sale: on_hand and reserved both
 * drop by the quantity, and one sale_online movement is written per line.
 * Idempotent — calling it twice for the same order changes nothing the second time.
 * Returns the movements written (empty if already committed).
 */
export async function commitReservations(tx: Tx, orderId: string) {
  const active = await tx
    .select()
    .from(stockReservations)
    .where(and(eq(stockReservations.orderId, orderId), eq(stockReservations.status, "active")))
    .orderBy(asc(stockReservations.variantId))
    .for("update");

  const written: { variantId: string; locationId: string; delta: number; movementId: number }[] = [];
  for (const r of active) {
    const [bal] = await tx
      .update(inventoryBalances)
      .set({
        onHand: sql`${inventoryBalances.onHand} - ${r.quantity}`,
        reserved: sql`${inventoryBalances.reserved} - ${r.quantity}`,
        version: sql`${inventoryBalances.version} + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(inventoryBalances.variantId, r.variantId), eq(inventoryBalances.locationId, r.locationId)))
      .returning({ onHand: inventoryBalances.onHand });

    const [mv] = await tx
      .insert(stockMovements)
      .values({
        variantId: r.variantId,
        locationId: r.locationId,
        quantityDelta: -r.quantity,
        onHandAfter: bal.onHand,
        movementType: "sale_online",
        sourceType: "order",
        sourceId: orderId,
        idempotencyKey: `order:${orderId}:${r.variantId}:commit`,
        reason: "Online order paid",
      })
      .onConflictDoNothing()
      .returning({ id: stockMovements.id });

    await tx
      .update(stockReservations)
      .set({ status: "committed", updatedAt: new Date() })
      .where(eq(stockReservations.id, r.id));

    if (mv) written.push({ variantId: r.variantId, locationId: r.locationId, delta: -r.quantity, movementId: mv.id });
    if (bal.onHand < 0) {
      await raiseAlert(
        {
          kind: "negative_stock",
          severity: "critical",
          message: `Stock went negative (${bal.onHand}) after an online sale. Check this SKU against the shelf and Clover.`,
          dedupeKey: `negative_stock:${r.variantId}`,
          context: { variantId: r.variantId, orderId },
        },
        tx,
      );
    }
  }
  return written;
}

/** Release an order's active reservations (payment failed, cancelled or expired). Idempotent. */
export async function releaseReservations(tx: Tx, orderId: string, reason: "released" | "expired") {
  const active = await tx
    .select()
    .from(stockReservations)
    .where(and(eq(stockReservations.orderId, orderId), eq(stockReservations.status, "active")))
    .orderBy(asc(stockReservations.variantId))
    .for("update");

  for (const r of active) {
    await tx
      .update(inventoryBalances)
      .set({
        reserved: sql`greatest(${inventoryBalances.reserved} - ${r.quantity}, 0)`,
        version: sql`${inventoryBalances.version} + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(inventoryBalances.variantId, r.variantId), eq(inventoryBalances.locationId, r.locationId)));
    await tx
      .update(stockReservations)
      .set({ status: reason, updatedAt: new Date() })
      .where(eq(stockReservations.id, r.id));
  }
  return active.length;
}

/**
 * Late payment: the reservation expired before Stripe confirmed payment.
 * Try to reserve the same lines again; never silently oversell (section 6.3 step 5).
 * Returns true when stock was re-reserved and committed.
 */
export async function reReserveAndCommit(tx: Tx, orderId: string, lines: ReserveLine[], locationId: string) {
  // Clear the old non-active reservation rows so the unique (order, variant) index allows new ones.
  await tx
    .delete(stockReservations)
    .where(and(eq(stockReservations.orderId, orderId), inArray(stockReservations.status, ["expired", "released"])));
  try {
    await tx.execute(sql`savepoint late_reserve`);
    await reserveForOrder(tx, orderId, lines, locationId, new Date(Date.now() + 10 * 60_000));
    await tx.execute(sql`release savepoint late_reserve`);
  } catch (err) {
    await tx.execute(sql`rollback to savepoint late_reserve`);
    if (err instanceof OutOfStockError) return { ok: false as const, movements: [] };
    throw err;
  }
  const movements = await commitReservations(tx, orderId);
  return { ok: true as const, movements };
}

/* ------------------------------------------------------------------ */
/* Direct stock changes                                                */
/* ------------------------------------------------------------------ */

/**
 * Apply a change to on_hand with a ledger row. Use `setTo` for counts
 * (stocktake, Clover) or `delta` for relative changes (returns, adjustments).
 */
export async function changeStock(
  tx: Tx,
  input: {
    variantId: string;
    locationId: string;
    delta?: number;
    setTo?: number;
    type: MovementType;
    sourceType: string;
    sourceId?: string | null;
    idempotencyKey?: string | null;
    reason: string;
    actor?: Actor | null;
  },
) {
  await ensureBalance(tx, input.variantId, input.locationId);
  const [current] = await tx
    .select()
    .from(inventoryBalances)
    .where(and(eq(inventoryBalances.variantId, input.variantId), eq(inventoryBalances.locationId, input.locationId)))
    .for("update");

  const delta = input.setTo !== undefined ? input.setTo - current.onHand : (input.delta ?? 0);
  if (delta === 0) return { delta: 0, onHand: current.onHand, movementId: null as number | null };

  if (input.idempotencyKey) {
    const exists = await tx.query.stockMovements.findFirst({
      where: eq(stockMovements.idempotencyKey, input.idempotencyKey),
    });
    if (exists) return { delta: 0, onHand: current.onHand, movementId: null as number | null };
  }

  const onHand = current.onHand + delta;
  await tx
    .update(inventoryBalances)
    .set({ onHand, version: sql`${inventoryBalances.version} + 1`, updatedAt: new Date() })
    .where(and(eq(inventoryBalances.variantId, input.variantId), eq(inventoryBalances.locationId, input.locationId)));

  const [mv] = await tx
    .insert(stockMovements)
    .values({
      variantId: input.variantId,
      locationId: input.locationId,
      quantityDelta: delta,
      onHandAfter: onHand,
      movementType: input.type,
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
      actorUserId: input.actor?.userId ?? null,
      reason: input.reason,
    })
    .returning({ id: stockMovements.id });

  if (input.actor) {
    await audit(
      input.actor,
      "stock.change",
      "variant",
      input.variantId,
      { type: input.type, delta, before: current.onHand, after: onHand, reason: input.reason },
      tx,
    );
  }
  if (onHand < 0) {
    await raiseAlert(
      {
        kind: "negative_stock",
        severity: "critical",
        message: `On-hand stock is negative (${onHand}). Count the shelf and correct it.`,
        dedupeKey: `negative_stock:${input.variantId}`,
        context: { variantId: input.variantId },
      },
      tx,
    );
  }
  return { delta, onHand, movementId: mv.id as number | null };
}

/** Expire reservations whose hold time has passed (run by the worker every minute). */
export async function expireStaleReservations(limit = 200) {
  const stale = await db()
    .selectDistinct({ orderId: stockReservations.orderId })
    .from(stockReservations)
    .where(and(eq(stockReservations.status, "active"), sql`${stockReservations.expiresAt} < now()`))
    .limit(limit);
  return stale.map((s) => s.orderId);
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

export async function availabilityFor(variantIds: string[], locationId?: string) {
  if (variantIds.length === 0) return new Map<string, number>();
  const loc = locationId ?? (await defaultLocationId());
  const rows = await db()
    .select()
    .from(inventoryBalances)
    .where(and(inArray(inventoryBalances.variantId, variantIds), eq(inventoryBalances.locationId, loc)));
  const map = new Map<string, number>();
  for (const id of variantIds) map.set(id, 0);
  for (const r of rows) map.set(r.variantId, availableToSell(r));
  return map;
}

function mergeLines(lines: ReserveLine[]): ReserveLine[] {
  const m = new Map<string, number>();
  for (const l of lines) {
    if (!Number.isInteger(l.quantity) || l.quantity <= 0) throw new Error("Invalid quantity");
    m.set(l.variantId, (m.get(l.variantId) ?? 0) + l.quantity);
  }
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([variantId, quantity]) => ({ variantId, quantity }));
}

export async function variantsWithStock(variantIds: string[]) {
  if (!variantIds.length) return [];
  return db().select().from(productVariants).where(inArray(productVariants.id, variantIds));
}
