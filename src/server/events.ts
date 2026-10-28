/**
 * Durable webhook pipeline (section 5.2):
 *   verify → durable event record → idempotent processing → inventory/order update
 *   → retry/reconciliation → alerts
 */
import { and, asc, eq, inArray, lt, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { db } from "./db";
import { integrationEvents } from "./db/schema";
import { enqueue } from "./queue";
import { raiseAlert } from "./audit";
import { applyRefundStatus, cancelPendingOrder, markDisputed, markPaidFromSession } from "./orders/lifecycle";
import { refreshFromOrder, refreshItems } from "./clover/sync";
import type Stripe from "stripe";

const MAX_ATTEMPTS = 10;

/** Store a verified event once. Returns the row id, or null if it was a duplicate delivery. */
export async function recordEvent(provider: "stripe" | "clover", externalId: string, type: string, payload: unknown) {
  const [row] = await db()
    .insert(integrationEvents)
    .values({ provider, externalEventId: externalId, eventType: type, payload: payload as object })
    .onConflictDoNothing()
    .returning({ id: integrationEvents.id });
  return row?.id ?? null;
}

export function cloverEventId(merchantId: string, u: { objectId: string; type: string; ts: number }) {
  return createHash("sha256").update(`${merchantId}|${u.objectId}|${u.type}|${u.ts}`).digest("hex").slice(0, 40);
}

/** Process one stored event. Safe to call repeatedly: handlers are idempotent. */
export async function processEvent(eventId: string) {
  const claimed = await db()
    .update(integrationEvents)
    .set({ status: "processing", attemptCount: sql`${integrationEvents.attemptCount} + 1` })
    .where(and(eq(integrationEvents.id, eventId), inArray(integrationEvents.status, ["pending", "failed"])))
    .returning();
  const ev = claimed[0];
  if (!ev) return;

  try {
    const outcome = ev.provider === "stripe" ? await handleStripe(ev.payload as Stripe.Event) : await handleClover(ev.payload as CloverPayload);
    await db()
      .update(integrationEvents)
      .set({ status: outcome === "ignored" ? "ignored" : "processed", processedAt: new Date(), errorSummary: null })
      .where(eq(integrationEvents.id, ev.id));
  } catch (err) {
    const msg = (err instanceof Error ? err.message : String(err)).slice(0, 500);
    const attempts = ev.attemptCount;
    const giveUp = attempts >= MAX_ATTEMPTS;
    await db()
      .update(integrationEvents)
      .set({
        status: "failed",
        errorSummary: msg,
        nextAttemptAt: new Date(Date.now() + Math.min(2 ** attempts * 10_000, 3_600_000)),
      })
      .where(eq(integrationEvents.id, ev.id));
    if (giveUp) {
      await raiseAlert({
        kind: "event_failed",
        severity: "critical",
        message: `A ${ev.provider} event (${ev.eventType}) failed ${attempts} times: ${msg}`,
        dedupeKey: `event_failed:${ev.id}`,
        context: { eventId: ev.id },
      });
    }
    throw err;
  }
}

/** Sweeper: picks up events whose queue job was lost or that are due for retry. */
export async function sweepEvents(limit = 50) {
  const due = await db()
    .select({ id: integrationEvents.id })
    .from(integrationEvents)
    .where(
      and(
        inArray(integrationEvents.status, ["pending", "failed"]),
        lt(integrationEvents.nextAttemptAt, new Date()),
        lt(integrationEvents.attemptCount, MAX_ATTEMPTS),
        lt(integrationEvents.receivedAt, new Date(Date.now() - 30_000)),
      ),
    )
    .orderBy(asc(integrationEvents.receivedAt))
    .limit(limit);
  for (const e of due) {
    await processEvent(e.id).catch(() => {});
  }
  // Events stuck in "processing" (worker died mid-job) go back to pending.
  await db()
    .update(integrationEvents)
    .set({ status: "pending" })
    .where(
      and(
        eq(integrationEvents.status, "processing"),
        sql`${integrationEvents.receivedAt} < now() - interval '10 minutes'`,
        sql`${integrationEvents.processedAt} is null`,
      ),
    );
  return due.length;
}

export async function dispatchEvent(eventId: string) {
  await enqueue("events:process", { eventId }, { jobId: `event:${eventId}` });
}

/* ------------------------------------------------------------------ */

async function handleStripe(event: Stripe.Event): Promise<"done" | "ignored"> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.payment_status === "paid" || session.payment_status === "no_payment_required") {
        await markPaidFromSession(session);
      }
      // "unpaid" = delayed method (e.g. ACH); wait for async_payment_succeeded.
      return "done";
    }
    case "checkout.session.async_payment_succeeded":
      await markPaidFromSession(event.data.object as Stripe.Checkout.Session);
      return "done";
    case "checkout.session.async_payment_failed": {
      const s = event.data.object as Stripe.Checkout.Session;
      const id = s.metadata?.order_id ?? s.client_reference_id;
      if (id) await cancelPendingOrder(id, "payment_failed");
      return "done";
    }
    case "checkout.session.expired": {
      const s = event.data.object as Stripe.Checkout.Session;
      const id = s.metadata?.order_id ?? s.client_reference_id;
      if (id) await cancelPendingOrder(id, "expired");
      return "done";
    }
    case "refund.created":
    case "refund.updated":
    case "refund.failed":
      await applyRefundStatus(event.data.object as Stripe.Refund);
      return "done";
    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      for (const r of charge.refunds?.data ?? []) {
        await applyRefundStatus({ ...r, metadata: { ...(charge.metadata ?? {}), ...(r.metadata ?? {}) } } as Stripe.Refund);
      }
      return "done";
    }
    case "charge.dispute.created":
      await markDisputed(event.data.object as Stripe.Dispute);
      return "done";
    default:
      return "ignored";
  }
}

export type CloverPayload = {
  merchantId: string;
  update: { objectId: string; type: "CREATE" | "UPDATE" | "DELETE"; ts: number };
};

async function handleClover(p: CloverPayload): Promise<"done" | "ignored"> {
  const [kind, id] = p.update.objectId.split(":");
  if (!id) return "ignored";
  if (kind === "I") {
    await refreshItems(p.merchantId, [id], `${p.update.type.toLowerCase()} in Clover`);
    return "done";
  }
  if (kind === "O") {
    if (p.update.type === "DELETE") return "ignored";
    await refreshFromOrder(p.merchantId, id);
    return "done";
  }
  return "ignored";
}
