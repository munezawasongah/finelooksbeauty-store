import { cookies } from "next/headers";
import { getStaffSession } from "@/server/auth/session";
import { can, type Role } from "@/server/auth/permissions";
import { cloverUrls } from "@/server/clover/client";
import { env, isCloverConfigured } from "@/server/env";
import { randomToken } from "@/server/crypto";

/** Starts the Clover OAuth v2 flow (North America). */
export async function GET() {
  const ctx = await getStaffSession();
  if (!ctx?.session.mfaVerified || !can(ctx.user.role as Role, "integrations.manage")) {
    return new Response("Forbidden", { status: 403 });
  }
  if (!isCloverConfigured()) return new Response("Set CLOVER_APP_ID and CLOVER_APP_SECRET first.", { status: 400 });
  const state = randomToken(18);
  (await cookies()).set("fl_clover_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/admin/clover",
    maxAge: 600,
  });
  const u = new URL(cloverUrls().authorize);
  u.searchParams.set("client_id", env().CLOVER_APP_ID!);
  u.searchParams.set("redirect_uri", `${env().APP_URL.replace(/\/$/, "")}/admin/clover/callback`);
  u.searchParams.set("state", state);
  return Response.redirect(u.toString(), 302);
}
