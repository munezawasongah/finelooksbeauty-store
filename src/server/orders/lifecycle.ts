/**
 * Order state machine — sections 6.3, 7.1 (steps 11–13) and 16.
 * Verified Stripe webhook events, never the browser redirect, move an order to paid.
 * Every transition locks the order row, so duplicate or concurrent deliveries are no-ops.
 */
import { and, eq, sql } from "drizzle-orm";
import { db, type Tx } from "../db";
import {
  cartItems,
  carts,
  cloverItemMappings,
  cloverOutbound,
  discounts,
  orderEvents,
  orderItems,
  orders,
  payments,
  refunds,
} from "../db/schema";
import {
  changeStock,
  commitReservations,
  defaultLocationId,
  releaseReservations,
  reReserveAndCommit,
} from "../inventory";
import { audit, raiseAlert, SYSTEM_ACTOR, type Actor } from "../audit";
import { enqueue } from "../queue";
import { stripe } from "../payments/stripe";
import type Stripe from "stripe";

export type OrderRow = typeof orders.$inferSelect;
export type OrderStatus = OrderRow["status"];

/** Allowed manual fulfillment transitions (staff dashboard). */
export const NEXT_STATUSES: Partial<Record<OrderStatus, OrderStatus[]>> = {
  paid: ["processing", "ready_for_pickup", "shipped", "cancelled"],
  processing: ["ready_for_pickup", "shipped", "cancelled"],
  ready_for_pickup: ["delivered", "processing"],
  shipped: ["delivered"],
  exception: ["processing", "cancelled"],
};

async function lockOrder(tx: Tx, orderId: string) {
  const [o] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
  return o ?? null;
}

async function event(
  tx: Tx,
  orderId: string,
  type: string,
  from: string | null,
  to: string | null,
  note?: string,
  actorUserId?: string | null,
) {
  await tx.insert(orderEvents).values({ orderId, type, fromStatus: from, toStatus: to, note, actorUserId: actorUserId ?? null });
}

/** Queue Clover writes for website sales of mapped SKUs (same transaction as the stock movement). */
export async function queueCloverPushes(
  tx: Tx,
  movements: { variantId: string; delta: number; movementId: number }[],
) {
  for (const m of movements) {
    const map = await tx.query.cloverItemMappings.findFirst({ where: eq(cloverItemMappings.variantId, m.variantId) });
    if (!map || map.syncStatus === "unmapped" || !map.stockTracked) continue;
    await tx
      .insert(cloverOutbound)
      .values({
        merchantId: map.merchantId,
        cloverItemId: map.cloverItemId,
        variantId: m.variantId,
        quantityDelta: m.delta,
        sourceKey: `movement:${m.movementId}`,
      })
      .onConflictDoNothing();
  }
}

/* ------------------------------------------------------------------ */
/* Payment confirmed                                                   */
/* ------------------------------------------------------------------ */

