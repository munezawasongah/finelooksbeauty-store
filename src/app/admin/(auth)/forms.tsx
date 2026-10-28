"use client";

import { useActionState, useState } from "react";
import { Copy, Download } from "lucide-react";
import { acceptInvite, confirmMfaSetup, createFirstOwner, staffLogin, verifyMfa, type AuthState } from "./actions";

function Err({ state }: { state: AuthState }) {
  if (!state || state.ok) return null;
  return (
    <p role="alert" className="rounded-xl bg-red-50 px-3 py-2.5 text-sm font-semibold text-danger">
      {state.message}
    </p>
  );
}

export function LoginForm() {
  const [state, action, pending] = useActionState(staffLogin, null);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="email" className="label">Email</label>
        <input id="email" name="email" type="email" autoComplete="username" required className="field" />
      </div>
      <div>
        <label htmlFor="password" className="label">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="field" />
      </div>
      <Err state={state} />
      <button disabled={pending} className="btn btn-primary w-full">{pending ? "Checking…" : "Continue"}</button>
    </form>
  );
}

export function MfaForm() {
  const [state, action, pending] = useActionState(verifyMfa, null);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="code" className="label">6-digit code or recovery code</label>
        <input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          autoFocus
          className="field text-center font-mono text-2xl tracking-[0.4em]"
          maxLength={12}
        />
      </div>
      <Err state={state} />
      <button disabled={pending} className="btn btn-primary w-full">{pending ? "Verifying…" : "Verify"}</button>
    </form>
  );
}

export function MfaSetupForm() {
  const [state, action, pending] = useActionState(confirmMfaSetup, null);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="code" className="label">Enter the 6-digit code from the app</label>
        <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" required className="field text-center font-mono text-2xl tracking-[0.4em]" maxLength={6} />
      </div>
      <Err state={state} />
      <button disabled={pending} className="btn btn-primary w-full">{pending ? "Checking…" : "Turn on two-step verification"}</button>
    </form>
  );
}

export function RecoveryCodes({ codes }: { codes: string[] }) {
  const [copied, setCopied] = useState(false);
  const text = codes.join("\n");
  return (
    <div className="space-y-4">
      <ul className="grid grid-cols-2 gap-2 rounded-xl bg-mist p-4 font-mono text-sm">
        {codes.map((c) => <li key={c}>{c}</li>)}
      </ul>
      <div className="flex gap-2">
        <button type="button" className="btn btn-outline btn-sm" onClick={() => navigator.clipboard.writeText(text).then(() => setCopied(true))}>
          <Copy size={14} aria-hidden /> {copied ? "Copied" : "Copy"}
        </button>
        <a className="btn btn-outline btn-sm" download="fine-looks-recovery-codes.txt" href={`data:text/plain;charset=utf-8,${encodeURIComponent(text)}`}>
          <Download size={14} aria-hidden /> Download
        </a>
      </div>
    </div>
  );
}

export function SetupForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(createFirstOwner, null);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <div>
        <label htmlFor="name" className="label">Your name</label>
        <input id="name" name="name" required autoComplete="name" className="field" />
      </div>
      <div>
        <label htmlFor="email" className="label">Email</label>
        <input id="email" name="email" type="email" required autoComplete="username" className="field" />
      </div>
      <div>
        <label htmlFor="password" className="label">Password (12+ characters)</label>
        <input id="password" name="password" type="password" required minLength={12} autoComplete="new-password" className="field" />
      </div>
      <Err state={state} />
      <button disabled={pending} className="btn btn-primary w-full">{pending ? "Creating…" : "Create owner account"}</button>
    </form>
  );
}

export function InviteForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(acceptInvite, null);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <div>
        <label htmlFor="password" className="label">Choose a password (12+ characters)</label>
        <input id="password" name="password" type="password" required minLength={12} autoComplete="new-password" className="field" />
      </div>
      <Err state={state} />
      <button disabled={pending} className="btn btn-primary w-full">{pending ? "Saving…" : "Save and continue"}</button>
    </form>
  );
}
