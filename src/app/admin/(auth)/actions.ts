"use server";

import { redirect } from "next/navigation";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { authTokens, staffDevices, users } from "@/server/db/schema";
import {
  createStaffSession,
  destroyStaffSession,
  deviceId,
  getStaffSession,
  requestMeta,
  rotateStaffSession,
} from "@/server/auth/session";
import { burnPasswordCheck, checkPasswordPolicy, hashPassword, verifyPassword } from "@/server/auth/password";
import { generateRecoveryCodes, verifyTotp, verifyUserTotp } from "@/server/auth/mfa";
import { decrypt, encrypt, safeEqual, sha256 } from "@/server/crypto";
import { cookies } from "next/headers";
import { rateLimit } from "@/server/redis";
import { audit, raiseAlert } from "@/server/audit";
import { enqueue } from "@/server/queue";
import { env } from "@/server/env";

export type AuthState = { ok: boolean; message: string; codes?: string[] } | null;

const LOCK_AFTER = 5;
const LOCK_MINUTES = 15;

export async function staffLogin(_: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const { ip } = await requestMeta();
  if (!(await rateLimit(`staff-login:ip:${ip}`, 20, 900)) || !(await rateLimit(`staff-login:${email}`, 8, 900))) {
    return { ok: false, message: "Too many attempts. Wait 15 minutes and try again." };
  }
  const user = await db().query.users.findFirst({ where: sql`lower(${users.email}) = ${email}` });
  if (!user || user.disabledAt) {
    await burnPasswordCheck(password);
    return { ok: false, message: "Email or password is incorrect." };
  }
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    return { ok: false, message: "This account is temporarily locked after failed attempts. Try again later." };
  }
  if (!(await verifyPassword(password, user.passwordHash))) {
    const failed = user.failedLogins + 1;
    const lock = failed >= LOCK_AFTER;
    await db()
      .update(users)
      .set({ failedLogins: lock ? 0 : failed, lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null })
      .where(eq(users.id, user.id));
    await audit({ userId: user.id, label: user.email, ip }, "staff.login_failed", "user", user.id, { failed });
    if (lock) {
      await raiseAlert({
        kind: "staff_lockout",
        severity: "warning",
        message: `Admin account ${user.email} was locked after ${LOCK_AFTER} failed sign-in attempts.`,
        dedupeKey: `lockout:${user.id}`,
      });
    }
    return { ok: false, message: "Email or password is incorrect." };
  }
  await db().update(users).set({ failedLogins: 0, lockedUntil: null }).where(eq(users.id, user.id));
  await createStaffSession(user.id, false);
  redirect(user.mfaEnabled ? "/admin/mfa" : "/admin/mfa/setup");
}

async function recordDevice(user: typeof users.$inferSelect) {
  const { ip, userAgent } = await requestMeta();
  const fp = sha256(`${await deviceId()}|${userAgent}`);
  const inserted = await db()
    .insert(staffDevices)
    .values({ userId: user.id, fingerprint: fp })
    .onConflictDoUpdate({ target: [staffDevices.userId, staffDevices.fingerprint], set: { lastSeenAt: new Date() } })
    .returning({ first: staffDevices.firstSeenAt });
  const isNew = inserted[0] && Date.now() - inserted[0].first.getTime() < 5_000;
  const hadDevices = await db().select({ n: sql<number>`count(*)::int` }).from(staffDevices).where(eq(staffDevices.userId, user.id));
  if (isNew && hadDevices[0].n > 1) {
    await enqueue("email:send", { template: "staff_new_device", to: "__staff__", data: { email: user.email, ip, userAgent } });
    await raiseAlert({ kind: "new_device", severity: "info", message: `${user.email} signed in from a new device (${ip}).` });
  }
}

export async function verifyMfa(_: AuthState, form: FormData): Promise<AuthState> {
  const ctx = await getStaffSession();
  if (!ctx) redirect("/admin/login");
  if (!(await rateLimit(`mfa:${ctx.user.id}`, 6, 300))) return { ok: false, message: "Too many codes. Wait 5 minutes." };
  const code = String(form.get("code") ?? "");
  if (!(await verifyUserTotp(ctx.user, code))) {
    await audit(ctx.actor, "staff.mfa_failed", "user", ctx.user.id);
    return { ok: false, message: "That code didn't work. Check your authenticator app and try again." };
  }
  await rotateStaffSession(ctx, { mfaVerified: true });
  await db().update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, ctx.user.id));
  await audit(ctx.actor, "staff.login", "user", ctx.user.id);
  await recordDevice(ctx.user);
  redirect("/admin");
}

