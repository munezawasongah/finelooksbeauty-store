"use client";

import { useActionState } from "react";
import { approve, createFromClover, retryPushes, runImport, runReconcile, type IntState } from "./actions";

const RUN = { import: runImport, reconcile: runReconcile, retry: retryPushes };

export function ActionButton({ kind, label }: { kind: keyof typeof RUN; label: string }) {
  const [state, action, pending] = useActionState<IntState, FormData>(() => RUN[kind](), null);
  return (
    <form action={action} className="flex flex-col">
      <button disabled={pending} className="btn btn-outline btn-sm">{pending ? "Working…" : label}</button>
      {state && <span className={`mt-1 max-w-xs text-xs font-semibold ${state.ok ? "text-success" : "text-danger"}`}>{state.message}</span>}
    </form>
  );
}

export function ApproveForm({ mappingId, suggestedSku }: { mappingId: string; suggestedSku: string }) {
  const [state, action, pending] = useActionState(approve, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="mappingId" value={mappingId} />
      <label className="sr-only" htmlFor={`sku-${mappingId}`}>Website SKU</label>
      <input id={`sku-${mappingId}`} name="sku" defaultValue={suggestedSku} placeholder="Website SKU" className="field !w-32 !py-1.5 font-mono text-xs uppercase" />
      <button disabled={pending} className="btn btn-primary btn-sm !px-3 !py-1.5 text-xs">{suggestedSku ? "Approve" : "Link"}</button>
      {state && <span className={`w-full text-xs font-semibold ${state.ok ? "text-success" : "text-danger"}`}>{state.message}</span>}
    </form>
  );
}

export function CreateFromCloverButton({ mappingId }: { mappingId: string }) {
  const [state, action, pending] = useActionState(createFromClover, null);
  return (
    <form action={action}>
      <input type="hidden" name="mappingId" value={mappingId} />
      <button disabled={pending} className="text-xs font-bold text-iris-700">{pending ? "Creating…" : "Create website product"}</button>
      {state && <span className={`block text-xs font-semibold ${state.ok ? "text-success" : "text-danger"}`}>{state.message}</span>}
    </form>
  );
}
