"use client";

import { useActionState } from "react";
import { applyDiscountCode } from "../actions";

export function DiscountForm() {
  const [state, action, pending] = useActionState(applyDiscountCode, null);
  return (
    <form action={action}>
      <label htmlFor="discount" className="label">
        Discount code
      </label>
      <div className="flex gap-2">
        <input id="discount" name="code" autoComplete="off" className="field !py-2.5 uppercase" />
        <button disabled={pending} className="btn btn-outline btn-sm shrink-0">
          {pending ? "…" : "Apply"}
        </button>
      </div>
      {state && (
        <p className={`mt-2 text-xs font-semibold ${state.ok ? "text-success" : "text-danger"}`} role="status">
          {state.message}
        </p>
      )}
    </form>
  );
}
