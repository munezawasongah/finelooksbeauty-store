"use server";

import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { orders } from "@/server/db/schema";
import { ensureCart } from "@/server/cart";
import { getCustomer, requestMeta } from "@/server/auth/session";
import { rateLimit } from "@/server/redis";
import { placeOrder } from "@/server/orders/checkout";
import { cancelPendingOrder } from "@/server/orders/lifecycle";
import { isStripeConfigured } from "@/server/env";
import { stripe } from "@/server/payments/stripe";
import { safeEqual, sha256 } from "@/server/crypto";

export type CheckoutState = { ok: false; message: string; fields?: Record<string, string> } | null;

const schema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(254),
  firstName: z.string().trim().min(1, "Enter your first name.").max(60),
  lastName: z.string().trim().min(1, "Enter your last name.").max(60),
  phone: z
    .string()
    .trim()
    .transform((v) => v.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, ""))
    .refine((v) => v === "" || v.length === 10, "Enter a 10-digit U.S. phone number.")
    .optional(),
  fulfillment: z.enum(["ship", "pickup"]),
  marketing: z.literal("on").optional(),
});

export async function startCheckout(_: CheckoutState, form: FormData): Promise<CheckoutState> {
  if (!isStripeConfigured()) {
    return { ok: false, message: "Online payment isn't switched on yet. Please call the store to order." };
  }
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const i of parsed.error.issues) fields[String(i.path[0])] = i.message;
    return { ok: false, message: "Check the highlighted fields.", fields };
  }
  const { ip } = await requestMeta();
  if (!(await rateLimit(`checkout:${ip}`, 10, 600))) {
    return { ok: false, message: "Too many checkout attempts. Please wait a few minutes." };
  }
  const customer = await getCustomer();
  const cartId = await ensureCart(customer?.id);
  const res = await placeOrder({
    cartId,
    customerId: customer?.id ?? null,
    email: parsed.data.email,
    firstName: parsed.data.firstName,
    lastName: parsed.data.lastName,
    phone: parsed.data.phone || null,
    fulfillment: parsed.data.fulfillment,
    marketingOptIn: parsed.data.marketing === "on",
  });
  if (!res.ok) return { ok: false, message: res.message };
  redirect(res.url);
}

/** Called when the shopper comes back from Stripe without paying. Requires the order's guest token. */
export async function releaseCancelledCheckout(number: string, token: string) {
  if (typeof number !== "string" || typeof token !== "string" || token.length < 20) return;
  const order = await db().query.orders.findFirst({ where: and(eq(orders.number, number)) });
  if (!order || !order.guestTokenHash || !safeEqual(order.guestTokenHash, sha256(token))) return;
  if (order.status !== "pending_payment") return;
  if (order.stripeCheckoutSessionId && isStripeConfigured()) {
    try {
      const s = await stripe().checkout.sessions.retrieve(order.stripeCheckoutSessionId);
      if (s.status === "complete") return;
      if (s.status === "open") await stripe().checkout.sessions.expire(s.id);
    } catch {
      return; // leave it to the scheduled expiry
    }
  }
  await cancelPendingOrder(order.id, "customer_cancelled");
}
