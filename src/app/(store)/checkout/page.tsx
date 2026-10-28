import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCart } from "@/server/cart";
import { getCustomer } from "@/server/auth/session";
import { getSettings } from "@/server/settings";
import { isStripeConfigured } from "@/server/env";
import { shippingOptionsFor } from "@/server/orders/checkout";
import { money } from "@/lib/format";
import { ProductArt } from "@/components/store/ProductArt";
import { CheckoutForm } from "./CheckoutForm";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

export default function CheckoutPage() {
  return (
    <div className="bg-cream">
      <div className="container-x pt-10 pb-24">
        <Link href="/cart" className="text-sm font-bold text-iris-700">
          ← Back to bag
        </Link>
        <h1 className="mt-4 text-[2.6rem] leading-none font-light sm:text-6xl">
          Check<em className="accent">out.</em>
        </h1>
        <Suspense fallback={<div className="mt-10 h-96 animate-pulse rounded-[var(--radius-card)] bg-white" />}>
          <CheckoutContent />
        </Suspense>
      </div>
    </div>
  );
}

async function CheckoutContent() {
  const [cart, customer, { store, commerce }] = await Promise.all([
    getCart(),
    getCustomer(),
    getSettings(["store", "commerce"]),
  ]);
  if (cart.lines.length === 0 || cart.hasProblems) redirect("/cart");
  const afterDiscount = cart.subtotalCents - cart.discountCents;
  const ship = await shippingOptionsFor(afterDiscount);

  return (
    <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_24rem] lg:gap-14">
      <CheckoutForm
        defaults={{
          email: customer?.email ?? "",
          firstName: customer?.firstName ?? "",
          lastName: customer?.lastName ?? "",
          phone: customer?.phone ?? "",
        }}
        pickupEnabled={commerce.pickupEnabled}
        pickupLabel={`${store.city}, ${store.state}${store.directionsNote ? ` — ${store.directionsNote}` : ""}`}
        pickupInstructions={commerce.pickupInstructions}
        shipping={ship.map((m) => ({
          id: m.id,
          name: m.name,
          price: m.effectiveCents === 0 ? "Free" : money(m.effectiveCents),
          days: m.minDays === m.maxDays ? `${m.minDays} business days` : `${m.minDays}–${m.maxDays} business days`,
        }))}
        paymentsReady={isStripeConfigured()}
      />

      <aside className="lg:sticky lg:top-28 lg:self-start" aria-label="Order summary">
        <div className="card p-6">
          <h2 className="font-display text-2xl">Your order</h2>
          <ul className="mt-5 space-y-4">
            {cart.lines.map((l) => (
              <li key={l.variantId} className="flex gap-3">
                <div className="relative h-16 w-14 shrink-0 overflow-hidden rounded-xl bg-mist">
                  <ProductArt src={l.imageUrl} alt={l.imageAlt} title={l.title} sizes="56px" />
                  <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-ink px-1 text-[0.65rem] font-bold text-white">
                    {l.quantity}
                  </span>
                </div>
                <div className="flex-1 text-sm">
                  <p className="font-semibold leading-snug">{l.title}</p>
                  {l.variantLabel && <p className="text-xs text-muted">{l.variantLabel}</p>}
                </div>
                <p className="text-sm font-semibold">{money(l.unitPriceCents * l.quantity)}</p>
              </li>
            ))}
          </ul>
          <dl className="mt-6 space-y-2.5 border-t border-line pt-5 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-soft">Subtotal</dt>
              <dd>{money(cart.subtotalCents)}</dd>
            </div>
            {cart.discountCents > 0 && (
              <div className="flex justify-between">
                <dt className="text-ink-soft">Discount ({cart.discountCode})</dt>
                <dd className="text-success">−{money(cart.discountCents)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-ink-soft">Shipping</dt>
              <dd className="text-muted">Chosen on the payment page</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-soft">Sales tax</dt>
              <dd className="text-muted">Calculated by address</dd>
            </div>
            <div className="flex justify-between border-t border-line pt-3 text-base font-bold">
              <dt>Before shipping &amp; tax</dt>
              <dd>{money(afterDiscount)}</dd>
            </div>
          </dl>
        </div>
      </aside>
    </div>
  );
}
