/**
 * Clover ↔ website stock synchronisation (sections 6.4 and 6.5).
 *
 * Policy (recommended default): Clover is the source of truth for in-store stock;
 * the website keeps its own transactional ledger and reservations.
 *
 * Clover's API only sets absolute quantities, so website sales not yet written
 * to Clover (pending clover_outbound rows) are added back when reading Clover:
 *
 *     local_on_hand_target = clover_quantity + Σ(pending website deltas)
 *
 * All Clover work for a merchant runs under one Postgres advisory lock, so an
 * inbound refresh can never interleave with an outbound write (no ping-pong,
 * no double counting).
 */
import { and, asc, eq, inArray, lt, sql } from "drizzle-orm";
import { db, pool } from "../db";
import {
  cloverConnections,
  cloverItemMappings,
  cloverOutbound,
  inventoryBalances,
  productVariants,
  reconciliationRuns,
} from "../db/schema";
import { changeStock, defaultLocationId } from "../inventory";
import { audit, raiseAlert, SYSTEM_ACTOR, type Actor } from "../audit";
import { getSetting } from "../settings";
import {
  activeConnection,
  CloverError,
  getItemStock,
  getOrderItemIds,
  listAllItems,
  setItemStock,
  stockOf,
  type CloverItem,
} from "./client";

const LOCK_BASE = 818_000;

async function withMerchantLock<T>(merchantId: string, fn: () => Promise<T>): Promise<T> {
  const client = await pool().connect();
  const key = LOCK_BASE + (Array.from(merchantId).reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 100_000);
  try {
    await client.query("select pg_advisory_lock($1)", [key]);
    return await fn();
  } finally {
    await client.query("select pg_advisory_unlock($1)", [key]).catch(() => {});
    client.release();
  }
}

async function pendingDelta(variantId: string) {
  const [row] = await db()
    .select({ d: sql<number>`coalesce(sum(${cloverOutbound.quantityDelta}), 0)::int` })
    .from(cloverOutbound)
    .where(and(eq(cloverOutbound.variantId, variantId), inArray(cloverOutbound.status, ["pending", "failed"])));
  return row?.d ?? 0;
}

/**
 * Bring local on_hand in line with a Clover quantity for one mapped item.
 * Returns the difference that was applied (0 when already in sync).
 */
async function applyCloverQuantity(
  merchantId: string,
  map: typeof cloverItemMappings.$inferSelect,
  cloverQty: number,
  reason: string,
) {
  const now = new Date();
  await db()
    .update(cloverItemMappings)
    .set({ cloverStock: cloverQty, lastSyncedAt: now, updatedAt: now })
    .where(eq(cloverItemMappings.id, map.id));
  if (!map.variantId || map.syncStatus !== "ok" || !map.stockTracked) return 0;

  const loc = await defaultLocationId();
  const pending = await pendingDelta(map.variantId);
  const target = cloverQty + pending;
  const applied = await db().transaction(async (tx) => {
    const res = await changeStock(tx, {
      variantId: map.variantId!,
      locationId: loc,
      setTo: target,
      type: "pos_sync",
      sourceType: "clover",
      sourceId: map.cloverItemId,
      reason,
    });
    await tx
      .update(inventoryBalances)
      .set({
        lastSyncedAt: now,
        lastSyncSource: "clover",
        // Lift automatic pauses once a fresh, successful sync arrives.
        checkoutPaused: sql`case when ${inventoryBalances.pauseReason} in ('stale_sync','sync_error') then false else ${inventoryBalances.checkoutPaused} end`,
        pauseReason: sql`case when ${inventoryBalances.pauseReason} in ('stale_sync','sync_error') then null else ${inventoryBalances.pauseReason} end`,
      })
      .where(and(eq(inventoryBalances.variantId, map.variantId!), eq(inventoryBalances.locationId, loc)));
    return res.delta;
  });
  return applied;
}

/* ------------------------------------------------------------------ */
/* Inbound: webhook-triggered refreshes                                 */
/* ------------------------------------------------------------------ */

