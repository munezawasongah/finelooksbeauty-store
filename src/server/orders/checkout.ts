/**
 * Checkout — section 7.1 steps 7 to 10.
 * Totals come from database prices (never from the browser). A pending order and
 * a time-limited stock reservation are created in one transaction before the
 * customer is sent to Stripe-hosted Checkout.
 */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import {
  cartItems,
  orderEvents,
  orderItems,
  orders,
  productImages,
  products,
  productVariants,
  shippingMethods,
} from "../db/schema";
import { defaultLocationId, OutOfStockError, releaseReservations, reserveForOrder } from "../inventory";
import { evaluateDiscount } from "../cart";
import { getSettings } from "../settings";
import { randomToken, sha256 } from "../crypto";
import { env } from "../env";
import { stripe } from "../payments/stripe";
import type Stripe from "stripe";

export type CheckoutInput = {
  cartId: string;
  customerId: string | null;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  fulfillment: "ship" | "pickup";
  marketingOptIn: boolean;
};

export type CheckoutResult =
  | { ok: true; url: string }
  | { ok: false; message: string; code?: "out_of_stock" | "empty" | "unavailable" | "payment" };

export async function shippingOptionsFor(subtotalAfterDiscountCents: number) {
  const methods = await db()
    .select()
    .from(shippingMethods)
    .where(eq(shippingMethods.active, true))
    .orderBy(asc(shippingMethods.sortOrder), asc(shippingMethods.amountCents));
  return methods.map((m) => ({
    ...m,
    effectiveCents: m.freeOverCents != null && subtotalAfterDiscountCents >= m.freeOverCents ? 0 : m.amountCents,
  }));
}

async function nextOrderNumber() {
  const r = await db().execute(sql`select nextval('order_number_seq') as n`);
  return `FL-${(r.rows[0] as { n: string }).n}`;
}

