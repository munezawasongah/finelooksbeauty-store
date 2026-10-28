"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { grantOrderAccess, lookupOrder } from "@/server/orders/access";
import { rateLimit } from "@/server/redis";
import { requestMeta } from "@/server/auth/session";

export async function trackOrder(_: { message: string } | null, form: FormData) {
  const parsed = z
    .object({ order: z.string().trim().min(3).max(30), email: z.string().trim().email().max(254) })
    .safeParse({ order: form.get("order"), email: form.get("email") });
  if (!parsed.success) return { message: "Enter your order number and email." };
  const { ip } = await requestMeta();
  if (!(await rateLimit(`track:${ip}`, 10, 900))) return { message: "Too many attempts. Try again in 15 minutes." };
  const order = await lookupOrder(parsed.data.order, parsed.data.email);
  if (!order) return { message: "We couldn't find an order with those details." };
  await grantOrderAccess(order.number);
  redirect(`/orders/${encodeURIComponent(order.number)}`);
}
