/**
 * End-to-end order, payment-webhook, refund and Clover sync scenarios (section 16).
 * Needs a local Postgres (DATABASE_URL on localhost). Stripe and Clover are not
 * contacted: Stripe events are signed locally, Clover is a local mock server.
 */
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db, pool } from "../src/server/db";
import {
  cloverConnections,
  cloverItemMappings,
  cloverOutbound,
  integrationEvents,
  orderItems,
  orders,
  refunds,
  stockMovements,
  stockReservations,
} from "../src/server/db/schema";
import { reserveForOrder } from "../src/server/inventory";
import { markPaidFromSession, applyRefundStatus, cancelPendingOrder } from "../src/server/orders/lifecycle";
import { processEvent, recordEvent } from "../src/server/events";
import { encrypt } from "../src/server/crypto";
import { pushPending, refreshItems, reconcile } from "../src/server/clover/sync";
import { balance, makeLocation, makeVariant, resetDb } from "./helpers";
import { randomUUID } from "node:crypto";

process.env.STRIPE_SECRET_KEY ??= "sk_test_dummy";
process.env.STRIPE_WEBHOOK_SECRET ??= "whsec_test";

/* ---------------- mock Clover ---------------- */
const cloverStock = new Map<string, number>();
const cloverOrders = new Map<string, string[]>();
let cloverServer: http.Server;

function startMockClover(): Promise<number> {
  return new Promise((resolve) => {
    cloverServer = http.createServer((req, res) => {
      const url = new URL(req.url!, "http://x");
      const m = url.pathname.match(/^\/v3\/merchants\/([^/]+)\/(.+)$/);
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        res.setHeader("content-type", "application/json");
        if (!m) return res.writeHead(404).end("{}");
        const rest = m[2];
        let mm;
        if ((mm = rest.match(/^item_stocks\/(.+)$/))) {
          const id = mm[1];
          if (!cloverStock.has(id)) return res.writeHead(404).end("{}");
          if (req.method === "POST") cloverStock.set(id, JSON.parse(body).quantity);
          return res.end(JSON.stringify({ item: { id }, quantity: cloverStock.get(id), stockCount: cloverStock.get(id) }));
        }
        if (rest.startsWith("items")) {
          const elements = [...cloverStock.entries()].map(([id, q]) => ({ id, name: `Item ${id}`, sku: id, price: 1000, itemStock: { quantity: q } }));
          return res.end(JSON.stringify({ elements }));
        }
        if ((mm = rest.match(/^orders\/([^?]+)/))) {
          const items = cloverOrders.get(mm[1]) ?? [];
          return res.end(JSON.stringify({ lineItems: { elements: items.map((i) => ({ item: { id: i } })) } }));
        }
        res.writeHead(404).end("{}");
      });
    });
    cloverServer.listen(0, () => resolve((cloverServer.address() as { port: number }).port));
  });
}

/* ---------------- helpers ---------------- */
async function pendingOrder(variantId: string, qty: number, locationId: string, priceCents = 12999) {
  const [o] = await db()
    .insert(orders)
    .values({
      number: `T-${randomUUID().slice(0, 8)}`,
      email: "buyer@example.com",
      fulfillmentMethod: "ship",
      subtotalCents: priceCents * qty,
      totalCents: priceCents * qty,
      stripeCheckoutSessionId: `cs_test_${randomUUID()}`,
    })
    .returning();
  await db().insert(orderItems).values({
    orderId: o.id,
    variantId,
    sku: "SKU",
    productTitle: "Wig",
    unitPriceCents: priceCents,
    quantity: qty,
    lineTotalCents: priceCents * qty,
  });
  await db().transaction((tx) => reserveForOrder(tx, o.id, [{ variantId, quantity: qty }], locationId, new Date(Date.now() + 35 * 60_000)));
  return o;
}

