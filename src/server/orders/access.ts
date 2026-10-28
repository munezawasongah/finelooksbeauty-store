import { cookies } from "next/headers";
import { createHmac } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { orderEvents, orderItems, orders } from "../db/schema";
import { env } from "../env";
import { safeEqual, sha256 } from "../crypto";
import { getCustomer } from "../auth/session";

const isProd = process.env.NODE_ENV === "production";
const COOKIE = isProd ? "__Host-fl_orders" : "fl_orders";

function sign(number: string) {
  return createHmac("sha256", env().APP_ENCRYPTION_KEY).update(`order-view:${number}`).digest("base64url").slice(0, 32);
}

/** Remember that this browser proved access to an order (lookup form or emailed link). */
export async function grantOrderAccess(number: string) {
  const store = await cookies();
  const existing = (store.get(COOKIE)?.value ?? "").split(",").filter(Boolean).slice(-9);
  const entry = `${number}.${sign(number)}`;
  if (!existing.includes(entry)) existing.push(entry);
  store.set(COOKIE, existing.join(","), { httpOnly: true, secure: isProd, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
}

/**
 * Who may view an order: the signed-in customer who placed it, anyone with the
 * order's secret guest token (from the checkout redirect / email), or a browser
 * that passed the number + email lookup. Never by order number alone.
 */
export async function loadOrderForViewer(number: string, token?: string | null) {
  const order = await db().query.orders.findFirst({ where: eq(orders.number, number) });
  if (!order) return null;
  let allowed = false;
  if (token && order.guestTokenHash && safeEqual(order.guestTokenHash, sha256(token))) allowed = true;
  if (!allowed) {
    const c = (await cookies()).get(COOKIE)?.value ?? "";
    allowed = c.split(",").some((e) => {
      const [n, sig] = e.split(".");
      return n === number && sig && safeEqual(sig, sign(number));
    });
  }
  if (!allowed && order.customerId) {
    const customer = await getCustomer();
    allowed = customer?.id === order.customerId;
  }
  if (!allowed) return null;
  const [items, events] = await Promise.all([
    db().select().from(orderItems).where(eq(orderItems.orderId, order.id)),
    db()
      .select()
      .from(orderEvents)
      .where(and(eq(orderEvents.orderId, order.id), sql`${orderEvents.type} <> 'note'`))
      .orderBy(asc(orderEvents.createdAt)),
  ]);
  return { order, items, events };
}

export async function lookupOrder(number: string, email: string) {
  const order = await db().query.orders.findFirst({
    where: and(eq(orders.number, number.trim().toUpperCase()), sql`lower(${orders.email}) = lower(${email.trim()})`),
  });
  return order ?? null;
}
