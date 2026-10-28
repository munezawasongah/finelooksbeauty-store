"use client";

import { useActionState } from "react";
import { trackOrder } from "./actions";

export function TrackForm({ defaultOrder }: { defaultOrder: string }) {
  const [state, action, pending] = useActionState(trackOrder, null);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="order" className="label">
          Order number
        </label>
        <input id="order" name="order" required placeholder="FL-100123" defaultValue={defaultOrder} className="field uppercase" autoComplete="off" />
      </div>
      <div>
        <label htmlFor="email" className="label">
          Email
        </label>
        <input id="email" name="email" type="email" required autoComplete="email" className="field" />
      </div>
      {state && (
        <p className="text-sm font-semibold text-danger" role="alert">
          {state.message}
        </p>
      )}
      <button disabled={pending} className="btn btn-primary w-full">
        {pending ? "Looking…" : "Find my order"}
      </button>
    </form>
  );
}
