/**
 * Must-pass inventory scenarios from section 16 of the architecture document.
 * Run: npm test  (needs DATABASE_URL pointing at a disposable database)
 */
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db, pool } from "../src/server/db";
import { stockMovements } from "../src/server/db/schema";
import {
  availableToSell,
  changeStock,
  commitReservations,
  OutOfStockError,
  releaseReservations,
  reReserveAndCommit,
  reserveForOrder,
} from "../src/server/inventory";
import { balance, makeLocation, makeOrder, makeVariant, resetDb } from "./helpers";

const soon = () => new Date(Date.now() + 30 * 60_000);

describe("inventory engine", () => {
  let locationId: string;

  before(async () => {
    if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Tests must run against a local database");
  });
  beforeEach(async () => {
    await resetDb();
    locationId = (await makeLocation()).id;
  });
  after(async () => {
    await pool().end();
  });

  it("10 wigs, one online purchase: reserve shows 9, commit leaves on_hand 9 with exactly one movement", async () => {
    const v = await makeVariant(locationId, 10);
    const order = await makeOrder();

    await db().transaction((tx) => reserveForOrder(tx, order.id, [{ variantId: v.id, quantity: 1 }], locationId, soon()));
    let b = await balance(v.id);
    assert.equal(b.onHand, 10);
    assert.equal(b.reserved, 1);
    assert.equal(availableToSell(b), 9);

    await db().transaction((tx) => commitReservations(tx, order.id));
    b = await balance(v.id);
    assert.equal(b.onHand, 9);
    assert.equal(b.reserved, 0);

    // Duplicate payment webhook: committing again must change nothing.
    await db().transaction((tx) => commitReservations(tx, order.id));
    b = await balance(v.id);
    assert.equal(b.onHand, 9);
    const moves = await db().select().from(stockMovements).where(eq(stockMovements.variantId, v.id));
    assert.equal(moves.length, 1);
    assert.equal(moves[0].quantityDelta, -1);
    assert.equal(moves[0].sourceId, order.id);
  });

  it("concurrency: 40 customers race for the last unit, exactly one reservation succeeds", async () => {
    const v = await makeVariant(locationId, 1);
    const attempts = await Promise.allSettled(
      Array.from({ length: 40 }, async () => {
        const order = await makeOrder();
        await db().transaction((tx) =>
          reserveForOrder(tx, order.id, [{ variantId: v.id, quantity: 1 }], locationId, soon()),
        );
      }),
    );
    const ok = attempts.filter((a) => a.status === "fulfilled").length;
    const outOfStock = attempts.filter(
      (a) => a.status === "rejected" && a.reason instanceof OutOfStockError,
    ).length;
    assert.equal(ok, 1);
    assert.equal(outOfStock, 39);
    const b = await balance(v.id);
    assert.equal(b.reserved, 1);
    assert.equal(availableToSell(b), 0);
  });

  it("safety stock is withheld from online sale", async () => {
    const v = await makeVariant(locationId, 3, 1);
    const order = await makeOrder();
    await assert.rejects(
      db().transaction((tx) => reserveForOrder(tx, order.id, [{ variantId: v.id, quantity: 3 }], locationId, soon())),
      OutOfStockError,
    );
    await db().transaction((tx) => reserveForOrder(tx, order.id, [{ variantId: v.id, quantity: 2 }], locationId, soon()));
    assert.equal(availableToSell(await balance(v.id)), 0);
  });

  it("multi-line orders are all-or-nothing", async () => {
    const a = await makeVariant(locationId, 5);
    const b = await makeVariant(locationId, 0);
    const order = await makeOrder();
    await assert.rejects(
      db().transaction((tx) =>
        reserveForOrder(
          tx,
          order.id,
          [
            { variantId: a.id, quantity: 2 },
            { variantId: b.id, quantity: 1 },
          ],
          locationId,
          soon(),
        ),
      ),
      OutOfStockError,
    );
    assert.equal((await balance(a.id)).reserved, 0);
  });

  it("payment failure/abandonment releases the reservation and stock becomes available again", async () => {
    const v = await makeVariant(locationId, 2);
    const order = await makeOrder();
    await db().transaction((tx) => reserveForOrder(tx, order.id, [{ variantId: v.id, quantity: 2 }], locationId, soon()));
    assert.equal(availableToSell(await balance(v.id)), 0);
    await db().transaction((tx) => releaseReservations(tx, order.id, "expired"));
    assert.equal(availableToSell(await balance(v.id)), 2);
    // releasing twice is harmless
    await db().transaction((tx) => releaseReservations(tx, order.id, "expired"));
    assert.equal((await balance(v.id)).reserved, 0);
  });

  it("late payment after expiry re-reserves when stock exists, and refuses when it was sold", async () => {
    const v = await makeVariant(locationId, 1);
    const late = await makeOrder();
    await db().transaction((tx) => reserveForOrder(tx, late.id, [{ variantId: v.id, quantity: 1 }], locationId, soon()));
    await db().transaction((tx) => releaseReservations(tx, late.id, "expired"));

    // Someone else buys the last unit in the meantime.
    const other = await makeOrder();
    await db().transaction((tx) => reserveForOrder(tx, other.id, [{ variantId: v.id, quantity: 1 }], locationId, soon()));
    await db().transaction((tx) => commitReservations(tx, other.id));

    const res = await db().transaction((tx) => reReserveAndCommit(tx, late.id, [{ variantId: v.id, quantity: 1 }], locationId));
    assert.equal(res.ok, false);
    assert.equal((await balance(v.id)).onHand, 0); // never silently oversold

    // With stock back, the late order goes through.
    await db().transaction((tx) =>
      changeStock(tx, { variantId: v.id, locationId, delta: 1, type: "adjustment", sourceType: "test", reason: "found one" }),
    );
    const res2 = await db().transaction((tx) => reReserveAndCommit(tx, late.id, [{ variantId: v.id, quantity: 1 }], locationId));
    assert.equal(res2.ok, true);
    assert.equal((await balance(v.id)).onHand, 0);
  });

  it("changeStock with an idempotency key applies once", async () => {
    const v = await makeVariant(locationId, 5);
    for (let i = 0; i < 3; i++) {
      await db().transaction((tx) =>
        changeStock(tx, {
          variantId: v.id,
          locationId,
          delta: 2,
          type: "return_restock",
          sourceType: "refund",
          idempotencyKey: "refund:abc:restock",
          reason: "restock",
        }),
      );
    }
    assert.equal((await balance(v.id)).onHand, 7);
  });
});
