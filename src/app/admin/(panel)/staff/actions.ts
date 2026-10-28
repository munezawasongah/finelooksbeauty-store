"use server";

import { refresh } from "next/cache";
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { assertStaff, revokeAllStaffSessions } from "@/server/auth/session";
import { db } from "@/server/db";
import { authTokens, users } from "@/server/db/schema";
import { audit } from "@/server/audit";
import { hashPassword } from "@/server/auth/password";
import { randomToken, sha256 } from "@/server/crypto";
import { enqueue } from "@/server/queue";
import { env, isSmtpConfigured } from "@/server/env";

export type StaffState = { ok: boolean; message: string; link?: string } | null;

async function ownerCount() {
  const [{ n }] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .where(and(eq(users.role, "owner"), isNull(users.disabledAt)));
  return n;
}

async function issueLink(userId: string, email: string, purpose: "invite" | "password_reset") {
  const token = randomToken();
  await db().insert(authTokens).values({
    id: sha256(token),
    subjectType: "staff",
    subjectId: userId,
    purpose,
    expiresAt: new Date(Date.now() + (purpose === "invite" ? 72 : 1) * 3600_000),
  });
  const link = `${env().APP_URL.replace(/\/$/, "")}/admin/invite?token=${token}`;
  await enqueue("email:send", { template: purpose === "invite" ? "staff_invite" : "password_reset", to: email, data: { link } });
  return link;
}

export async function inviteStaff(_: StaffState, form: FormData): Promise<StaffState> {
  const ctx = await assertStaff("staff.manage");
  const parsed = z
    .object({ name: z.string().trim().min(2).max(80), email: z.string().trim().toLowerCase().email(), role: z.enum(["owner", "manager", "staff", "support"]) })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: "Enter a name, email and role." };
  const exists = await db().query.users.findFirst({ where: sql`lower(${users.email}) = ${parsed.data.email}` });
  if (exists) return { ok: false, message: "That email already has an account." };
  const [u] = await db()
    .insert(users)
    .values({ ...parsed.data, passwordHash: await hashPassword(randomToken(32)) })
    .returning();
  const link = await issueLink(u.id, u.email, "invite");
  await audit(ctx.actor, "staff.invite", "user", u.id, { email: u.email, role: u.role });
  refresh();
  return {
    ok: true,
    message: isSmtpConfigured() ? `Invitation emailed to ${u.email}.` : "Email isn't configured, so copy this one-time link to the new staff member:",
    link: isSmtpConfigured() ? undefined : link,
  };
}

export async function updateStaff(_: StaffState, form: FormData): Promise<StaffState> {
  const ctx = await assertStaff("staff.manage");
  const id = String(form.get("id") ?? "");
  const intent = String(form.get("intent") ?? "");
  const target = await db().query.users.findFirst({ where: eq(users.id, id) });
  if (!target) return { ok: false, message: "Not found." };

  if (intent === "role") {
    const role = z.enum(["owner", "manager", "staff", "support"]).safeParse(form.get("role"));
    if (!role.success) return { ok: false, message: "Choose a role." };
    if (target.role === "owner" && role.data !== "owner" && (await ownerCount()) <= 1) {
      return { ok: false, message: "There must always be at least one owner." };
    }
    await db().update(users).set({ role: role.data, updatedAt: new Date() }).where(eq(users.id, id));
    await revokeAllStaffSessions(id);
    await audit(ctx.actor, "staff.role", "user", id, { from: target.role, to: role.data });
  } else if (intent === "disable") {
    if (id === ctx.user.id) return { ok: false, message: "You can't disable yourself." };
    if (target.role === "owner" && (await ownerCount()) <= 1) return { ok: false, message: "There must always be at least one owner." };
    await db().update(users).set({ disabledAt: new Date() }).where(eq(users.id, id));
    await revokeAllStaffSessions(id);
    await audit(ctx.actor, "staff.disable", "user", id);
  } else if (intent === "enable") {
    await db().update(users).set({ disabledAt: null, failedLogins: 0, lockedUntil: null }).where(eq(users.id, id));
    await audit(ctx.actor, "staff.enable", "user", id);
  } else if (intent === "reset_mfa") {
    if (id === ctx.user.id) return { ok: false, message: "Use your own account page to change your authenticator." };
    await db()
      .update(users)
      .set({ mfaEnabled: false, mfaSecretEnc: null, mfaLastStep: null, mfaRecoveryHashes: [] })
      .where(eq(users.id, id));
    await revokeAllStaffSessions(id);
    await audit(ctx.actor, "staff.reset_mfa", "user", id);
  } else if (intent === "reset_password") {
    const link = await issueLink(id, target.email, "password_reset");
    await revokeAllStaffSessions(id);
    await audit(ctx.actor, "staff.reset_password", "user", id);
    refresh();
    return {
      ok: true,
      message: isSmtpConfigured() ? "Reset link emailed (valid 60 minutes)." : "Copy this one-time reset link (valid 60 minutes):",
      link: isSmtpConfigured() ? undefined : link,
    };
  } else if (intent === "signout") {
    await revokeAllStaffSessions(id);
    await audit(ctx.actor, "staff.signout_all", "user", id);
  }
  refresh();
  return { ok: true, message: "Done." };
}

void ne;
