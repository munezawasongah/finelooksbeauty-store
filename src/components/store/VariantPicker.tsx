"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { Check, Minus, Plus, ShoppingBag } from "lucide-react";
import { addToCart } from "@/app/(store)/actions";
import { money } from "@/lib/format";

type V = {
  id: string;
  sku: string;
  options: Record<string, string>;
  priceCents: number;
  compareAtCents: number | null;
  available: number;
  lowStockThreshold: number;
};

export function VariantPicker({
  optionNames,
  variants,
  maxQtyPerLine,
}: {
  optionNames: string[];
  variants: V[];
  maxQtyPerLine: number;
}) {
  const names = optionNames.length ? optionNames : Object.keys(variants[0]?.options ?? {});
  const firstAvailable = variants.find((v) => v.available > 0) ?? variants[0];
  const [selected, setSelected] = useState<Record<string, string>>(firstAvailable?.options ?? {});
  const [qty, setQty] = useState(1);
  const [state, action, pending] = useActionState(addToCart, null);

  const variant = useMemo(
    () => variants.find((v) => names.every((n) => v.options[n] === selected[n])) ?? null,
    [variants, names, selected],
  );
  const max = variant ? Math.min(variant.available, maxQtyPerLine) : 0;

  const valuesFor = (name: string) => [...new Set(variants.map((v) => v.options[name]).filter(Boolean))];
  /** A value is selectable if some in-stock variant has it together with the other current choices. */
  const isAvailable = (name: string, value: string) =>
    variants.some(
      (v) => v.options[name] === value && v.available > 0 && names.every((n) => n === name || v.options[n] === selected[n]),
    );

  const choose = (name: string, value: string) => {
    const next = { ...selected, [name]: value };
    if (!variants.some((v) => names.every((n) => v.options[n] === next[n]))) {
      const fallback = variants.find((v) => v.options[name] === value && v.available > 0) ??
        variants.find((v) => v.options[name] === value);
      if (fallback) {
        setSelected(fallback.options);
        setQty(1);
        return;
      }
    }
    setSelected(next);
    setQty(1);
  };

  const onSale = variant?.compareAtCents != null && variant.compareAtCents > variant.priceCents;

  return (
    <div className="mt-5">
      <div className="flex items-baseline gap-3">
        <p className="text-2xl font-bold">{variant ? money(variant.priceCents) : "—"}</p>
        {onSale && <s className="text-lg text-muted">{money(variant!.compareAtCents)}</s>}
        {onSale && (
          <span className="chip bg-ink text-white">
            Save {money(variant!.compareAtCents! - variant!.priceCents)}
          </span>
        )}
      </div>

      <form action={action} className="mt-7 space-y-6">
        {names.map((name) => {
          const values = valuesFor(name);
          if (values.length <= 1 && variants.length <= 1) {
            return values[0] ? (
              <p key={name} className="text-sm text-ink-soft">
                <span className="font-bold text-ink">{name}:</span> {values[0]}
              </p>
            ) : null;
          }
          return (
            <fieldset key={name}>
              <legend className="mb-3 text-sm">
                <span className="font-bold">{name}:</span>{" "}
                <span className="text-ink-soft">{selected[name] ?? "Choose"}</span>
              </legend>
              <div className="flex flex-wrap gap-2">
                {values.map((value) => {
                  const active = selected[name] === value;
                  const ok = isAvailable(name, value);
                  return (
                    <button
                      type="button"
                      key={value}
                      onClick={() => choose(name, value)}
                      aria-pressed={active}
                      className={`relative min-w-14 rounded-full border-[1.5px] px-4 py-2.5 text-sm font-semibold transition-colors ${
                        active
                          ? "border-ink bg-ink text-white"
                          : ok
                            ? "border-line bg-white text-ink hover:border-iris-400"
                            : "border-dashed border-line bg-white text-muted line-through decoration-1"
                      }`}
                    >
                      {value}
                      {!ok && <span className="sr-only"> (sold out)</span>}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          );
        })}

        <input type="hidden" name="variantId" value={variant?.id ?? ""} />
        <input type="hidden" name="quantity" value={qty} />

        <p className="text-sm" aria-live="polite">
          {!variant ? (
            <span className="text-muted">This combination isn&apos;t available.</span>
          ) : variant.available <= 0 ? (
            <span className="font-semibold text-danger">Sold out online. Call the store to check the shelf.</span>
          ) : variant.available <= variant.lowStockThreshold ? (
            <span className="font-semibold text-orchid-700">Only {variant.available} left — order soon</span>
          ) : (
            <span className="flex items-center gap-1.5 font-semibold text-success">
              <Check size={16} aria-hidden /> In stock
            </span>
          )}
        </p>

        <div className="flex gap-3">
          <div className="flex items-center rounded-full border-[1.5px] border-line">
            <button
              type="button"
              aria-label="Decrease quantity"
              disabled={qty <= 1}
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              className="flex h-12 w-11 items-center justify-center rounded-l-full hover:bg-mist disabled:opacity-40"
            >
              <Minus size={16} aria-hidden />
            </button>
            <span className="w-8 text-center font-bold tabular-nums" aria-live="polite" aria-label={`Quantity ${qty}`}>
              {qty}
            </span>
            <button
              type="button"
              aria-label="Increase quantity"
              disabled={qty >= max}
              onClick={() => setQty((q) => Math.min(max, q + 1))}
              className="flex h-12 w-11 items-center justify-center rounded-r-full hover:bg-mist disabled:opacity-40"
            >
              <Plus size={16} aria-hidden />
            </button>
          </div>
          <button type="submit" disabled={!variant || max <= 0 || pending} className="btn btn-primary flex-1">
            <ShoppingBag size={18} aria-hidden />
            {pending ? "Adding…" : max <= 0 ? "Sold out" : "Add to bag"}
          </button>
        </div>

        {state && (
          <div
            role="status"
            className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm font-semibold ${
              state.ok ? "bg-iris-50 text-iris-800" : "bg-red-50 text-danger"
            }`}
          >
            {state.message}
            {state.ok && (
              <Link href="/cart" className="btn btn-dark btn-sm">
                View bag &amp; checkout
              </Link>
            )}
          </div>
        )}
        {variant && <p className="text-xs text-muted">SKU {variant.sku}</p>}
      </form>
    </div>
  );
}
