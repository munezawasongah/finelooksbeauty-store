import Stripe from "stripe";
import { env, isStripeConfigured } from "../env";

const g = globalThis as unknown as { __flStripe?: Stripe };

export function stripe(): Stripe {
  if (!isStripeConfigured()) throw new Error("Stripe is not configured (STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET).");
  if (!g.__flStripe) {
    g.__flStripe = new Stripe(env().STRIPE_SECRET_KEY!, {
      maxNetworkRetries: 2,
      timeout: 20_000,
      appInfo: { name: "Fine Looks Store", version: "1.0.0" },
    });
  }
  return g.__flStripe;
}

export function stripeMode(): "test" | "live" | "off" {
  const k = env().STRIPE_SECRET_KEY;
  if (!k) return "off";
  return k.startsWith("sk_live_") || k.startsWith("rk_live_") ? "live" : "test";
}

/** Verifies the Stripe-Signature header against the raw request body. Throws on mismatch. */
export function verifyStripeEvent(rawBody: string, signature: string | null): Stripe.Event {
  if (!signature) throw new Error("Missing Stripe-Signature header");
  return stripe().webhooks.constructEvent(rawBody, signature, env().STRIPE_WEBHOOK_SECRET!, 300);
}

export type { Stripe };
