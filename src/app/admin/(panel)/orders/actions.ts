"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { assertStaff } from "@/server/auth/session";
import { addOrderNote, createRefund, updateFulfillment, type OrderStatus } from "@/server/orders/lifecycle";
import { randomToken } from "@/server/crypto";

export type ActionResult = { ok: boolean; message: string } | null;

const STATUSES = ["processing", "ready_for_pickup", "shipped", "delivered", "cancelled"] as const;

export async function changeStatus(_: ActionResult, form: FormData): Promise<ActionResult> {
  const parsed = z
    .object({
      orderId: z.string().uuid(),
      to: z.enum(STATUSES),
      carrier: z.string().max(40).optional(),
      trackingNumber: z.string().max(80).optional(),
      note: z.string().max(500).optional(),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: "Check the form." };
  const ctx = await assertStaff(parsed.data.to === "cancelled" ? "orders.cancel" : "orders.fulfill");
  try {
    await updateFulfillment(ctx.actor, parsed.data.orderId, parsed.data.to as OrderStatus, {
      carrier: parsed.data.carrier || null,
      trackingNumber: parsed.data.trackingNumber || null,
      note: parsed.data.note || null,
    });
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Could not update the order." };
  }
  refresh();
  return { ok: true, message: "Order updated." };
}

export async function issueRefund(_: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await assertStaff("refunds.create");
  const amount = Number(String(form.get("amount") ?? "").replace(/[$,]/g, ""));
  const reason = String(form.get("reason") ?? "").trim();
  const orderId = String(form.get("orderId") ?? "");
  const idem = String(form.get("idem") ?? "") || randomToken(12);
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, message: "Enter a refund amount." };
  if (reason.length < 3) return { ok: false, message: "Give a short reason (it is kept in the audit log)." };
  const restock: { orderItemId: string; quantity: number }[] = [];
  for (const [k, v] of form.entries()) {
    if (k.startsWith("restock:")) {
      const q = Math.max(0, Math.floor(Number(v)));
      if (q > 0) restock.push({ orderItemId: k.slice(8), quantity: q });
    }
  }
  try {
    await createRefund(ctx.actor, {
      orderId,
      amountCents: Math.round(amount * 100),
      reason,
      restock,
      idempotencyKey: `admin:${orderId}:${idem}`,
    });
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Refund failed." };
  }
  refresh();
  return { ok: true, message: "Refund sent to Stripe. Its status updates when Stripe confirms." };
}

export async function addNote(_: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await assertStaff("orders.view");
  const note = String(form.get("note") ?? "").trim().slice(0, 1000);
  const orderId = String(form.get("orderId") ?? "");
  if (!note) return { ok: false, message: "Write a note first." };
  await addOrderNote(ctx.actor, orderId, note);
  refresh();
  return { ok: true, message: "Note added." };
}