const RECOVERY_COOKIE = "fl_recovery";

/** First-time MFA enrollment: confirms the pending secret with a code, then shows recovery codes once. */
export async function confirmMfaSetup(_: AuthState, form: FormData): Promise<AuthState> {
  const ctx = await getStaffSession();
  if (!ctx) redirect("/admin/login");
  if (ctx.user.mfaEnabled) redirect("/admin/mfa");
  if (!ctx.user.mfaSecretEnc) return { ok: false, message: "Reload the page to get a new QR code." };
  const res = await verifyTotp(decrypt(ctx.user.mfaSecretEnc), String(form.get("code") ?? ""), null);
  if (!res.ok) return { ok: false, message: "That code didn't match. Scan the QR code again and enter the new 6-digit code." };
  const { codes, hashes } = generateRecoveryCodes();
  await db()
    .update(users)
    .set({ mfaEnabled: true, mfaLastStep: res.step, mfaRecoveryHashes: hashes, lastLoginAt: new Date() })
    .where(eq(users.id, ctx.user.id));
  await rotateStaffSession(ctx, { mfaVerified: true });
  await audit(ctx.actor, "staff.mfa_enrolled", "user", ctx.user.id);
  await recordDevice(ctx.user);
  // Codes travel to the one-time display page encrypted, for 5 minutes at most.
  (await cookies()).set(RECOVERY_COOKIE, encrypt(JSON.stringify(codes)), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/admin",
    maxAge: 300,
  });
  redirect("/admin/recovery-codes");
}

export async function finishRecoveryCodes() {
  (await cookies()).delete({ name: RECOVERY_COOKIE, path: "/admin" });
  redirect("/admin");
}

export async function staffLogout() {
  const ctx = await getStaffSession();
  if (ctx) await audit(ctx.actor, "staff.logout", "user", ctx.user.id);
  await destroyStaffSession();
  redirect("/admin/login");
}

const setupSchema = z.object({
  token: z.string().min(24),
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1),
});

/** Creates the first owner. Only works when no staff exist and SETUP_TOKEN matches. */
export async function createFirstOwner(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = setupSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: "Fill in every field." };
  const expected = env().SETUP_TOKEN;
  if (!expected || !safeEqual(parsed.data.token, expected)) return { ok: false, message: "Setup link is not valid." };
  const [{ n }] = await db().select({ n: sql<number>`count(*)::int` }).from(users);
  if (n > 0) return { ok: false, message: "Setup is already complete. Sign in instead." };
  const problem = await checkPasswordPolicy(parsed.data.password, [parsed.data.email, parsed.data.name]);
  if (problem) return { ok: false, message: problem };
  const [u] = await db()
    .insert(users)
    .values({ email: parsed.data.email, name: parsed.data.name, role: "owner", passwordHash: await hashPassword(parsed.data.password) })
    .returning();
  await audit({ userId: u.id, label: u.email }, "staff.owner_created", "user", u.id);
  await createStaffSession(u.id, false);
  redirect("/admin/mfa/setup");
}

/** Accept a staff invite: choose a password, then enrol MFA. */
export async function acceptInvite(_: AuthState, form: FormData): Promise<AuthState> {
  const token = String(form.get("token") ?? "");
  const password = String(form.get("password") ?? "");
  const row = await db().query.authTokens.findFirst({
    where: and(
      eq(authTokens.id, sha256(token)),
      eq(authTokens.subjectType, "staff"),
      isNull(authTokens.usedAt),
      gt(authTokens.expiresAt, new Date()),
    ),
  });
  if (!row) return { ok: false, message: "This link has expired. Ask the owner for a new one." };
  const user = await db().query.users.findFirst({ where: eq(users.id, row.subjectId) });
  if (!user || user.disabledAt) return { ok: false, message: "This link has expired." };
  const problem = await checkPasswordPolicy(password, [user.email, user.name]);
  if (problem) return { ok: false, message: problem };
  await db().transaction(async (tx) => {
    await tx.update(authTokens).set({ usedAt: new Date() }).where(eq(authTokens.id, row.id));
    await tx
      .update(users)
      .set({
        passwordHash: await hashPassword(password),
        failedLogins: 0,
        lockedUntil: null,
        ...(row.purpose === "invite" ? {} : {}),
      })
      .where(eq(users.id, user.id));
  });
  await audit({ userId: user.id, label: user.email }, row.purpose === "invite" ? "staff.invite_accepted" : "staff.password_reset", "user", user.id);
  await createStaffSession(user.id, false);
  redirect(user.mfaEnabled ? "/admin/mfa" : "/admin/mfa/setup");
}
