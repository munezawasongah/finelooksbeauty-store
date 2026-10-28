"use client";

import { useActionState, useState } from "react";
import { addNote, changeStatus, issueRefund, type ActionResult } from "../actions";
import { money } from "@/lib/format";

const LABELS: Record<string, string> = {
  processing: "Mark as processing",
  ready_for_pickup: "Ready for pickup (emails customer)",
  shipped: "Mark shipped (emails customer)",
  delivered: "Mark completed",
  cancelled: "Cancel order",
};

function Result({ state }: { state: ActionResult }) {
  if (!state) return null;
  return (
    <p role="status" className={`text-sm font-semibold ${state.ok ? "text-success" : "text-danger"}`}>
      {state.message}
    </p>
  );
}

export function StatusForm({
  orderId,
  options,
  method,
  carrier,
  tracking,
  canCancel,
}: {
  orderId: string;
  options: string[];
  method: "ship" | "pickup";
  carrier: string | null;
  tracking: string | null;
  canCancel: boolean;
}) {
  const [state, action, pending] = useActionState(changeStatus, null);
  const allowed = options.filter((o) => (o === "cancelled" ? canCancel : true));
  const [to, setTo] = useState(allowed[0] ?? "");
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="orderId" value={orderId} />
      <div className="flex flex-wrap gap-2">
        {allowed.map((o) => (
          <label key={o} className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm font-semibold ${to === o ? "border-ink bg-ink text-white" : "border-line"}`}>
            <input type="radio" name="to" value={o} checked={to === o} onChange={() => setTo(o)} className="sr-only" />
            {LABELS[o] ?? o}
          </label>
        ))}
      </div>
      {to === "shipped" && method === "ship" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="carrier">Carrier</label>
            <select id="carrier" name="carrier" defaultValue={carrier ?? "USPS"} className="field">
              <option>USPS</option>
              <option>UPS</option>
              <option>FedEx</option>
              <option>Other</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="tracking">Tracking number</label>
            <input id="tracking" name="trackingNumber" defaultValue={tracking ?? ""} className="field" />
          </div>
        </div>
      )}
      <div>
        <label className="label" htmlFor="snote">Note (optional, internal)</label>
        <input id="snote" name="note" className="field" maxLength={500} />
      </div>
      <div className="flex items-center gap-3">
        <button disabled={pending || !to} className={`btn btn-sm ${to === "cancelled" ? "border-[1.5px] border-danger text-danger" : "btn-primary"}`}>
          {pending ? "Saving…" : "Update order"}
        </button>
        <Result state={state} />
      </div>
    </form>
  );
}

export function RefundForm({
  orderId,
  refundable,
  items,
}: {
  orderId: string;
  refundable: number;
  items: { id: string; title: string; label: string | null; max: number }[];
}) {
  const [state, action, pending] = useActionState(issueRefund, null);
  const [idem] = useState(() => crypto.randomUUID());
  const [confirm, setConfirm] = useState(false);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="idem" value={idem} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="amount">Amount (USD) — up to {money(refundable)}</label>
          <input id="amount" name="amount" inputMode="decimal" defaultValue={(refundable / 100).toFixed(2)} className="field" required />
        </div>
        <div>
          <label className="label" htmlFor="reason">Reason</label>
          <input id="reason" name="reason" className="field" required placeholder="e.g. Returned unopened" />
        </div>
      </div>
      <fieldset>
        <legend className="label">Return items to sellable stock? (only unopened, resellable items)</legend>
        <ul className="space-y-2">
          {items.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-3 text-sm">
              <span>
                {i.title}
                {i.label ? <span className="text-muted"> · {i.label}</span> : null}
              </span>
              <span className="flex items-center gap-2">
                <label className="sr-only" htmlFor={`rs-${i.id}`}>Units to restock</label>
                <input id={`rs-${i.id}`} name={`restock:${i.id}`} type="number" min={0} max={i.max} defaultValue={0} className="field !w-20 !py-1.5" />
                <span className="text-xs text-muted">of {i.max}</span>
              </span>
            </li>
          ))}
        </ul>
      </fieldset>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} className="h-4 w-4 accent-iris-600" />
        I confirm this refund. It goes back to the customer&apos;s card and can&apos;t be undone.
      </label>
      <div className="flex items-center gap-3">
        <button disabled={pending || !confirm} className="btn btn-dark btn-sm">
          {pending ? "Sending to Stripe…" : "Issue refund"}
        </button>
        <Result state={state} />
      </div>
    </form>
  );
}

export function NoteForm({ orderId }: { orderId: string }) {
  const [state, action, pending] = useActionState(addNote, null);
  return (
    <form action={action} className="flex flex-wrap items-start gap-2">
      <input type="hidden" name="orderId" value={orderId} />
      <label htmlFor="note" className="sr-only">Internal note</label>
      <input id="note" name="note" placeholder="Add an internal note" className="field flex-1 !py-2" maxLength={1000} />
      <button disabled={pending} className="btn btn-outline btn-sm">Add note</button>
      <Result state={state} />
    </form>
  );
}