export async function refreshItems(merchantId: string, itemIds: string[], reason: string) {
  await withMerchantLock(merchantId, async () => {
    for (const itemId of [...new Set(itemIds)]) {
      const map = await db().query.cloverItemMappings.findFirst({
        where: and(eq(cloverItemMappings.merchantId, merchantId), eq(cloverItemMappings.cloverItemId, itemId)),
      });
      const qty = await getItemStock(merchantId, itemId);
      if (!map) continue; // new Clover items are picked up by import/reconcile for review
      if (qty == null) {
        await db()
          .update(cloverItemMappings)
          .set({ syncStatus: map.variantId ? "error" : map.syncStatus, syncError: "Item or stock not found in Clover", updatedAt: new Date() })
          .where(eq(cloverItemMappings.id, map.id));
        if (map.variantId) await pauseVariant(map.variantId, "sync_error");
        continue;
      }
      await applyCloverQuantity(merchantId, map, qty, `Clover stock update (${reason})`);
    }
  });
}

export async function refreshFromOrder(merchantId: string, orderId: string) {
  const itemIds = await getOrderItemIds(merchantId, orderId);
  if (itemIds.length) await refreshItems(merchantId, itemIds, `in-store order ${orderId}`);
}

/* ------------------------------------------------------------------ */
/* Outbound: write website sales / restocks to Clover                   */
/* ------------------------------------------------------------------ */

const MAX_ATTEMPTS = 8;

export async function pushPending() {
  const due = await db()
    .select()
    .from(cloverOutbound)
    .where(and(eq(cloverOutbound.status, "pending"), lt(cloverOutbound.nextAttemptAt, new Date())))
    .orderBy(asc(cloverOutbound.createdAt))
    .limit(200);
  const byMerchant = new Map<string, typeof due>();
  for (const r of due) byMerchant.set(r.merchantId, [...(byMerchant.get(r.merchantId) ?? []), r]);

  for (const [merchantId, rows] of byMerchant) {
    await withMerchantLock(merchantId, async () => {
      const byItem = new Map<string, typeof rows>();
      for (const r of rows) byItem.set(r.cloverItemId, [...(byItem.get(r.cloverItemId) ?? []), r]);
      for (const [itemId, group] of byItem) {
        const ids = group.map((g) => g.id);
        const delta = group.reduce((s, g) => s + g.quantityDelta, 0);
        try {
          const current = await getItemStock(merchantId, itemId);
          if (current == null) throw new CloverError("Item stock not found in Clover", 404, false);
          const next = current + delta;
          await setItemStock(merchantId, itemId, next);
          const now = new Date();
          await db()
            .update(cloverOutbound)
            .set({ status: "pushed", pushedAt: now, attempts: sql`${cloverOutbound.attempts} + 1`, lastError: null })
            .where(inArray(cloverOutbound.id, ids));
          await db()
            .update(cloverItemMappings)
            .set({ lastPushedQuantity: next, lastPushedAt: now, cloverStock: next, syncError: null, updatedAt: now })
            .where(and(eq(cloverItemMappings.merchantId, merchantId), eq(cloverItemMappings.cloverItemId, itemId)));
        } catch (err) {
          const attempts = Math.max(...group.map((g) => g.attempts)) + 1;
          const failed = attempts >= MAX_ATTEMPTS || (err instanceof CloverError && !err.retryable);
          const msg = err instanceof Error ? err.message : String(err);
          await db()
            .update(cloverOutbound)
            .set({
              status: failed ? "failed" : "pending",
              attempts,
              lastError: msg.slice(0, 500),
              nextAttemptAt: new Date(Date.now() + Math.min(2 ** attempts * 15_000, 3_600_000)),
            })
            .where(inArray(cloverOutbound.id, ids));
          if (failed) {
            await db()
              .update(cloverItemMappings)
              .set({ syncStatus: "error", syncError: `Could not update Clover stock: ${msg}`.slice(0, 500) })
              .where(and(eq(cloverItemMappings.merchantId, merchantId), eq(cloverItemMappings.cloverItemId, itemId)));
            await pauseVariant(group[0].variantId, "sync_error");
            await raiseAlert({
              kind: "clover_push_failed",
              severity: "critical",
              message: `A website sale could not be written to Clover (item ${itemId}). Checkout for this SKU is paused. Retry from Integrations.`,
              dedupeKey: `clover_push:${itemId}`,
              context: { merchantId, itemId, error: msg },
            });
          }
        }
      }
    });
  }
}

