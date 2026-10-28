"use server";

import { and, eq, ne } from "drizzle-orm";
import { assertStaff } from "@/server/auth/session";
import { checkPasswordPolicy, hashPassword, verifyPassword } from "@/server/auth/password";
import { generateRecoveryCodes, verifyUserTotp } from "@/server/auth/mfa";
import { db } from "@/server/db";
import { sessions, users } from "@/server/db/schema";
import { audit } from "@/server/audit";
import { rateLimit } from "@/server/redis";

export type AccState = { ok: boolean; message: string; codes?: string[] } | null;

export async function changePassword(_: AccState, form: FormData): Promise<AccState> {
  const ctx = await assertStaff("dashboard.view");
  if (!(await rateLimit(`pwchange:${ctx.user.id}`, 5, 900))) return { ok: false, message: "Too many attempts. Try later." };
  const current = String(form.get("current") ?? "");
  const next = String(form.get("next") ?? "");
  if (!(await verifyPassword(current, ctx.user.passwordHash))) return { ok: false, message: "Your current password is wrong." };
  const problem = await checkPasswordPolicy(next, [ctx.user.email, ctx.user.name]);
  if (problem) return { ok: false, message: problem };
  await db().update(users).set({ passwordHash: await hashPassword(next), updatedAt: new Date() }).where(eq(users.id, ctx.user.id));
  // Sign out every other session.
  await db().delete(sessions).where(and(eq(sessions.userId, ctx.user.id), ne(sessions.id, ctx.session.id)));
  await audit(ctx.actor, "staff.password_change", "user", ctx.user.id);
  return { ok: true, message: "Password changed. Other devices were signed out." };
}

export async function regenerateCodes(_: AccState, form: FormData): Promise<AccState> {
  const ctx = await assertStaff("dashboard.view");
  if (!(await verifyUserTotp(ctx.user, String(form.get("code") ?? "")))) {
    return { ok: false, message: "Enter a current code from your authenticator app." };
  }
  const { codes, hashes } = generateRecoveryCodes();
  await db().update(users).set({ mfaRecoveryHashes: hashes }).where(eq(users.id, ctx.user.id));
  await audit(ctx.actor, "staff.recovery_codes", "user", ctx.user.id);
  return { ok: true, message: "New codes — save them now:", codes };
}
