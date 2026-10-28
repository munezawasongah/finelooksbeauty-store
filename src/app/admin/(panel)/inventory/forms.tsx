"use client";

import { useActionState, useState } from "react";
import { adjustStock, importCatalogCsv, importStockCsv, updateBalanceSettings, type InvState } from "./actions";

function Result({ state }: { state: InvState }) {
  if (!state) return null;
  return (
    <div role="status" className={`text-sm font-semibold ${state.ok ? "text-success" : "text-danger"}`}>
      {state.message}
      {state.details && state.details.length > 0 && (
        <ul className="mt-2 max-h-40 list-disc overflow-y-auto pl-5 text-xs font-normal text-ink-soft">
          {state.details.map((d) => <li key={d}>{d}</li>)}
        </ul>
      )}
    </div>
  );
}

const REASONS = ["Stocktake count", "Received delivery", "Damaged / unsellable", "Lost or stolen", "Correction", "Returned to stock", "Other"];

export function AdjustForm({ variantId, onHand }: { variantId: string; onHand: number }) {
  const [state, action, pending] = useActionState(adjustStock, null);
  const [mode, setMode] = useState<"set" | "add" | "remove">("add");
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="variantId" value={variantId} />
      <fieldset className="flex flex-wrap gap-2">
        <legend className="label">Change</legend>
        {(
          [
            ["add", "Add units"],
            ["remove", "Remove units"],
            ["set", "Set exact count"],
          ] as const
        ).map(([k, l]) => (
          <label key={k} className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm font-semibold ${mode === k ? "border-ink bg-ink text-white" : "border-line"}`}>
            <input type="radio" name="mode" value={k} checked={mode === k} onChange={() => setMode(k)} className="sr-only" />
            {l}
          </label>
        ))}
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label">{mode === "set" ? `New count (now ${onHand})` : "Quantity"}</span>
          <input name="quantity" type="number" min={0} required className="field" />
        </label>
        <label className="block">
          <span className="label">Reason</span>
          <select name="reason" className="field" defaultValue={mode === "set" ? "Stocktake count" : "Received delivery"}>
            {REASONS.map((r) => <option key={r}>{r}</option>)}
          </select>
        </label>
      </div>
      <label className="block">
        <span className="label">Note (required for “Other”)</span>
        <input name="note" maxLength={300} className="field" placeholder="e.g. PO #1234, shelf count by Tasha" />
      </label>
      <div className="flex items-center gap-3">
        <button disabled={pending} className="btn btn-primary btn-sm">{pending ? "Saving…" : "Record change"}</button>
        <Result state={state} />
      </div>
    </form>
  );
}

export function BalanceSettingsForm({ variantId, safetyStock, paused }: { variantId: string; safetyStock: number; paused: boolean }) {
  const [state, action, pending] = useActionState(updateBalanceSettings, null);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="variantId" value={variantId} />
      <label className="block">
        <span className="label">Safety stock (units never sold online)</span>
        <input name="safetyStock" type="number" min={0} defaultValue={safetyStock} className="field" />
      </label>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" name="paused" defaultChecked={paused} className="h-4 w-4 accent-red-600" />
        Pause online checkout for this SKU
      </label>
      <div className="flex items-center gap-3">
        <button disabled={pending} className="btn btn-outline btn-sm">Save</button>
        <Result state={state} />
      </div>
    </form>
  );
}

export function StockImportForm() {
  const [state, action, pending] = useActionState(importStockCsv, null);
  return (
    <form action={action} className="space-y-3">
      <input type="file" name="file" accept=".csv,text/csv" required className="block w-full text-sm" />
      <button disabled={pending} className="btn btn-primary btn-sm">{pending ? "Importing…" : "Import counts"}</button>
      <Result state={state} />
    </form>
  );
}

export function CatalogImportForm() {
  const [state, action, pending] = useActionState(importCatalogCsv, null);
  return (
    <form action={action} className="space-y-3">
      <input type="file" name="file" accept=".csv,text/csv" required className="block w-full text-sm" />
      <button disabled={pending} className="btn btn-primary btn-sm">{pending ? "Importing…" : "Import catalog"}</button>
      <Result state={state} />
    </form>
  );
}