export async function retryFailedPushes(actor: Actor) {
  const n = await db()
    .update(cloverOutbound)
    .set({ status: "pending", attempts: 0, nextAttemptAt: new Date() })
    .where(eq(cloverOutbound.status, "failed"))
    .returning({ id: cloverOutbound.id });
  await audit(actor, "clover.retry_failed", "integration", "clover", { count: n.length });
  return n.length;
}

/* ------------------------------------------------------------------ */
/* Import and reconciliation                                            */
/* ------------------------------------------------------------------ */

function upsertMappingValues(merchantId: string, item: CloverItem) {
  return {
    merchantId,
    cloverItemId: item.id,
    cloverName: item.name ?? "(unnamed item)",
    cloverSku: item.sku ?? null,
    cloverCode: item.code ?? null,
    cloverPriceCents: item.price ?? null,
    cloverStock: stockOf(item),
    stockTracked: stockOf(item) != null,
    updatedAt: new Date(),
  };
}

/**
 * Initial / repeat import: fetch every Clover item, record it, and auto-suggest
 * a match by SKU or barcode. Matches stay "pending" until a person approves them
 * (section 6.5: human-reviewed reconciliation before enabling sales).
 */
export async function importItems(triggeredBy: string) {
  const conn = await activeConnection();
  if (!conn) throw new Error("Clover is not connected");
  const items = await listAllItems(conn.merchantId);
  let created = 0;
  let suggested = 0;
  for (const item of items) {
    const existing = await db().query.cloverItemMappings.findFirst({
      where: and(eq(cloverItemMappings.merchantId, conn.merchantId), eq(cloverItemMappings.cloverItemId, item.id)),
    });
    const v = upsertMappingValues(conn.merchantId, item);
    if (existing) {
      await db().update(cloverItemMappings).set(v).where(eq(cloverItemMappings.id, existing.id));
      continue;
    }
    let variantId: string | null = null;
    if (item.sku || item.code) {
      const match = await db()
        .select({ id: productVariants.id })
        .from(productVariants)
        .where(
          sql`(${item.sku ? sql`upper(${productVariants.sku}) = upper(${item.sku})` : sql`false`})
              or (${item.code ? sql`${productVariants.barcode} = ${item.code}` : sql`false`})`,
        )
        .limit(2);
      const taken = match.length === 1
        ? await db().query.cloverItemMappings.findFirst({ where: eq(cloverItemMappings.variantId, match[0].id) })
        : null;
      if (match.length === 1 && !taken) variantId = match[0].id;
    }
    await db()
      .insert(cloverItemMappings)
      .values({ ...v, variantId, syncStatus: variantId ? "pending" : "unmapped" })
      .onConflictDoNothing();
    created++;
    if (variantId) suggested++;
  }
  await db()
    .update(cloverConnections)
    .set({ lastSyncAt: new Date(), updatedAt: new Date() })
    .where(eq(cloverConnections.id, conn.id));
  await audit({ userId: null, label: triggeredBy }, "clover.import", "integration", conn.merchantId, {
    items: items.length,
    created,
    suggested,
  });
  return { total: items.length, created, suggested };
}

