"use client";

import { useActionState } from "react";
import { changePassword, regenerateCodes } from "./actions";

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePassword, null);
  return (
    <form action={action} className="space-y-3">
      <label className="block">
        <span className="label">Current password</span>
        <input name="current" type="password" autoComplete="current-password" required className="field" />
      </label>
      <label className="block">
        <span className="label">New password (12+ characters)</span>
        <input name="next" type="password" autoComplete="new-password" minLength={12} required className="field" />
      </label>
      <button disabled={pending} className="btn btn-primary btn-sm">{pending ? "Saving…" : "Change password"}</button>
      {state && <p role="status" className={`text-sm font-semibold ${state.ok ? "text-success" : "text-danger"}`}>{state.message}</p>}
    </form>
  );
}

export function RecoveryCodesForm() {
  const [state, action, pending] = useActionState(regenerateCodes, null);
  return (
    <form action={action} className="space-y-3">
      <label className="block">
        <span className="label">Current authenticator code</span>
        <input name="code" inputMode="numeric" autoComplete="one-time-code" required className="field font-mono tracking-widest" maxLength={6} />
      </label>
      <button disabled={pending} className="btn btn-outline btn-sm">{pending ? "Generating…" : "Generate new codes"}</button>
      {state && <p role="status" className={`text-sm font-semibold ${state.ok ? "text-success" : "text-danger"}`}>{state.message}</p>}
      {state?.codes && (
        <ul className="grid grid-cols-2 gap-2 rounded-xl bg-mist p-4 font-mono text-sm">
          {state.codes.map((c) => <li key={c}>{c}</li>)}
        </ul>
      )}
    </form>
  );
}
