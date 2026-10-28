"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  register,
  requestPasswordReset,
  resetPassword,
  signIn,
  updateProfile,
  type FormState,
} from "./actions";

function Input({
  name,
  label,
  state,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { name: string; label: string; state: FormState }) {
  const err = state?.fields?.[name];
  return (
    <div>
      <label htmlFor={`f-${name}`} className="label">
        {label}
      </label>
      <input
        id={`f-${name}`}
        name={name}
        className="field"
        aria-invalid={err ? true : undefined}
        aria-describedby={err ? `f-${name}-err` : undefined}
        {...rest}
      />
      {err && (
        <p id={`f-${name}-err`} className="mt-1 text-xs font-semibold text-danger">
          {err}
        </p>
      )}
    </div>
  );
}

function Message({ state }: { state: FormState }) {
  if (!state) return null;
  return (
    <p
      role={state.ok ? "status" : "alert"}
      className={`rounded-2xl px-4 py-3 text-sm font-semibold ${state.ok ? "bg-green-50 text-success" : "bg-red-50 text-danger"}`}
    >
      {state.message}
    </p>
  );
}

export function SignInForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signIn, null);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <Input name="email" label="Email" type="email" autoComplete="email" required state={state} />
      <Input name="password" label="Password" type="password" autoComplete="current-password" required state={state} />
      <Message state={state} />
      <button disabled={pending} className="btn btn-primary w-full">
        {pending ? "Signing in…" : "Sign in"}
      </button>
      <p className="text-center text-sm">
        <Link href="/account/forgot" className="text-iris-700 underline">
          Forgot your password?
        </Link>
      </p>
    </form>
  );
}

export function RegisterForm() {
  const [state, action, pending] = useActionState(register, null);
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Input name="firstName" label="First name" autoComplete="given-name" required state={state} />
        <Input name="lastName" label="Last name" autoComplete="family-name" required state={state} />
      </div>
      <Input name="email" label="Email" type="email" autoComplete="email" required state={state} />
      <Input name="password" label="Password (12+ characters)" type="password" autoComplete="new-password" minLength={12} required state={state} />
      <label className="flex items-start gap-3 text-sm text-ink-soft">
        <input type="checkbox" name="marketing" className="mt-0.5 h-4 w-4 accent-iris-600" />
        Email me about new arrivals and offers.
      </label>
      <Message state={state} />
      <button disabled={pending} className="btn btn-primary w-full">
        {pending ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}

export function ForgotForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, null);
  return (
    <form action={action} className="space-y-4">
      <Input name="email" label="Email" type="email" autoComplete="email" required state={state} />
      <Message state={state} />
      <button disabled={pending} className="btn btn-primary w-full">
        {pending ? "Sending…" : "Send reset link"}
      </button>
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPassword, null);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <Input name="password" label="New password (12+ characters)" type="password" autoComplete="new-password" minLength={12} required state={state} />
      <Message state={state} />
      <button disabled={pending} className="btn btn-primary w-full">
        {pending ? "Saving…" : "Save new password"}
      </button>
    </form>
  );
}

export function ProfileForm({
  defaults,
}: {
  defaults: { firstName: string; lastName: string; phone: string; marketing: boolean };
}) {
  const [state, action, pending] = useActionState(updateProfile, null);
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Input name="firstName" label="First name" defaultValue={defaults.firstName} required state={state} />
        <Input name="lastName" label="Last name" defaultValue={defaults.lastName} required state={state} />
      </div>
      <Input name="phone" label="Phone" type="tel" defaultValue={defaults.phone} state={state} />
      <label className="flex items-start gap-3 text-sm text-ink-soft">
        <input type="checkbox" name="marketing" defaultChecked={defaults.marketing} className="mt-0.5 h-4 w-4 accent-iris-600" />
        Email me about new arrivals and offers.
      </label>
      <Message state={state} />
      <button disabled={pending} className="btn btn-dark btn-sm">
        {pending ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