/** Periodic comparison of Clover quantities with local records (section 6.5). */
export async function reconcile(triggeredBy: string) {
  const conn = await activeConnection();
  if (!conn) return null;
  const [run] = await db()
    .insert(reconciliationRuns)
    .values({ provider: "clover", status: "running", triggeredBy })
    .returning();
  try {
    const result = await withMerchantLock(conn.merchantId, async () => {
      const items = await listAllItems(conn.merchantId);
      const byId = new Map(items.map((i) => [i.id, i]));
      const maps = await db()
        .select()
        .from(cloverItemMappings)
        .where(eq(cloverItemMappings.merchantId, conn.merchantId));
      const loc = await defaultLocationId();
      const discrepancies: (typeof reconciliationRuns.$inferSelect)["discrepancies"] = [];
      let checked = 0;
      for (const map of maps) {
        const item = byId.get(map.cloverItemId);
        if (!item) {
          if (map.variantId && map.syncStatus === "ok") {
            discrepancies.push({ variantId: map.variantId, sku: null, cloverItemId: map.cloverItemId, local: null, clover: null, action: "Item deleted in Clover — checkout paused" });
            await db().update(cloverItemMappings).set({ syncStatus: "error", syncError: "Item no longer exists in Clover" }).where(eq(cloverItemMappings.id, map.id));
            await pauseVariant(map.variantId, "sync_error");
          }
          continue;
        }
        const qty = stockOf(item);
        if (qty == null || map.syncStatus !== "ok" || !map.variantId) {
          await db().update(cloverItemMappings).set(upsertMappingValues(conn.merchantId, item)).where(eq(cloverItemMappings.id, map.id));
          continue;
        }
        checked++;
        const bal = await db().query.inventoryBalances.findFirst({
          where: and(eq(inventoryBalances.variantId, map.variantId), eq(inventoryBalances.locationId, loc)),
        });
        const pending = await pendingDelta(map.variantId);
        const target = qty + pending;
        if (bal && bal.onHand !== target) {
          const v = await db().query.productVariants.findFirst({ where: eq(productVariants.id, map.variantId) });
          discrepancies.push({
            variantId: map.variantId,
            sku: v?.sku ?? null,
            cloverItemId: map.cloverItemId,
            local: bal.onHand,
            clover: qty,
            action: `Set website on-hand ${bal.onHand} → ${target}`,
          });
        }
        await applyCloverQuantity(conn.merchantId, map, qty, "Scheduled reconciliation with Clover");
      }
      return { checked, discrepancies };
    });

    // Repeated variance on the same SKU in consecutive runs needs a person to look.
    const prev = await db().query.reconciliationRuns.findFirst({
      where: and(eq(reconciliationRuns.provider, "clover"), eq(reconciliationRuns.status, "completed")),
      orderBy: (r, { desc }) => [desc(r.startedAt)],
    });
    const repeated = result.discrepancies.filter((d) =>
      prev?.discrepancies.some((p) => p.variantId === d.variantId && p.variantId),
    );
    if (repeated.length) {
      await raiseAlert({
        kind: "repeated_variance",
        severity: "warning",
        message: `${repeated.length} SKU(s) disagreed with Clover in two reconciliations in a row. Check the shelf counts.`,
        dedupeKey: "repeated_variance",
        context: { variants: repeated.map((r) => r.variantId) },
      });
    }

    await db()
      .update(reconciliationRuns)
      .set({ status: "completed", checked: result.checked, discrepancies: result.discrepancies, finishedAt: new Date() })
      .where(eq(reconciliationRuns.id, run.id));
    await db()
      .update(cloverConnections)
      .set({ lastReconcileAt: new Date(), lastSyncAt: new Date(), lastError: null, updatedAt: new Date() })
      .where(eq(cloverConnections.id, conn.id));
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db()
      .update(reconciliationRuns)
      .set({ status: "failed", error: msg.slice(0, 1000), finishedAt: new Date() })
      .where(eq(reconciliationRuns.id, run.id));
    await db().update(cloverConnections).set({ lastError: msg.slice(0, 500), updatedAt: new Date() }).where(eq(cloverConnections.id, conn.id));
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/* Mapping review (admin)                                               */
/* ------------------------------------------------------------------ */

/**
 * Approve a Clover item ↔ SKU mapping. Website on-hand is set from Clover's
 * quantity with an initial_import movement, then normal sync takes over.
 */
export async function approveMapping(actor: Actor, mappingId: string, variantId: string) {
  const map = await db().query.cloverItemMappings.findFirst({ where: eq(cloverItemMappings.id, mappingId) });
  if (!map) throw new Error("Mapping not found");
  const other = await db().query.cloverItemMappings.findFirst({ where: eq(cloverItemMappings.variantId, variantId) });
  if (other && other.id !== map.id) throw new Error("That SKU is already linked to another Clover item.");
  const qty = await withMerchantLock(map.merchantId, () => getItemStock(map.merchantId, map.cloverItemId));
  const loc = await defaultLocationId();
  const commerce = await getSetting("commerce");
  await db().transaction(async (tx) => {
    await tx
      .update(cloverItemMappings)
      .set({ variantId, syncStatus: "ok", syncError: null, cloverStock: qty, lastSyncedAt: new Date(), updatedAt: new Date() })
      .where(eq(cloverItemMappings.id, map.id));
    await tx
      .insert(inventoryBalances)
      .values({ variantId, locationId: loc, onHand: 0, safetyStock: commerce.defaultSafetyStock })
      .onConflictDoNothing();
    if (qty != null) {
      await changeStock(tx, {
        variantId,
        locationId: loc,
        setTo: qty,
        type: "initial_import",
        sourceType: "clover",
        sourceId: map.cloverItemId,
        reason: "Linked to Clover item — quantity taken from Clover",
        actor,
      });
    }
    await tx
      .update(inventoryBalances)
      .set({ lastSyncedAt: new Date(), lastSyncSource: "clover" })
      .where(and(eq(inventoryBalances.variantId, variantId), eq(inventoryBalances.locationId, loc)));
    await audit(actor, "clover.mapping.approve", "variant", variantId, { cloverItemId: map.cloverItemId, quantity: qty }, tx);
  });
}

export async function unlinkMapping(actor: Actor, mappingId: string) {
  const map = await db().query.cloverItemMappings.findFirst({ where: eq(cloverItemMappings.id, mappingId) });
  if (!map) return;
  await db()
    .update(cloverItemMappings)
    .set({ variantId: null, syncStatus: "unmapped", syncError: null, updatedAt: new Date() })
    .where(eq(cloverItemMappings.id, mappingId));
  await audit(actor, "clover.mapping.unlink", "variant", map.variantId, { cloverItemId: map.cloverItemId });
}

/* ------------------------------------------------------------------ */
/* Guards                                                               */
/* ------------------------------------------------------------------ */

export async function pauseVariant(variantId: string, reason: "stale_sync" | "sync_error") {
  await db()
    .update(inventoryBalances)
    .set({ checkoutPaused: true, pauseReason: reason, updatedAt: new Date() })
    .where(and(eq(inventoryBalances.variantId, variantId), sql`coalesce(${inventoryBalances.pauseReason}, '') <> 'manual'`));
}

/**
 * Section 6.4: reduce website availability when Clover sync is stale.
 * Mapped SKUs whose last successful sync is older than the threshold are paused.
 */
export async function staleSyncGuard() {
  const conn = await activeConnection();
  if (!conn) return 0;
  const { staleSyncMinutes } = await getSetting("commerce");
  const r = await db().execute(sql`
    update inventory_balances b set checkout_paused = true, pause_reason = 'stale_sync', updated_at = now()
    from clover_item_mappings m
    where m.variant_id = b.variant_id and m.sync_status = 'ok' and m.stock_tracked
      and (b.last_synced_at is null or b.last_synced_at < now() - make_interval(mins => ${staleSyncMinutes}))
      and not b.checkout_paused
    returning b.variant_id
  `);
  if (r.rowCount) {
    await raiseAlert({
      kind: "stale_clover_sync",
      severity: "warning",
      message: `${r.rowCount} SKU(s) paused online because their Clover sync is older than ${staleSyncMinutes} minutes.`,
      dedupeKey: "stale_clover_sync",
    });
  }
  return r.rowCount ?? 0;
}

export { SYSTEM_ACTOR };