export async function markPaidFromSession(session: Stripe.Checkout.Session) {
  const orderId = session.metadata?.order_id ?? session.client_reference_id;
  if (!orderId) throw new Error(`Checkout session ${session.id} has no order reference`);

  const shipping = session.collected_information?.shipping_details ?? null;
  const pi = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;

  const result = await db().transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (!order) throw new Error(`Order ${orderId} not found for session ${session.id}`);
    if (order.paymentStatus === "paid" || order.paymentStatus === "refunded" || order.paymentStatus === "partially_refunded") {
      return { already: true, order };
    }
    if (session.amount_total == null) throw new Error("Session has no amount_total");

    // Cross-check the charged amount against what we priced (before tax and shipping).
    const expectedBeforeTaxShip = order.subtotalCents - order.discountCents;
    const chargedBeforeTaxShip =
      (session.amount_subtotal ?? 0) - (session.total_details?.amount_discount ?? 0);
    const amountMismatch = chargedBeforeTaxShip !== expectedBeforeTaxShip;

    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    let movements = await commitReservations(tx, orderId);
    let stockProblem = false;
    if (movements.length === 0) {
      // No active reservation: either already committed (not possible here: unpaid) or expired/released.
      const late = await reReserveAndCommit(
        tx,
        orderId,
        items.filter((i) => i.variantId).map((i) => ({ variantId: i.variantId!, quantity: i.quantity })),
        await defaultLocationId(tx),
      );
      movements = late.movements;
      stockProblem = !late.ok;
    }

    const status: OrderStatus = stockProblem || amountMismatch ? "exception" : "paid";
    await tx
      .update(orders)
      .set({
        status,
        paymentStatus: "paid",
        paidAt: new Date(),
        stripePaymentIntentId: pi,
        email: session.customer_details?.email?.toLowerCase() ?? order.email,
        customerName: order.customerName || session.customer_details?.name || null,
        phone: order.phone ?? session.customer_details?.phone ?? null,
        taxCents: session.total_details?.amount_tax ?? 0,
        shippingCents: session.total_details?.amount_shipping ?? 0,
        totalCents: session.amount_total,
        shippingLabel:
          order.fulfillmentMethod === "ship" && session.shipping_cost?.shipping_rate
            ? await shippingRateName(session.shipping_cost.shipping_rate)
            : order.fulfillmentMethod === "pickup"
              ? "In-store pickup"
              : null,
        shippingAddress:
          order.fulfillmentMethod === "ship" && shipping?.address
            ? {
                name: shipping.name ?? order.customerName ?? "",
                line1: shipping.address.line1 ?? "",
                line2: shipping.address.line2 ?? null,
                city: shipping.address.city ?? "",
                state: shipping.address.state ?? "",
                zip: shipping.address.postal_code ?? "",
                country: shipping.address.country ?? "US",
                phone: session.customer_details?.phone ?? null,
              }
            : null,
        exceptionReason: stockProblem
          ? "Paid after the stock hold expired and the item has since sold. Refund or source the item."
          : amountMismatch
            ? `Charged subtotal ${chargedBeforeTaxShip} ≠ expected ${expectedBeforeTaxShip}. Review before fulfilling.`
            : null,
        reservationExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId));

    await tx
      .insert(payments)
      .values({
        orderId,
        providerRef: pi ?? session.id,
        amountCents: session.amount_total,
        status: "succeeded",
        paymentMethodType: session.payment_method_types?.[0] ?? null,
      })
      .onConflictDoNothing();

    await event(tx, orderId, "payment_succeeded", order.status, status, `Paid ${(session.amount_total / 100).toFixed(2)} USD`);
    if (stockProblem) {
      await raiseAlert(
        {
          kind: "late_payment_no_stock",
          severity: "critical",
          message: `Order ${order.number} was paid after its stock hold expired and an item is no longer available. Refund or source the item.`,
          dedupeKey: `late_payment:${orderId}`,
          context: { orderId },
        },
        tx,
      );
    }
    if (amountMismatch) {
      await raiseAlert(
        {
          kind: "payment_amount_mismatch",
          severity: "critical",
          message: `Order ${order.number}: amount charged does not match the order total. Review in Stripe.`,
          dedupeKey: `amount_mismatch:${orderId}`,
          context: { orderId, expected: expectedBeforeTaxShip, charged: chargedBeforeTaxShip },
        },
        tx,
      );
    }
    if (order.discountCode) {
      await tx
        .update(discounts)
        .set({ usedCount: sql`${discounts.usedCount} + 1` })
        .where(sql`upper(${discounts.code}) = upper(${order.discountCode})`);
    }
    if (order.cartId) {
      await tx.delete(cartItems).where(eq(cartItems.cartId, order.cartId));
      await tx.update(carts).set({ discountCode: null }).where(eq(carts.id, order.cartId));
    }
    await queueCloverPushes(tx, movements);
    return { already: false, order: { ...order, status } };
  });

  if (!result.already) {
    await enqueue("clover:push", {});
    if (result.order.email) {
      await enqueue("email:send", {
        template: "order_confirmation",
        to: result.order.email,
        data: { orderId },
      });
    }
    await enqueue("email:send", { template: "staff_new_order", to: "__staff__", data: { orderId } });
  }
  return result;
}

async function shippingRateName(rate: string | Stripe.ShippingRate) {
  if (typeof rate !== "string") return rate.display_name ?? null;
  try {
    const r = await stripe().shippingRates.retrieve(rate);
    return r.display_name ?? null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Payment failed / abandoned                                          */
/* ------------------------------------------------------------------ */

export async function cancelPendingOrder(orderId: string, reason: "expired" | "payment_failed" | "customer_cancelled") {
  return db().transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (!order || order.status !== "pending_payment") return false;
    await releaseReservations(tx, orderId, reason === "expired" ? "expired" : "released");
    await tx
      .update(orders)
      .set({
        status: "cancelled",
        paymentStatus: reason === "payment_failed" ? "failed" : order.paymentStatus,
        cancelledAt: new Date(),
        reservationExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId));
    const notes = {
      expired: "Checkout expired — stock released",
      payment_failed: "Payment failed — stock released",
      customer_cancelled: "Customer left checkout — stock released",
    };
    await event(tx, orderId, reason, "pending_payment", "cancelled", notes[reason]);
    return true;
  });
}

