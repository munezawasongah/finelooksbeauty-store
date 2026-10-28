import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Lock, ShoppingBag, Trash2 } from "lucide-react";
import { getCart } from "@/server/cart";
import { money } from "@/lib/format";
import { productHref } from "@/lib/urls";
import { ProductArt } from "@/components/store/ProductArt";
import { removeCartLine, removeDiscountCode, updateCartLine } from "../actions";
import { DiscountForm } from "./DiscountForm";
import { CancelledCheckout } from "./CancelledCheckout";
import { QtySelect } from "./QtySelect";

export const metadata: Metadata = { title: "Your bag", robots: { index: false } };

export default function CartPage({ searchParams }: PageProps<"/cart">) {
  return (
    <div className="container-x pt-10 pb-24">
      <h1 className="text-[2.6rem] leading-none font-light sm:text-6xl">
        Your <em className="accent">bag.</em>
      </h1>
      <Suspense fallback={<div className="mt-10 h-64 animate-pulse rounded-[var(--radius-card)] bg-mist" />}>
        <CartContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function CartContent({ searchParams }: { searchParams: PageProps<"/cart">["searchParams"] }) {
  const sp = await searchParams;
  const cancelled = typeof sp.cancelled === "string" && typeof sp.t === "string" ? { number: sp.cancelled, token: sp.t } : null;
  const cart = await getCart();
  const total = cart.subtotalCents - cart.discountCents;

  return (
    <>
      {cancelled && <CancelledCheckout number={cancelled.number} token={cancelled.token} />}
      {cart.lines.length === 0 ? (
        <div className="mt-10 rounded-[var(--radius-card)] border border-dashed border-line bg-cream px-6 py-20 text-center">
          <ShoppingBag className="mx-auto text-iris-400" size={40} aria-hidden />
          <p className="mt-4 font-display text-3xl">Your bag is empty.</p>
          <p className="mt-2 text-muted">Find something you love — we&apos;ll keep it here for you.</p>
          <Link href="/shop" className="btn btn-primary mt-6">
            Start shopping <ArrowRight size={16} aria-hidden />
          </Link>
        </div>
      ) : (
        <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_24rem] lg:gap-14">
          <section aria-label="Items in your bag">
            <ul className="divide-y divide-line border-y border-line">
              {cart.lines.map((l) => (
                <li key={l.variantId} className="flex gap-4 py-6 sm:gap-6">
                  <Link
                    href={productHref(l.categorySlug, l.productSlug)}
                    className="relative block h-32 w-24 shrink-0 overflow-hidden rounded-2xl bg-mist sm:h-36 sm:w-28"
                  >
                    <ProductArt src={l.imageUrl} alt={l.imageAlt} title={l.title} sizes="112px" />
                  </Link>
                  <div className="flex flex-1 flex-col">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <Link href={productHref(l.categorySlug, l.productSlug)} className="font-semibold hover:text-iris-700">
                          {l.title}
                        </Link>
                        {l.variantLabel && <p className="mt-0.5 text-sm text-muted">{l.variantLabel}</p>}
                        <p className="mt-1 text-sm text-ink-soft">{money(l.unitPriceCents)} each</p>
                      </div>
                      <p className="font-bold">{money(l.unitPriceCents * l.quantity)}</p>
                    </div>
                    {l.problem && (
                      <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-danger" role="alert">
                        <AlertTriangle size={15} aria-hidden /> {l.problem}
                      </p>
                    )}
                    <div className="mt-auto flex items-center gap-3 pt-3">
                      <form action={updateCartLine} className="flex items-center gap-2">
                        <input type="hidden" name="variantId" value={l.variantId} />
                        <QtySelect value={l.quantity} max={Math.max(l.maxQty, 1)} disabled={l.maxQty <= 0} />
                        <noscript>
                          <button className="btn btn-ghost btn-sm">Update</button>
                        </noscript>
                      </form>
                      <form action={removeCartLine}>
                        <input type="hidden" name="variantId" value={l.variantId} />
                        <button className="btn btn-ghost btn-sm text-muted hover:text-danger" aria-label={`Remove ${l.title}`}>
                          <Trash2 size={15} aria-hidden /> Remove
                        </button>
                      </form>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <Link href="/shop" className="mt-6 inline-flex text-sm font-bold text-iris-700">
              ← Continue shopping
            </Link>
          </section>

          <aside className="lg:sticky lg:top-28 lg:self-start" aria-label="Order summary">
            <div className="card p-6">
              <h2 className="font-display text-2xl">Summary</h2>
              <dl className="mt-5 space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-ink-soft">Subtotal ({cart.count} {cart.count === 1 ? "item" : "items"})</dt>
                  <dd className="font-semibold">{money(cart.subtotalCents)}</dd>
                </div>
                {cart.discountCode && (
                  <div className="flex items-center justify-between">
                    <dt className="flex items-center gap-2 text-ink-soft">
                      Code <span className="chip bg-iris-50 text-iris-700">{cart.discountCode}</span>
                      <form action={removeDiscountCode}>
                        <button className="text-xs text-muted underline">remove</button>
                      </form>
                    </dt>
                    <dd className="font-semibold text-success">−{money(cart.discountCents)}</dd>
                  </div>
                )}
                {cart.discountProblem && <p className="text-xs text-danger">{cart.discountProblem}</p>}
                <div className="flex justify-between">
                  <dt className="text-ink-soft">Shipping &amp; tax</dt>
                  <dd className="text-muted">Calculated at checkout</dd>
                </div>
                <div className="flex justify-between border-t border-line pt-4 text-base">
                  <dt className="font-bold">Estimated total</dt>
                  <dd className="font-bold">{money(total)}</dd>
                </div>
              </dl>
              {!cart.discountCode && (
                <div className="mt-5">
                  <DiscountForm />
                </div>
              )}
              {cart.hasProblems ? (
                <p className="mt-6 rounded-2xl bg-red-50 p-3 text-sm font-semibold text-danger">
                  Fix the items marked above to continue.
                </p>
              ) : (
                <Link href="/checkout" className="btn btn-primary mt-6 w-full">
                  <Lock size={16} aria-hidden /> Checkout
                </Link>
              )}
              <p className="mt-4 text-center text-xs text-muted">
                Items aren&apos;t held until checkout. Free pickup available in Garner, NC.
              </p>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
