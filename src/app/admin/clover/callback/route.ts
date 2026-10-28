import { cookies } from "next/headers";
import { getStaffSession } from "@/server/auth/session";
import { can, type Role } from "@/server/auth/permissions";
import { exchangeCode, saveConnection } from "@/server/clover/client";
import { audit } from "@/server/audit";
import { enqueue } from "@/server/queue";
import { env } from "@/server/env";
import { safeEqual } from "@/server/crypto";

/** Clover redirects here with ?code&merchant_id&state after the merchant approves the app. */
export async function GET(req: Request) {
  const ctx = await getStaffSession();
  const base = env().APP_URL.replace(/\/$/, "");
  if (!ctx?.session.mfaVerified || !can(ctx.user.role as Role, "integrations.manage")) {
    return Response.redirect(`${base}/admin/login`, 302);
  }
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const merchantId = url.searchParams.get("merchant_id");
  const state = url.searchParams.get("state") ?? "";
  const store = await cookies();
  const expected = store.get("fl_clover_state")?.value ?? "";
  store.delete("fl_clover_state");
  if (!code || !merchantId || !expected || !safeEqual(state, expected)) {
    return Response.redirect(`${base}/admin/integrations?clover=invalid`, 302);
  }
  try {
    const tokens = await exchangeCode(code);
    await saveConnection(merchantId, tokens);
    await audit(ctx.actor, "clover.connected", "integration", merchantId, { environment: env().CLOVER_ENVIRONMENT });
    await enqueue("clover:import", { triggeredBy: ctx.user.email });
  } catch (err) {
    console.error("[clover] connect failed", err);
    return Response.redirect(`${base}/admin/integrations?clover=failed`, 302);
  }
  return Response.redirect(`${base}/admin/integrations?clover=connected`, 302);
}