export async function placeOrder(input: CheckoutInput): Promise<CheckoutResult> {
  const { commerce, store } = await getSettings(["commerce", "store"]);
  if (input.fulfillment === "pickup" && !commerce.pickupEnabled) {
    return { ok: false, message: "In-store pickup is not available right now." };
  }

  // 1. Price everything from the database.
  const rows = await db()
    .select({ item: cartItems, v: productVariants, p: products })
    .from(cartItems)
    .innerJoin(productVariants, eq(productVariants.id, cartItems.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(eq(cartItems.cartId, input.cartId));
  if (!rows.length) return { ok: false, message: "Your bag is empty.", code: "empty" };
  for (const r of rows) {
    if (r.p.status !== "active" || !r.v.active) {
      return { ok: false, message: `${r.p.title} is no longer available. Remove it to continue.`, code: "unavailable" };
    }
    if (r.item.quantity > commerce.maxQtyPerLine) {
      return { ok: false, message: `Limit ${commerce.maxQtyPerLine} of each item per order.` };
    }
  }

  const subtotalCents = rows.reduce((s, r) => s + r.v.priceCents * r.item.quantity, 0);
  const cart = await db().query.carts.findFirst({ where: (c, { eq }) => eq(c.id, input.cartId) });
  let discountCents = 0;
  let discountCode: string | null = null;
  if (cart?.discountCode) {
    const d = await evaluateDiscount(cart.discountCode, subtotalCents);
    if (d.ok) {
      discountCents = d.amountCents;
      discountCode = d.discount.code;
    }
  }
  const afterDiscount = subtotalCents - discountCents;
  const shipOptions = input.fulfillment === "ship" ? await shippingOptionsFor(afterDiscount) : [];
  if (input.fulfillment === "ship" && !shipOptions.length) {
    return { ok: false, message: "Shipping is not available right now. Choose in-store pickup or call the store." };
  }

  const images = await db()
    .select()
    .from(productImages)
    .where(inArray(productImages.productId, [...new Set(rows.map((r) => r.p.id))]))
    .orderBy(asc(productImages.sortOrder));

  // 2. Create the pending order and reserve stock atomically.
  const number = await nextOrderNumber();
  const guestToken = randomToken(24);
  const reservationMinutes = Math.max(31, commerce.reservationMinutes);
  const reservationExpiresAt = new Date(Date.now() + reservationMinutes * 60_000);
  const locationId = await defaultLocationId();

  let orderId: string;
  try {
    orderId = await db().transaction(async (tx) => {
      const [order] = await tx
        .insert(orders)
        .values({
          number,
          customerId: input.customerId,
          email: input.email.toLowerCase(),
          phone: input.phone,
          customerName: `${input.firstName} ${input.lastName}`.trim(),
          status: "pending_payment",
          paymentStatus: "unpaid",
          fulfillmentMethod: input.fulfillment,
          subtotalCents,
          discountCents,
          shippingCents: 0,
          taxCents: 0,
          totalCents: afterDiscount,
          discountCode,
          cartId: input.cartId,
          marketingOptIn: input.marketingOptIn,
          guestTokenHash: sha256(guestToken),
          reservationExpiresAt,
        })
        .returning({ id: orders.id });

      await tx.insert(orderItems).values(
        rows.map((r) => ({
          orderId: order.id,
          variantId: r.v.id,
          productId: r.p.id,
          sku: r.v.sku,
          productTitle: r.p.title,
          variantLabel: Object.values(r.v.options ?? {}).join(" / ") || null,
          imageUrl: images.find((i) => i.productId === r.p.id)?.url ?? null,
          unitPriceCents: r.v.priceCents,
          quantity: r.item.quantity,
          lineTotalCents: r.v.priceCents * r.item.quantity,
        })),
      );

      await reserveForOrder(
        tx,
        order.id,
        rows.map((r) => ({ variantId: r.v.id, quantity: r.item.quantity })),
        locationId,
        reservationExpiresAt,
      );

      await tx.insert(orderEvents).values({
        orderId: order.id,
        type: "created",
        toStatus: "pending_payment",
        note: `Checkout started (${input.fulfillment === "ship" ? "shipping" : "in-store pickup"})`,
      });
      return order.id;
    });
  } catch (err) {
    if (err instanceof OutOfStockError) {
      const row = rows.find((r) => r.v.id === err.variantId);
      const name = row ? `${row.p.title}${Object.values(row.v.options ?? {}).length ? ` (${Object.values(row.v.options).join(" / ")})` : ""}` : "An item";
      return {
        ok: false,
        code: "out_of_stock",
        message:
          err.available > 0
            ? `${name}: only ${err.available} left. Update your bag to continue.`
            : `${name} just sold out. Remove it from your bag to continue.`,
      };
    }
    throw err;
  }

  // 3. Create the Stripe Checkout Session server-side, with an idempotency key.
  try {
    const session = await createStripeSession({
      orderId,
      number,
      guestToken,
      input,
      rows,
      images,
      discountCents,
      shipOptions,
      reservationExpiresAt,
      store,
    });
    await db()
      .update(orders)
      .set({ stripeCheckoutSessionId: session.id, updatedAt: new Date() })
      .where(eq(orders.id, orderId));
    return { ok: true, url: session.url! };
  } catch (err) {
    console.error("[checkout] stripe session failed", err);
    await db().transaction(async (tx) => {
      await releaseReservations(tx, orderId, "released");
      await tx
        .update(orders)
        .set({ status: "cancelled", cancelledAt: new Date(), exceptionReason: "Payment page could not be created" })
        .where(and(eq(orders.id, orderId), eq(orders.status, "pending_payment")));
      await tx.insert(orderEvents).values({
        orderId,
        type: "checkout_failed",
        fromStatus: "pending_payment",
        toStatus: "cancelled",
        note: "Stripe Checkout could not be created",
      });
    });
    return { ok: false, code: "payment", message: "We couldn't open the payment page. Please try again in a moment." };
  }
}

async function createStripeSession(args: {
  orderId: string;
  number: string;
  guestToken: string;
  input: CheckoutInput;
  rows: { item: typeof cartItems.$inferSelect; v: typeof productVariants.$inferSelect; p: typeof products.$inferSelect }[];
  images: (typeof productImages.$inferSelect)[];
  discountCents: number;
  shipOptions: Awaited<ReturnType<typeof shippingOptionsFor>>;
  reservationExpiresAt: Date;
  store: Awaited<ReturnType<typeof getSettings<"store">>>["store"];
}) {
  const { orderId, number, guestToken, input, rows, images, discountCents, shipOptions, reservationExpiresAt, store } = args;
  const base = env().APP_URL.replace(/\/$/, "");
  const s = stripe();
  const idem = `checkout:${orderId}`;
  const automaticTax = env().STRIPE_AUTOMATIC_TAX === "true";

  let couponId: string | undefined;
  if (discountCents > 0) {
    const coupon = await s.coupons.create(
      { amount_off: discountCents, currency: "usd", duration: "once", max_redemptions: 1, name: `Order ${number} discount` },
      { idempotencyKey: `${idem}:coupon` },
    );
    couponId = coupon.id;
  }

  // In-store pickup is taxed at the store's address; a Stripe customer carries that address.
  let customer: string | undefined;
  const storeAddressKnown = Boolean(store.streetAddress && store.zip);
  if (input.fulfillment === "pickup" && automaticTax && storeAddressKnown) {
    const c = await s.customers.create(
      {
        email: input.email,
        name: `${input.firstName} ${input.lastName}`.trim(),
        phone: input.phone ?? undefined,
        address: { line1: store.streetAddress, city: store.city, state: store.state, postal_code: store.zip, country: "US" },
        shipping: {
          name: store.name,
          address: { line1: store.streetAddress, city: store.city, state: store.state, postal_code: store.zip, country: "US" },
        },
        metadata: { order_id: orderId, purpose: "pickup_tax_location" },
      },
      { idempotencyKey: `${idem}:customer` },
    );
    customer = c.id;
  }

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = rows.map((r) => {
    const img = images.find((i) => i.productId === r.p.id)?.url;
    const label = Object.values(r.v.options ?? {}).join(" / ");
    return {
      quantity: r.item.quantity,
      price_data: {
        currency: "usd",
        unit_amount: r.v.priceCents,
        tax_behavior: "exclusive",
        product_data: {
          name: r.p.title,
          description: label ? `${label} · SKU ${r.v.sku}` : `SKU ${r.v.sku}`,
          ...(img && /^https:\/\//.test(img) ? { images: [img] } : {}),
          ...(r.v.taxCode ? { tax_code: r.v.taxCode } : {}),
          metadata: { variant_id: r.v.id, sku: r.v.sku },
        },
      },
    };
  });

  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "payment",
    line_items: lineItems,
    client_reference_id: orderId,
    metadata: { order_id: orderId, order_number: number },
    payment_intent_data: {
      metadata: { order_id: orderId, order_number: number },
      description: `Fine Looks order ${number}`,
    },
    success_url: `${base}/checkout/success?order=${encodeURIComponent(number)}&t=${guestToken}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/cart?cancelled=${encodeURIComponent(number)}&t=${guestToken}`,
    // Stripe requires 30+ minutes; keep it inside our reservation window.
    expires_at: Math.floor(Math.max(Date.now() + 30 * 60_000 + 5_000, reservationExpiresAt.getTime() - 60_000) / 1000),
    phone_number_collection: { enabled: false },
    ...(automaticTax ? { automatic_tax: { enabled: true } } : {}),
    ...(couponId ? { discounts: [{ coupon: couponId }] } : {}),
    ...(customer ? { customer } : { customer_email: input.email, customer_creation: "if_required" as const }),
    billing_address_collection: input.fulfillment === "pickup" && !customer ? "required" : "auto",
  };

  if (input.fulfillment === "ship") {
    params.shipping_address_collection = { allowed_countries: ["US"] };
    params.shipping_options = shipOptions.slice(0, 5).map((m) => ({
      shipping_rate_data: {
        type: "fixed_amount",
        display_name: m.effectiveCents === 0 ? `${m.name} (free)` : m.name,
        fixed_amount: { amount: m.effectiveCents, currency: "usd" },
        tax_behavior: "exclusive",
        delivery_estimate: {
          minimum: { unit: "business_day", value: m.minDays },
          maximum: { unit: "business_day", value: m.maxDays },
        },
        metadata: { shipping_method_id: m.id },
      },
    }));
  }

  return s.checkout.sessions.create(params, { idempotencyKey: idem });
}
