import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { money } from "@/lib/format";
import { productHref } from "@/lib/urls";
import type { ProductCard as Card } from "@/server/catalog";
import { ProductArt } from "./ProductArt";

const BADGES: Record<string, { label: string; cls: string }> = {
  bestseller: { label: "Bestseller", cls: "bg-iris-600 text-white" },
  new: { label: "New", cls: "bg-orchid-500 text-white" },
  sale: { label: "Sale", cls: "bg-ink text-white" },
  limited: { label: "Limited", cls: "bg-white text-iris-700" },
};

export function ProductCard({ p, priority = false }: { p: Card; priority?: boolean }) {
  const href = productHref(p.categorySlug, p.slug);
  const soldOut = p.available <= 0;
  const onSale = p.compareAtCents != null && p.compareAtCents > p.minPriceCents;
  const badge = soldOut ? null : p.badge ? BADGES[p.badge] : onSale ? BADGES.sale : null;
  return (
    <article className="group relative flex flex-col">
      <Link
        href={href}
        className="relative block aspect-[4/5] overflow-hidden rounded-[var(--radius-card)] bg-mist"
        aria-label={p.title}
      >
        <ProductArt
          src={p.imageUrl}
          alt={p.imageAlt}
          title={p.title}
          priority={priority}
          className="transition-transform duration-700 ease-out group-hover:scale-[1.04]"
        />
        <div className="absolute left-3 top-3 flex gap-1.5">
          {badge && <span className={`chip shadow-sm ${badge.cls}`}>{badge.label}</span>}
          {soldOut && <span className="chip bg-white/90 text-ink-soft">Sold out</span>}
        </div>
        <span className="absolute bottom-3 right-3 flex h-10 w-10 translate-y-2 items-center justify-center rounded-full bg-white text-ink opacity-0 shadow-md transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
          <ArrowUpRight size={18} aria-hidden />
        </span>
      </Link>
      <div className="mt-3.5 flex flex-1 flex-col gap-1 px-0.5">
        {(p.categoryName || p.brand) && (
          <p className="text-[0.7rem] font-bold tracking-[0.14em] text-iris-600 uppercase">
            {p.brand ?? p.categoryName}
          </p>
        )}
        <h3 className="font-sans text-[0.97rem] leading-snug font-semibold tracking-normal text-ink">
          <Link href={href} className="link-underline">
            {p.title}
          </Link>
        </h3>
        <div className="mt-auto flex items-baseline gap-2 pt-1">
          <span className="text-[0.95rem] font-bold text-ink">
            {p.variantCount > 1 && p.maxPriceCents !== p.minPriceCents ? "From " : ""}
            {money(p.minPriceCents)}
          </span>
          {onSale && <s className="text-sm text-muted">{money(p.compareAtCents)}</s>}
        </div>
        {!soldOut && p.available <= 3 && (
          <p className="text-xs font-semibold text-orchid-700">Only {p.available} left</p>
        )}
      </div>
    </article>
  );
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 lg:grid-cols-4 lg:gap-x-6">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="animate-pulse">
          <div className="aspect-[4/5] rounded-[var(--radius-card)] bg-mist" />
          <div className="mt-4 h-3 w-1/3 rounded bg-mist" />
          <div className="mt-2 h-4 w-3/4 rounded bg-mist" />
          <div className="mt-2 h-4 w-1/4 rounded bg-mist" />
        </div>
      ))}
    </div>
  );
}