/** Release holds whose time ran out (worker, every minute). Expires the Stripe session first. */
export async function expireOverdueOrders(orderIds: string[]) {
  for (const id of orderIds) {
    const order = await db().query.orders.findFirst({ where: eq(orders.id, id) });
    if (!order) continue;
    if (order.status !== "pending_payment") {
      // Reservation left active on a non-pending order: release it.
      await db().transaction((tx) => releaseReservations(tx, id, "expired"));
      continue;
    }
    if (order.stripeCheckoutSessionId) {
      try {
        const s = await stripe().checkout.sessions.retrieve(order.stripeCheckoutSessionId);
        if (s.status === "complete") continue; // the paid webhook will arrive (or be swept) and commit
        if (s.status === "open") await stripe().checkout.sessions.expire(s.id);
      } catch (err) {
        console.error("[expire] could not check Stripe session", order.number, err);
        continue; // try again next minute rather than risk releasing a paid order
      }
    }
    await cancelPendingOrder(id, "expired");
  }
}

/* ------------------------------------------------------------------ */
/* Fulfillment                                                          */
/* ------------------------------------------------------------------ */

export async function updateFulfillment(
  actor: Actor,
  orderId: string,
  to: OrderStatus,
  extra: { carrier?: string | null; trackingNumber?: string | null; note?: string | null } = {},
) {
  const res = await db().transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (!order) throw new Error("Order not found");
    const allowed = NEXT_STATUSES[order.status] ?? [];
    if (!allowed.includes(to)) throw new Error(`Can't move an order from ${order.status} to ${to}.`);
    if (to === "ready_for_pickup" && order.fulfillmentMethod !== "pickup") throw new Error("This order is for shipping.");
    if (to === "shipped" && order.fulfillmentMethod !== "ship") throw new Error("This order is for pickup.");
    if (to === "cancelled" && order.paymentStatus === "paid") {
      throw new Error("Refund the payment first; the order is cancelled as part of a full refund.");
    }
    await tx
      .update(orders)
      .set({
        status: to,
        carrier: extra.carrier ?? order.carrier,
        trackingNumber: extra.trackingNumber ?? order.trackingNumber,
        fulfilledAt: to === "shipped" || to === "delivered" ? new Date() : order.fulfilledAt,
        exceptionReason: to === "processing" ? null : order.exceptionReason,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId));
    await event(tx, orderId, "status_changed", order.status, to, extra.note ?? undefined, actor.userId);
    await audit(actor, "order.status", "order", orderId, { from: order.status, to, ...extra }, tx);
    return { order, to };
  });
  if (res.order.email && (to === "shipped" || to === "ready_for_pickup")) {
    await enqueue("email:send", {
      template: to === "shipped" ? "order_shipped" : "order_ready_for_pickup",
      to: res.order.email,
      data: { orderId },
    });
  }
}

/* ------------------------------------------------------------------ */
/* Refunds (section 7.2: recorded only after provider confirmation)     */
/* ------------------------------------------------------------------ */

export async function createRefund(
  actor: Actor,
  input: {
    orderId: string;
    amountCents: number;
    reason: string;
    restock: { orderItemId: string; quantity: number }[];
    idempotencyKey: string;
  },
) {
  const order = await db().query.orders.findFirst({ where: eq(orders.id, input.orderId) });
  if (!order) throw new Error("Order not found");
  if (!order.stripePaymentIntentId) throw new Error("This order has no captured payment to refund.");
  const refundable = order.totalCents - order.refundedCents;
  if (input.amountCents <= 0 || input.amountCents > refundable) {
    throw new Error(`Refund must be between $0.01 and $${(refundable / 100).toFixed(2)}.`);
  }

  const existing = await db().query.refunds.findFirst({ where: eq(refunds.idempotencyKey, input.idempotencyKey) });
  if (existing) return existing;

  const [row] = await db()
    .insert(refunds)
    .values({
      orderId: order.id,
      amountCents: input.amountCents,
      reason: input.reason,
      status: "pending",
      restockItems: input.restock.filter((r) => r.quantity > 0),
      actorUserId: actor.userId,
      idempotencyKey: input.idempotencyKey,
    })
    .returning();
  await audit(actor, "refund.requested", "order", order.id, { amountCents: input.amountCents, reason: input.reason, refundId: row.id });

  const r = await stripe().refunds.create(
    {
      payment_intent: order.stripePaymentIntentId,
      amount: input.amountCents,
      reason: "requested_by_customer",
      metadata: { order_id: order.id, refund_id: row.id },
    },
    { idempotencyKey: `refund:${row.id}` },
  );
  await db().update(refunds).set({ providerRefundId: r.id, updatedAt: new Date() }).where(eq(refunds.id, row.id));
  await applyRefundStatus(r);
  return row;
}

