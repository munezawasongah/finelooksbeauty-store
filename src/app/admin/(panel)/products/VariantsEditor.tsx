"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { saveVariants } from "./actions";

type V = {
  id: string;
  sku: string;
  barcode: string | null;
  options: Record<string, string>;
  priceCents: number;
  compareAtCents: number | null;
  lowStockThreshold: number;
  taxCode: string | null;
  active: boolean;
  onHand: number;
  available: number;
  clover: string | null;
};

export function VariantsEditor({ productId, optionNames, variants, canPrice }: { productId: string; optionNames: string[]; variants: V[]; canPrice: boolean }) {
  const [state, action, pending] = useActionState(saveVariants, null);
  const [extra, setExtra] = useState(0);
  const blank = (): V => ({
    id: "",
    sku: "",
    barcode: null,
    options: {},
    priceCents: variants[0]?.priceCents ?? 0,
    compareAtCents: null,
    lowStockThreshold: 3,
    taxCode: null,
    active: true,
    onHand: 0,
    available: 0,
    clover: null,
  });
  const rows = [...variants, ...Array.from({ length: extra }, () => blank())];

  return (
    <form action={action}>
      <input type="hidden" name="productId" value={productId} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs text-muted uppercase">
              <th className="px-3 py-2">SKU</th>
              {optionNames.map((n) => <th key={n} className="px-3 py-2">{n}</th>)}
              <th className="px-3 py-2">Price</th>
              <th className="px-3 py-2">Compare at</th>
              <th className="px-3 py-2">Barcode</th>
              <th className="px-3 py-2" title="Low-stock alert threshold">Alert at</th>
              <th className="px-3 py-2">Stock</th>
              <th className="px-3 py-2">Active</th>
              <th className="px-3 py-2">Remove</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((v, i) => {
              const k = v.id || `n${i}`;
              const p = (f: string) => `v[${k.replace(/-/g, "")}][${f}]`;
              return (
                <tr key={k}>
                  <td className="px-3 py-2">
                    <input type="hidden" name={p("id")} value={v.id} />
                    <input name={p("sku")} defaultValue={v.sku} aria-label="SKU" className="field !w-40 !py-1.5 font-mono text-xs uppercase" required={!v.id} />
                    {v.clover && <span className="mt-1 block text-[0.65rem] font-semibold text-iris-600">Clover: {v.clover}</span>}
                  </td>
                  {optionNames.map((n) => (
                    <td key={n} className="px-3 py-2">
                      <input name={`${p("opt")}[${n}]`} defaultValue={v.options[n] ?? ""} aria-label={n} className="field !w-28 !py-1.5" />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <input name={p("price")} defaultValue={v.priceCents ? (v.priceCents / 100).toFixed(2) : ""} aria-label="Price" inputMode="decimal" readOnly={!canPrice && Boolean(v.id)} className="field !w-24 !py-1.5" />
                  </td>
                  <td className="px-3 py-2">
                    <input name={p("compareAt")} defaultValue={v.compareAtCents ? (v.compareAtCents / 100).toFixed(2) : ""} aria-label="Compare at price" inputMode="decimal" readOnly={!canPrice && Boolean(v.id)} className="field !w-24 !py-1.5" />
                  </td>
                  <td className="px-3 py-2">
                    <input name={p("barcode")} defaultValue={v.barcode ?? ""} aria-label="Barcode" className="field !w-32 !py-1.5 font-mono text-xs" />
                  </td>
                  <td className="px-3 py-2">
                    <input name={p("threshold")} type="number" min={0} defaultValue={v.lowStockThreshold} aria-label="Low stock threshold" className="field !w-16 !py-1.5" />
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {v.id ? (
                      <a href={`/admin/inventory/${v.id}`} className="font-semibold text-iris-700">
                        {v.onHand} on hand
                        <span className="block font-normal text-muted">{v.available} sellable</span>
                      </a>
                    ) : (
                      <span className="text-muted">new</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <input type="checkbox" name={p("active")} defaultChecked={v.active} aria-label="Active" className="h-4 w-4 accent-iris-600" />
                  </td>
                  <td className="px-3 py-2">
                    {v.id && <input type="checkbox" name={p("remove")} aria-label="Remove variant" className="h-4 w-4 accent-red-600" />}
                    <input type="hidden" name={p("taxCode")} value={v.taxCode ?? ""} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {canPrice && (
          <button type="button" onClick={() => setExtra((n) => n + 1)} className="btn btn-outline btn-sm">
            <Plus size={14} aria-hidden /> Add variant
          </button>
        )}
        <button disabled={pending} className="btn btn-primary btn-sm">{pending ? "Saving…" : "Save variants"}</button>
        {state && <p role="status" className={`text-sm font-semibold ${state.ok ? "text-success" : "text-danger"}`}>{state.message}</p>}
      </div>
      <p className="mt-3 text-xs text-muted">
        Stock is changed on the Inventory page (with a reason) or synced from Clover — not here. {canPrice ? "" : "You can't change prices with your role."}
      </p>
    </form>
  );
}
