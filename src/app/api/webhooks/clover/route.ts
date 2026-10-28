import { env } from "@/server/env";
import { safeEqual } from "@/server/crypto";
import { cloverEventId, dispatchEvent, recordEvent } from "@/server/events";
import { raiseAlert } from "@/server/audit";
import { rateLimit } from "@/server/redis";

type CloverBody = {
  verificationCode?: string;
  appId?: string;
  merchants?: Record<string, { objectId: string; type: "CREATE" | "UPDATE" | "DELETE"; ts: number }[]>;
};

/**
 * Clover webhook (section 8.2): validate the X-Clover-Auth code, persist each
 * update durably, acknowledge promptly, process asynchronously.
 */
export async function POST(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (!(await rateLimit(`wh:clover:${ip}`, 600, 60))) return new Response("Too many requests", { status: 429 });

  let body: CloverBody;
  try {
    body = (await req.json()) as CloverBody;
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  // One-time verification handshake from the Clover developer dashboard.
  if (body.verificationCode && !body.merchants) {
    await raiseAlert({
      kind: "clover_verification_code",
      severity: "info",
      message: `Clover webhook verification code: ${String(body.verificationCode).slice(0, 64)} — paste it into the Clover developer dashboard, then save the Auth Code it shows as CLOVER_WEBHOOK_AUTH_CODE.`,
      dedupeKey: `clover_verify:${String(body.verificationCode).slice(0, 64)}`,
    });
    return Response.json({ ok: true });
  }

  const expected = env().CLOVER_WEBHOOK_AUTH_CODE;
  const got = req.headers.get("x-clover-auth") ?? "";
  if (!expected || !safeEqual(got, expected)) return new Response("Unauthorized", { status: 401 });
  if (env().CLOVER_APP_ID && body.appId && body.appId !== env().CLOVER_APP_ID) {
    return new Response("Unknown app", { status: 401 });
  }

  for (const [merchantId, updates] of Object.entries(body.merchants ?? {})) {
    for (const u of updates ?? []) {
      if (!u?.objectId || !u.type) continue;
      const id = await recordEvent("clover", cloverEventId(merchantId, u), `${u.objectId.split(":")[0]}:${u.type}`, {
        merchantId,
        update: u,
      });
      if (id) await dispatchEvent(id);
    }
  }
  return Response.json({ ok: true });
}