/** Applies a Stripe refund object (from the API call or a refund.* / charge.refunded webhook). Idempotent. */
export async function applyRefundStatus(r: Stripe.Refund) {
  const refundRowId = r.metadata?.refund_id;
  const orderId = r.metadata?.order_id;
  if (!orderId) return;
  const mapped =
    r.status === "succeeded" ? "succeeded" : r.status === "failed" ? "failed" : r.status === "canceled" ? "canceled" : "pending";

  await db().transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (!order) return;
    let row = refundRowId
      ? await tx.query.refunds.findFirst({ where: eq(refunds.id, refundRowId) })
      : await tx.query.refunds.findFirst({ where: eq(refunds.providerRefundId, r.id) });
    if (!row) {
      // Refund made directly in the Stripe dashboard: record it without restocking.
      [row] = await tx
        .insert(refunds)
        .values({
          orderId,
          providerRefundId: r.id,
          amountCents: r.amount,
          reason: "Refunded in Stripe dashboard",
          status: "pending",
          idempotencyKey: `stripe:${r.id}`,
        })
        .returning();
    }
    if (row.status === "succeeded" || row.status === mapped) {
      if (row.providerRefundId !== r.id) await tx.update(refunds).set({ providerRefundId: r.id }).where(eq(refunds.id, row.id));
      return;
    }
    await tx
      .update(refunds)
      .set({ status: mapped, providerRefundId: r.id, updatedAt: new Date() })
      .where(eq(refunds.id, row.id));
    if (mapped !== "succeeded") {
      if (mapped === "failed") {
        await raiseAlert(
          { kind: "refund_failed", severity: "warning", message: `A refund on order ${order.number} failed in Stripe.`, context: { orderId } },
          tx,
        );
      }
      return;
    }

    const refunded = order.refundedCents + row.amountCents;
    const full = refunded >= order.totalCents;
    await tx
      .update(orders)
      .set({
        refundedCents: refunded,
        paymentStatus: full ? "refunded" : "partially_refunded",
        status: full && !["shipped", "delivered"].includes(order.status) ? "cancelled" : order.status,
        cancelledAt: full && !["shipped", "delivered"].includes(order.status) ? new Date() : order.cancelledAt,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId));
    await event(
      tx,
      orderId,
      "refund_succeeded",
      order.status,
      null,
      `Refunded ${(row.amountCents / 100).toFixed(2)} USD — ${row.reason}`,
      row.actorUserId,
    );

    // Restock only what staff chose under the returns policy (section 16: not automatic).
    const loc = await defaultLocationId(tx);
    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    const movements: { variantId: string; delta: number; movementId: number }[] = [];
    for (const rs of row.restockItems) {
      const item = items.find((i) => i.id === rs.orderItemId);
      if (!item?.variantId) continue;
      const qty = Math.min(rs.quantity, item.quantity - item.restockedQuantity);
      if (qty <= 0) continue;
      const res = await changeStock(tx, {
        variantId: item.variantId,
        locationId: loc,
        delta: qty,
        type: "return_restock",
        sourceType: "refund",
        sourceId: row.id,
        idempotencyKey: `refund:${row.id}:${item.id}:restock`,
        reason: `Returned to stock (order ${order.number})`,
        actor: row.actorUserId ? { userId: row.actorUserId, label: "refund" } : SYSTEM_ACTOR,
      });
      await tx
        .update(orderItems)
        .set({ restockedQuantity: item.restockedQuantity + qty })
        .where(eq(orderItems.id, item.id));
      if (res.movementId) movements.push({ variantId: item.variantId, delta: qty, movementId: res.movementId });
    }
    await queueCloverPushes(tx, movements);
  });
  await enqueue("clover:push", {});
  const order = await db().query.orders.findFirst({ where: eq(orders.id, orderId) });
  if (order?.email && mapped === "succeeded") {
    await enqueue("email:send", { template: "refund_issued", to: order.email, data: { orderId, amountCents: r.amount } });
  }
}

export async function markDisputed(dispute: Stripe.Dispute) {
  const pi = typeof dispute.payment_intent === "string" ? dispute.payment_intent : dispute.payment_intent?.id;
  if (!pi) return;
  const order = await db().query.orders.findFirst({ where: eq(orders.stripePaymentIntentId, pi) });
  if (!order) return;
  await db().transaction(async (tx) => {
    await tx.update(orders).set({ paymentStatus: "disputed", updatedAt: new Date() }).where(eq(orders.id, order.id));
    await event(tx, order.id, "dispute_opened", null, null, `Chargeback opened: ${dispute.reason}`);
    await raiseAlert(
      {
        kind: "dispute",
        severity: "critical",
        message: `Chargeback opened on order ${order.number} (${dispute.reason}). Respond in the Stripe dashboard before the deadline.`,
        dedupeKey: `dispute:${dispute.id}`,
        context: { orderId: order.id, disputeId: dispute.id },
      },
      tx,
    );
  });
}

export async function addOrderNote(actor: Actor, orderId: string, note: string) {
  await db().transaction(async (tx) => {
    await event(tx, orderId, "note", null, null, note, actor.userId);
    await audit(actor, "order.note", "order", orderId, { note }, tx);
  });
}

export { and };
