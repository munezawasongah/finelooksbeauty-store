import { cookies } from "next/headers";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "./db";
import { cartItems, carts, discounts, productImages, products, productVariants, categories } from "./db/schema";
import { availabilityFor } from "./inventory";
import { randomToken } from "./crypto";
import { getSetting } from "./settings";

const isProd = process.env.NODE_ENV === "production";
export const CART_COOKIE = isProd ? "__Host-fl_cart" : "fl_cart";

export type CartLine = {
  variantId: string;
  productId: string;
  productSlug: string;
  categorySlug: string | null;
  title: string;
  variantLabel: string;
  options: Record<string, string>;
  sku: string;
  imageUrl: string | null;
  imageAlt: string | null;
  unitPriceCents: number;
  compareAtCents: number | null;
  quantity: number;
  available: number;
  maxQty: number;
  problem: string | null;
};

export type CartView = {
  id: string | null;
  lines: CartLine[];
  count: number;
  subtotalCents: number;
  discountCode: string | null;
  discountCents: number;
  discountProblem: string | null;
  hasProblems: boolean;
};

async function cartIdFromCookie() {
  return (await cookies()).get(CART_COOKIE)?.value ?? null;
}

export async function ensureCart(customerId?: string | null): Promise<string> {
  const existing = await cartIdFromCookie();
  if (existing) {
    const found = await db().query.carts.findFirst({ where: eq(carts.id, existing) });
    if (found) return found.id;
  }
  const id = randomToken(24);
  await db().insert(carts).values({ id, customerId: customerId ?? null });
  (await cookies()).set(CART_COOKIE, id, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 60,
  });
  return id;
}

export async function cartCount(): Promise<number> {
  const id = await cartIdFromCookie();
  if (!id) return 0;
  const [row] = await db()
    .select({ n: sql<number>`coalesce(sum(${cartItems.quantity}), 0)::int` })
    .from(cartItems)
    .where(eq(cartItems.cartId, id));
  return row?.n ?? 0;
}

export async function getCart(): Promise<CartView> {
  const id = await cartIdFromCookie();
  const empty: CartView = {
    id,
    lines: [],
    count: 0,
    subtotalCents: 0,
    discountCode: null,
    discountCents: 0,
    discountProblem: null,
    hasProblems: false,
  };
  if (!id) return empty;
  const cart = await db().query.carts.findFirst({ where: eq(carts.id, id) });
  if (!cart) return { ...empty, id: null };

  const rows = await db()
    .select({
      item: cartItems,
      v: productVariants,
      p: products,
      c: { slug: categories.slug },
    })
    .from(cartItems)
    .innerJoin(productVariants, eq(productVariants.id, cartItems.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .where(eq(cartItems.cartId, id))
    .orderBy(asc(cartItems.addedAt));

  const commerce = await getSetting("commerce");
  const availability = await availabilityFor(rows.map((r) => r.v.id));
  const images = rows.length
    ? await db()
        .select()
        .from(productImages)
        .where(inArray(productImages.productId, [...new Set(rows.map((r) => r.p.id))]))
        .orderBy(asc(productImages.sortOrder))
    : [];

  const lines: CartLine[] = rows.map(({ item, v, p, c }) => {
    const available = availability.get(v.id) ?? 0;
    const img = images.find((i) => i.productId === p.id);
    let problem: string | null = null;
    if (p.status !== "active" || !v.active) problem = "No longer available";
    else if (available === 0) problem = "Sold out";
    else if (item.quantity > available) problem = `Only ${available} left`;
    else if (item.quantity > commerce.maxQtyPerLine) problem = `Limit ${commerce.maxQtyPerLine} per order`;
    return {
      variantId: v.id,
      productId: p.id,
      productSlug: p.slug,
      categorySlug: c?.slug ?? null,
      title: p.title,
      variantLabel: Object.values(v.options ?? {}).join(" / "),
      options: v.options ?? {},
      sku: v.sku,
      imageUrl: img?.url ?? null,
      imageAlt: img?.alt ?? null,
      unitPriceCents: v.priceCents,
      compareAtCents: v.compareAtCents,
      quantity: item.quantity,
      available,
      maxQty: Math.min(available, commerce.maxQtyPerLine),
      problem,
    };
  });

  const subtotalCents = lines.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0);
  const disc = cart.discountCode ? await evaluateDiscount(cart.discountCode, subtotalCents) : null;
  return {
    id,
    lines,
    count: lines.reduce((s, l) => s + l.quantity, 0),
    subtotalCents,
    discountCode: cart.discountCode,
    discountCents: disc?.ok ? disc.amountCents : 0,
    discountProblem: disc && !disc.ok ? disc.message : null,
    hasProblems: lines.some((l) => l.problem),
  };
}

export async function evaluateDiscount(code: string, subtotalCents: number) {
  const d = await db().query.discounts.findFirst({
    where: sql`upper(${discounts.code}) = upper(${code.trim()})`,
  });
  const now = Date.now();
  if (!d || !d.active) return { ok: false as const, message: "That code isn't valid." };
  if (d.startsAt && d.startsAt.getTime() > now) return { ok: false as const, message: "That code isn't active yet." };
  if (d.endsAt && d.endsAt.getTime() < now) return { ok: false as const, message: "That code has expired." };
  if (d.usageLimit != null && d.usedCount >= d.usageLimit)
    return { ok: false as const, message: "That code has reached its usage limit." };
  if (subtotalCents < d.minSubtotalCents)
    return {
      ok: false as const,
      message: `Spend $${(d.minSubtotalCents / 100).toFixed(2)} or more to use this code.`,
    };
  const amountCents =
    d.type === "percent"
      ? Math.floor((subtotalCents * Math.min(d.value, 100)) / 100)
      : Math.min(d.value, subtotalCents);
  return { ok: true as const, amountCents, discount: d };
}

export async function setCartQuantity(variantId: string, quantity: number) {
  const id = await ensureCart();
  if (quantity <= 0) {
    await db().delete(cartItems).where(and(eq(cartItems.cartId, id), eq(cartItems.variantId, variantId)));
  } else {
    await db()
      .insert(cartItems)
      .values({ cartId: id, variantId, quantity })
      .onConflictDoUpdate({ target: [cartItems.cartId, cartItems.variantId], set: { quantity } });
  }
  await db().update(carts).set({ updatedAt: new Date() }).where(eq(carts.id, id));
}

export async function currentQuantity(variantId: string) {
  const id = await cartIdFromCookie();
  if (!id) return 0;
  const row = await db().query.cartItems.findFirst({
    where: and(eq(cartItems.cartId, id), eq(cartItems.variantId, variantId)),
  });
  return row?.quantity ?? 0;
}

export async function setCartDiscount(code: string | null) {
  const id = await ensureCart();
  await db().update(carts).set({ discountCode: code, updatedAt: new Date() }).where(eq(carts.id, id));
}

export async function clearCart(cartId: string) {
  await db().delete(cartItems).where(eq(cartItems.cartId, cartId));
  await db().update(carts).set({ discountCode: null }).where(eq(carts.id, cartId));
}