function session(order: typeof orders.$inferSelect, overrides: Partial<Stripe.Checkout.Session> = {}) {
  return {
    id: order.stripeCheckoutSessionId!,
    object: "checkout.session",
    client_reference_id: order.id,
    metadata: { order_id: order.id, order_number: order.number },
    payment_status: "paid",
    status: "complete",
    amount_subtotal: order.subtotalCents,
    amount_total: order.subtotalCents + 795 + 900,
    total_details: { amount_discount: 0, amount_shipping: 795, amount_tax: 900 },
    payment_intent: `pi_${randomUUID().slice(0, 12)}`,
    customer_details: { email: "buyer@example.com", name: "Test Buyer" },
    collected_information: {
      shipping_details: { name: "Test Buyer", address: { line1: "1 Main St", city: "Garner", state: "NC", postal_code: "27529", country: "US" } },
    },
    shipping_cost: null,
    payment_method_types: ["card"],
    ...overrides,
  } as unknown as Stripe.Checkout.Session;
}

describe("orders, payments and Clover", () => {
  let locationId: string;
  let port: number;
  before(async () => {
    if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Tests must run against a local database");
    port = await startMockClover();
    process.env.CLOVER_API_BASE_OVERRIDE = `http://127.0.0.1:${port}`;
    process.env.CLOVER_APP_ID = "app";
    process.env.CLOVER_APP_SECRET = "secret";
  });
  beforeEach(async () => {
    await resetDb();
    locationId = (await makeLocation()).id;
    cloverStock.clear();
  });
  after(async () => {
    cloverServer.close();
    await pool().end();
    setTimeout(() => process.exit(0), 100).unref();
  });

  it("verified payment webhook marks the order paid and commits stock exactly once (duplicate delivery)", async () => {
    const v = await makeVariant(locationId, 10);
    const o = await pendingOrder(v.id, 1, locationId);
    const event = { id: `evt_${randomUUID()}`, type: "checkout.session.completed", data: { object: session(o) } };

    // Signed like Stripe does, verified by the real verification code path.
    const payload = JSON.stringify(event);
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET! });
    const verified = new Stripe("sk_test_x").webhooks.constructEvent(payload, header, process.env.STRIPE_WEBHOOK_SECRET!);
    assert.equal(verified.id, event.id);
    assert.throws(() => new Stripe("sk_test_x").webhooks.constructEvent(payload, header, "whsec_wrong"));

    const id1 = await recordEvent("stripe", event.id, event.type, event);
    const id2 = await recordEvent("stripe", event.id, event.type, event); // same event delivered again
    assert.ok(id1);
    assert.equal(id2, null);
    await processEvent(id1!);
    // A different event id for the same session (Stripe can send both completed + async succeeded).
    await markPaidFromSession(session(o));

    const paid = await db().query.orders.findFirst({ where: eq(orders.id, o.id) });
    assert.equal(paid!.status, "paid");
    assert.equal(paid!.paymentStatus, "paid");
    assert.equal(paid!.taxCents, 900);
    assert.equal(paid!.shippingAddress?.zip, "27529");
    const b = await balance(v.id);
    assert.equal(b.onHand, 9);
    assert.equal(b.reserved, 0);
    const moves = await db().select().from(stockMovements).where(eq(stockMovements.variantId, v.id));
    assert.equal(moves.length, 1);
    const ev = await db().query.integrationEvents.findFirst({ where: eq(integrationEvents.id, id1!) });
    assert.equal(ev!.status, "processed");
  });

  it("an unpaid (delayed method) completed session leaves the order unpaid until confirmed", async () => {
    const v = await makeVariant(locationId, 3);
    const o = await pendingOrder(v.id, 1, locationId);
    const evt = { id: `evt_${randomUUID()}`, type: "checkout.session.completed", data: { object: session(o, { payment_status: "unpaid" }) } };
    const id = await recordEvent("stripe", evt.id, evt.type, evt);
    await processEvent(id!);
    const row = await db().query.orders.findFirst({ where: eq(orders.id, o.id) });
    assert.equal(row!.paymentStatus, "unpaid");
    assert.equal(row!.status, "pending_payment");
    assert.equal((await balance(v.id)).reserved, 1);
  });

  it("expired checkout releases the hold; a late payment for sold-out stock becomes an exception, never an oversell", async () => {
    const v = await makeVariant(locationId, 1);
    const late = await pendingOrder(v.id, 1, locationId);
    await cancelPendingOrder(late.id, "expired");
    assert.equal((await balance(v.id)).reserved, 0);

    const other = await pendingOrder(v.id, 1, locationId);
    await markPaidFromSession(session(other));
    assert.equal((await balance(v.id)).onHand, 0);

    await markPaidFromSession(session(late));
    const o = await db().query.orders.findFirst({ where: eq(orders.id, late.id) });
    assert.equal(o!.status, "exception");
    assert.equal((await balance(v.id)).onHand, 0);
  });

  it("refund restocks only the items staff chose, once", async () => {
    const v = await makeVariant(locationId, 5);
    const o = await pendingOrder(v.id, 2, locationId);
    await markPaidFromSession(session(o));
    assert.equal((await balance(v.id)).onHand, 3);
    const item = (await db().select().from(orderItems).where(eq(orderItems.orderId, o.id)))[0];
    const [r] = await db()
      .insert(refunds)
      .values({ orderId: o.id, amountCents: 12999, reason: "Returned unopened", status: "pending", restockItems: [{ orderItemId: item.id, quantity: 1 }], idempotencyKey: "k1" })
      .returning();
    const refund = { id: "re_1", object: "refund", amount: 12999, status: "succeeded", metadata: { order_id: o.id, refund_id: r.id } } as unknown as Stripe.Refund;
    await applyRefundStatus(refund);
    await applyRefundStatus(refund); // webhook duplicate
    assert.equal((await balance(v.id)).onHand, 4);
    const ord = await db().query.orders.findFirst({ where: eq(orders.id, o.id) });
    assert.equal(ord!.paymentStatus, "partially_refunded");
    assert.equal(ord!.refundedCents, 12999);
  });

  it("Clover: in-store sale updates the website; online sale is written to Clover; no double counting", async () => {
    const v = await makeVariant(locationId, 0);
    cloverStock.set("ITEM1", 10);
    await db().insert(cloverConnections).values({ merchantId: "M1", environment: "sandbox", accessTokenEnc: encrypt("tok") });
    await db().insert(cloverItemMappings).values({ merchantId: "M1", cloverItemId: "ITEM1", variantId: v.id, cloverName: "Wig", syncStatus: "ok" });

    // Initial sync: website takes Clover's quantity.
    await refreshItems("M1", ["ITEM1"], "test");
    assert.equal((await balance(v.id)).onHand, 10);

    // Online sale of 1 → local 9, outbound queued.
    const o = await pendingOrder(v.id, 1, locationId);
    await markPaidFromSession(session(o));
    assert.equal((await balance(v.id)).onHand, 9);
    const queued = await db().select().from(cloverOutbound);
    assert.equal(queued.length, 1);

    // Clover webhook arrives BEFORE the push (Clover still says 10): pending delta keeps local at 9.
    await refreshItems("M1", ["ITEM1"], "webhook");
    assert.equal((await balance(v.id)).onHand, 9);

    // Push writes 9 to Clover; the echo webhook changes nothing.
    await pushPending();
    assert.equal(cloverStock.get("ITEM1"), 9);
    await refreshItems("M1", ["ITEM1"], "echo");
    assert.equal((await balance(v.id)).onHand, 9);

    // In-store sale of 2 in Clover → order webhook → website 7.
    cloverStock.set("ITEM1", 7);
    cloverOrders.set("ORD1", ["ITEM1"]);
    const evt = { merchantId: "M1", update: { objectId: "O:ORD1", type: "CREATE" as const, ts: Date.now() } };
    const id = await recordEvent("clover", "e1", "O:CREATE", evt);
    await processEvent(id!);
    assert.equal((await balance(v.id)).onHand, 7);

    // Reconciliation agrees, records no discrepancy.
    const rec = await reconcile("test");
    assert.equal(rec!.discrepancies.length, 0);

    // A missed webhook (Clover silently at 5) is corrected by reconciliation and reported.
    cloverStock.set("ITEM1", 5);
    const rec2 = await reconcile("test");
    assert.equal(rec2!.discrepancies.length, 1);
    assert.equal((await balance(v.id)).onHand, 5);
    const posMoves = await db().select().from(stockMovements).where(eq(stockMovements.variantId, v.id));
    assert.ok(posMoves.every((m) => m.idempotencyKey === null || m.movementType === "sale_online"));
    void stockReservations;
  });
});
