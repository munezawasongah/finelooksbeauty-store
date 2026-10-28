"use client";

import { useActionState } from "react";
import { saveDiscount } from "./actions";

export function DiscountForm() {
  const [state, action, pending] = useActionState(saveDiscount, null);
  return (
    <form action={action} className="grid gap-3 md:grid-cols-4">
      <label className="block">
        <span className="label">Code</span>
        <input name="code" required className="field font-mono uppercase" placeholder="SISTER10" />
      </label>
      <label className="block">
        <span className="label">Type</span>
        <select name="type" className="field">
          <option value="percent">Percent off</option>
          <option value="fixed">Dollars off</option>
        </select>
      </label>
      <label className="block">
        <span className="label">Value</span>
        <input name="value" inputMode="decimal" required className="field" placeholder="10" />
      </label>
      <label className="block">
        <span className="label">Minimum spend ($)</span>
        <input name="minSubtotal" inputMode="decimal" defaultValue="0" className="field" />
      </label>
      <label className="block">
        <span className="label">Starts (optional)</span>
        <input name="startsAt" type="date" className="field" />
      </label>
      <label className="block">
        <span className="label">Ends (optional)</span>
        <input name="endsAt" type="date" className="field" />
      </label>
      <label className="block">
        <span className="label">Total uses (optional)</span>
        <input name="usageLimit" type="number" min={1} className="field" />
      </label>
      <label className="block">
        <span className="label">Note</span>
        <input name="description" maxLength={120} className="field" />
      </label>
      <div className="flex items-center gap-4 md:col-span-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked className="h-4 w-4 accent-iris-600" /> Active
        </label>
        <button disabled={pending} className="btn btn-primary btn-sm">{pending ? "Saving…" : "Create code"}</button>
        {state && <span role="status" className={`text-sm font-semibold ${state.ok ? "text-success" : "text-danger"}`}>{state.message}</span>}
      </div>
    </form>
  );
}
