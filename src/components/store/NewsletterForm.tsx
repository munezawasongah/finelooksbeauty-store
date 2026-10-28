"use client";

import { useActionState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { subscribeNewsletter } from "@/app/(store)/actions";

export function NewsletterForm({ tone = "dark" }: { tone?: "dark" | "light" }) {
  const [state, action, pending] = useActionState(subscribeNewsletter, null);
  if (state?.ok) {
    return (
      <p className="flex items-center gap-2 rounded-full bg-white/10 px-5 py-4 text-sm font-semibold" role="status">
        <Check size={18} className="text-orchid-300" aria-hidden /> {state.message}
      </p>
    );
  }
  return (
    <form action={action} className="relative">
      <label htmlFor={`nl-email-${tone}`} className="sr-only">
        Email address
      </label>
      <input
        id={`nl-email-${tone}`}
        name="email"
        type="email"
        required
        autoComplete="email"
        placeholder="Your email address"
        aria-invalid={state && !state.ok ? true : undefined}
        aria-describedby={state && !state.ok ? `nl-err-${tone}` : undefined}
        className={`w-full rounded-full py-4 pl-5 pr-36 text-sm outline-none transition focus:ring-4 ${
          tone === "dark"
            ? "border border-white/20 bg-white/10 text-white placeholder:text-white/50 focus:ring-white/15"
            : "border border-line bg-white text-ink placeholder:text-muted focus:ring-iris-600/15"
        }`}
      />
      <input name="company" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <button
        type="submit"
        disabled={pending}
        className="btn btn-orchid btn-sm absolute right-1.5 top-1/2 -translate-y-1/2"
      >
        {pending ? "Joining…" : "Subscribe"} <ArrowRight size={15} aria-hidden />
      </button>
      {state && !state.ok && (
        <p id={`nl-err-${tone}`} className="mt-2 pl-5 text-xs text-orchid-200" role="alert">
          {state.message}
        </p>
      )}
    </form>
  );
}
