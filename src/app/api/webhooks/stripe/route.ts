import { isStripeConfigured } from "@/server/env";
import { verifyStripeEvent } from "@/server/payments/stripe";
import { dispatchEvent, recordEvent } from "@/server/events";
import { rateLimit } from "@/server/redis";

/**
 * Stripe webhook: verify signature on the raw body → store the event once →
 * enqueue processing → return 200 quickly (section 10).
 */
export async function POST(req: Request) {
  if (!isStripeConfigured()) return new Response("Stripe not configured", { status: 503 });
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (!(await rateLimit(`wh:stripe:${ip}`, 600, 60))) return new Response("Too many requests", { status: 429 });

  const raw = await req.text();
  let event;
  try {
    event = verifyStripeEvent(raw, req.headers.get("stripe-signature"));
  } catch (err) {
    console.warn("[stripe webhook] signature verification failed", err instanceof Error ? err.message : err);
    return new Response("Invalid signature", { status: 400 });
  }

  const id = await recordEvent("stripe", event.id, event.type, event);
  if (id) await dispatchEvent(id);
  return Response.json({ received: true, duplicate: !id });
}
