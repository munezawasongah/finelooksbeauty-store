"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Lock, MapPin, Truck } from "lucide-react";
import { startCheckout } from "./actions";

type Defaults = { email: string; firstName: string; lastName: string; phone: string };

export function CheckoutForm({
  defaults,
  pickupEnabled,
  pickupLabel,
  pickupInstructions,
  shipping,
  paymentsReady,
}: {
  defaults: Defaults;
  pickupEnabled: boolean;
  pickupLabel: string;
  pickupInstructions: string;
  shipping: { id: string; name: string; price: string; days: string }[];
  paymentsReady: boolean;
}) {
  const [state, action, pending] = useActionState(startCheckout, null);
  const [method, setMethod] = useState<"ship" | "pickup">(shipping.length ? "ship" : "pickup");
  const err = (k: string) => state?.fields?.[k];

  return (
    <form action={action} className="space-y-8" noValidate>
      <section className="card p-6 sm:p-8" aria-labelledby="contact-h">
        <h2 id="contact-h" className="font-display text-2xl">
          Contact
        </h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field id="email" label="Email" type="email" autoComplete="email" defaultValue={defaults.email} error={err("email")} className="sm:col-span-2" required />
          <Field id="firstName" label="First name" autoComplete="given-name" defaultValue={defaults.firstName} error={err("firstName")} required />
          <Field id="lastName" label="Last name" autoComplete="family-name" defaultValue={defaults.lastName} error={err("lastName")} required />
          <Field
            id="phone"
            label="Phone (optional)"
            type="tel"
            autoComplete="tel-national"
            placeholder="(919) 555-0123"
            defaultValue={defaults.phone}
            error={err("phone")}
            hint="For delivery or pickup questions only."
            className="sm:col-span-2"
          />
        </div>
        <label className="mt-5 flex cursor-pointer items-start gap-3 text-sm text-ink-soft">
          <input type="checkbox" name="marketing" className="mt-0.5 h-4 w-4 accent-iris-600" />
          <span>Email me about new arrivals and offers. You can unsubscribe at any time.</span>
        </label>
      </section>

      <section className="card p-6 sm:p-8" aria-labelledby="fulfil-h">
        <h2 id="fulfil-h" className="font-display text-2xl">
          Delivery
        </h2>
        <fieldset className="mt-5 grid gap-3 sm:grid-cols-2">
          <legend className="sr-only">How would you like to get your order?</legend>
          {shipping.length > 0 && (
            <Choice
              checked={method === "ship"}
              onSelect={() => setMethod("ship")}
              value="ship"
              icon={<Truck size={20} aria-hidden />}
              title="Ship to me"
              text="U.S. addresses. Choose your carrier on the next page."
            />
          )}
          {pickupEnabled && (
            <Choice
              checked={method === "pickup"}
              onSelect={() => setMethod("pickup")}
              value="pickup"
              icon={<MapPin size={20} aria-hidden />}
              title="Pick up in store — free"
              text={pickupLabel}
            />
          )}
        </fieldset>
        {method === "ship" ? (
          <ul className="mt-5 divide-y divide-line rounded-2xl border border-line text-sm">
            {shipping.map((s) => (
              <li key={s.id} className="flex items-center justify-between px-4 py-3">
                <span>
                  <span className="font-semibold">{s.name}</span>
                  <span className="block text-xs text-muted">{s.days}</span>
                </span>
                <span className="font-semibold">{s.price}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-5 rounded-2xl bg-mist p-4 text-sm text-ink-soft">{pickupInstructions}</p>
        )}
      </section>

      {state && !state.ok && (
        <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-danger" role="alert">
          {state.message}
        </p>
      )}

      <div>
        <button type="submit" disabled={pending || !paymentsReady} className="btn btn-primary w-full !py-4 text-base">
          <Lock size={18} aria-hidden /> {pending ? "Opening secure payment…" : "Continue to secure payment"}
        </button>
        <p className="mt-3 text-center text-xs leading-relaxed text-muted">
          You&apos;ll pay on Stripe&apos;s secure page. Your items are held for about 30 minutes while you pay. By
          placing an order you agree to our{" "}
          <Link href="/policies/terms" className="underline">
            terms of sale
          </Link>
          ,{" "}
          <Link href="/policies/returns" className="underline">
            returns policy
          </Link>{" "}
          and{" "}
          <Link href="/policies/privacy" className="underline">
            privacy policy
          </Link>
          .
        </p>
        {!paymentsReady && (
          <p className="mt-3 text-center text-sm font-semibold text-warning">
            Online payment isn&apos;t switched on yet. Please call the store to order.
          </p>
        )}
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  error,
  hint,
  className = "",
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { id: string; label: string; error?: string; hint?: string }) {
  const describedBy = [error ? `${id}-err` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <input id={id} name={id} className="field" aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...rest} />
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-err`} className="mt-1 text-xs font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function Choice({
  checked,
  onSelect,
  value,
  icon,
  title,
  text,
}: {
  checked: boolean;
  onSelect: () => void;
  value: string;
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <label
      className={`flex cursor-pointer gap-3 rounded-2xl border-[1.5px] p-4 transition-colors ${
        checked ? "border-iris-600 bg-iris-50" : "border-line hover:border-iris-200"
      }`}
    >
      <input type="radio" name="fulfillment" value={value} checked={checked} onChange={onSelect} className="sr-only" />
      <span className={`mt-0.5 ${checked ? "text-iris-600" : "text-muted"}`}>{icon}</span>
      <span>
        <span className="block font-bold">{title}</span>
        <span className="block text-xs text-muted">{text}</span>
      </span>
    </label>
  );
}
