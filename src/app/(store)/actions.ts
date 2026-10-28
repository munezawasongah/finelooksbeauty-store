"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { newsletterSubscribers, productVariants, products } from "@/server/db/schema";
import { eq, sql } from "drizzle-orm";
import { rateLimit } from "@/server/redis";
import { requestMeta } from "@/server/auth/session";
import {
  currentQuantity,
  evaluateDiscount,
  getCart,
  setCartDiscount,
  setCartQuantity,
} from "@/server/cart";
import { availabilityFor } from "@/server/inventory";
import { getSetting } from "@/server/settings";

export type ActionState = { ok: boolean; message: string } | null;

const CONSENT =
  "I agree to receive marketing emails from Fine Looks Hair & Beauty. I can unsubscribe at any time.";

export async function subscribeNewsletter(_: ActionState, form: FormData): Promise<ActionState> {
  const email = z.string().trim().toLowerCase().email().max(254).safeParse(form.get("email"));
  if (!email.success) return { ok: false, message: "Enter a valid email address." };
  if (form.get("company")) return { ok: true, message: "Thank you!" }; // honeypot
  const { ip } = await requestMeta();
  if (!(await rateLimit(`newsletter:${ip}`, 5, 3600))) {
    return { ok: false, message: "Too many attempts. Try again later." };
  }
  await db().execute(sql`
    insert into ${newsletterSubscribers} (email, consent_text) values (${email.data}, ${CONSENT})
    on conflict ((lower(email))) do update set unsubscribed_at = null, consent_text = excluded.consent_text
  `);
  return { ok: true, message: "You're on the list. Welcome, sister!" };
}

export async function addToCart(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = z
    .object({ variantId: z.string().uuid(), quantity: z.coerce.number().int().min(1).max(99) })
    .safeParse({ variantId: form.get("variantId"), quantity: form.get("quantity") ?? 1 });
  if (!parsed.success) return { ok: false, message: "Choose an option first." };
  const { ip } = await requestMeta();
  if (!(await rateLimit(`cart:${ip}`, 120, 60))) return { ok: false, message: "Slow down a little and try again." };

  const variant = await db()
    .select({ id: productVariants.id, active: productVariants.active, status: products.status })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(eq(productVariants.id, parsed.data.variantId))
    .limit(1);
  if (!variant[0] || !variant[0].active || variant[0].status !== "active") {
    return { ok: false, message: "This item is no longer available." };
  }
  const commerce = await getSetting("commerce");
  const available = (await availabilityFor([parsed.data.variantId])).get(parsed.data.variantId) ?? 0;
  const inCart = await currentQuantity(parsed.data.variantId);
  const want = inCart + parsed.data.quantity;
  const cap = Math.min(available, commerce.maxQtyPerLine);
  if (cap <= 0) return { ok: false, message: "Sorry, this just sold out." };
  if (inCart >= cap) return { ok: false, message: `You already have the most we can sell (${cap}) in your bag.` };
  await setCartQuantity(parsed.data.variantId, Math.min(want, cap));
  refresh();
  return {
    ok: true,
    message: want > cap ? `Added. We could only add ${cap - inCart} more.` : "Added to your bag.",
  };
}

export async function updateCartLine(form: FormData) {
  const parsed = z
    .object({ variantId: z.string().uuid(), quantity: z.coerce.number().int().min(0).max(99) })
    .safeParse({ variantId: form.get("variantId"), quantity: form.get("quantity") });
  if (!parsed.success) return;
  const commerce = await getSetting("commerce");
  const available = (await availabilityFor([parsed.data.variantId])).get(parsed.data.variantId) ?? 0;
  const qty = Math.min(parsed.data.quantity, Math.max(available, 0), commerce.maxQtyPerLine);
  await setCartQuantity(parsed.data.variantId, parsed.data.quantity === 0 ? 0 : Math.max(qty, 1));
  refresh();
}

export async function removeCartLine(form: FormData) {
  const id = z.string().uuid().safeParse(form.get("variantId"));
  if (!id.success) return;
  await setCartQuantity(id.data, 0);
  refresh();
}

export async function applyDiscountCode(_: ActionState, form: FormData): Promise<ActionState> {
  const code = z.string().trim().min(2).max(40).safeParse(form.get("code"));
  if (!code.success) return { ok: false, message: "Enter a code." };
  const { ip } = await requestMeta();
  if (!(await rateLimit(`discount:${ip}`, 15, 600))) return { ok: false, message: "Too many attempts. Try later." };
  const cart = await getCart();
  const res = await evaluateDiscount(code.data, cart.subtotalCents);
  if (!res.ok) return { ok: false, message: res.message };
  await setCartDiscount(res.discount.code);
  refresh();
  return { ok: true, message: `Code ${res.discount.code.toUpperCase()} applied.` };
}

export async function removeDiscountCode() {
  await setCartDiscount(null);
  refresh();
}
