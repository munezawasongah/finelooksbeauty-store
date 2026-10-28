import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { customers, sessions, users } from "../db/schema";
import { randomToken, sha256 } from "../crypto";
import { can, type Permission, type Role } from "./permissions";
import type { Actor } from "../audit";

const isProd = process.env.NODE_ENV === "production";

export const STAFF_COOKIE = isProd ? "__Host-fl_staff" : "fl_staff";
export const CUSTOMER_COOKIE = isProd ? "__Host-fl_cust" : "fl_cust";
export const DEVICE_COOKIE = isProd ? "__Host-fl_dev" : "fl_dev";

const STAFF_ABSOLUTE_MS = 12 * 60 * 60 * 1000;
const STAFF_IDLE_MS = 2 * 60 * 60 * 1000;
const CUSTOMER_ABSOLUTE_MS = 30 * 24 * 60 * 60 * 1000;
const TOUCH_EVERY_MS = 5 * 60 * 1000;

export async function requestMeta() {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "unknown";
  return { ip, userAgent: (h.get("user-agent") ?? "").slice(0, 300) };
}

async function setCookie(name: string, value: string, maxAgeMs: number) {
  (await cookies()).set(name, value, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(maxAgeMs / 1000),
  });
}

/* ------------------------------------------------------------------ */
/* Staff                                                               */
/* ------------------------------------------------------------------ */

export type StaffContext = {
  user: typeof users.$inferSelect;
  session: typeof sessions.$inferSelect;
  actor: Actor;
};

export async function createStaffSession(userId: string, mfaVerified: boolean) {
  const { ip, userAgent } = await requestMeta();
  const token = randomToken();
  await db().insert(sessions).values({
    id: sha256(token),
    kind: "staff",
    userId,
    mfaVerified,
    ip,
    userAgent,
    expiresAt: new Date(Date.now() + STAFF_ABSOLUTE_MS),
  });
  await setCookie(STAFF_COOKIE, token, STAFF_ABSOLUTE_MS);
}

/** Replace the session id after a privilege change (MFA passed) to defeat fixation. */
export async function rotateStaffSession(ctx: StaffContext, patch: { mfaVerified: boolean }) {
  await db().delete(sessions).where(eq(sessions.id, ctx.session.id));
  await createStaffSession(ctx.user.id, patch.mfaVerified);
}

export async function getStaffSession(): Promise<StaffContext | null> {
  const token = (await cookies()).get(STAFF_COOKIE)?.value;
  if (!token) return null;
  const id = sha256(token);
  const rows = await db()
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, id), eq(sessions.kind, "staff")))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const now = Date.now();
  if (
    row.session.expiresAt.getTime() < now ||
    now - row.session.lastSeenAt.getTime() > STAFF_IDLE_MS ||
    row.user.disabledAt
  ) {
    await db().delete(sessions).where(eq(sessions.id, id));
    return null;
  }
  if (now - row.session.lastSeenAt.getTime() > TOUCH_EVERY_MS) {
    await db().update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, id));
  }
  const { ip } = await requestMeta();
  return { ...row, actor: { userId: row.user.id, label: row.user.email, ip } };
}

/**
 * Gate for every admin page and action. Unauthenticated → login;
 * MFA not enrolled → setup; MFA not passed this session → verify.
 */
export async function requireStaff(permission?: Permission): Promise<StaffContext> {
  const ctx = await getStaffSession();
  if (!ctx) redirect("/admin/login");
  if (!ctx.user.mfaEnabled) redirect("/admin/mfa/setup");
  if (!ctx.session.mfaVerified) redirect("/admin/mfa");
  if (permission && !can(ctx.user.role as Role, permission)) redirect("/admin?denied=" + permission);
  return ctx;
}

/** For server actions: same checks, but throws instead of redirecting on missing permission. */
export async function assertStaff(permission: Permission): Promise<StaffContext> {
  const ctx = await requireStaff();
  if (!can(ctx.user.role as Role, permission)) throw new Error("You don't have permission to do that.");
  return ctx;
}

export async function destroyStaffSession() {
  const store = await cookies();
  const token = store.get(STAFF_COOKIE)?.value;
  if (token) await db().delete(sessions).where(eq(sessions.id, sha256(token)));
  store.delete(STAFF_COOKIE);
}

export async function revokeAllStaffSessions(userId: string) {
  await db().delete(sessions).where(eq(sessions.userId, userId));
}

/* ------------------------------------------------------------------ */
/* Customers                                                           */
/* ------------------------------------------------------------------ */

export async function createCustomerSession(customerId: string) {
  const { ip, userAgent } = await requestMeta();
  const token = randomToken();
  await db().insert(sessions).values({
    id: sha256(token),
    kind: "customer",
    customerId,
    mfaVerified: true,
    ip,
    userAgent,
    expiresAt: new Date(Date.now() + CUSTOMER_ABSOLUTE_MS),
  });
  await setCookie(CUSTOMER_COOKIE, token, CUSTOMER_ABSOLUTE_MS);
}

export async function getCustomer() {
  const token = (await cookies()).get(CUSTOMER_COOKIE)?.value;
  if (!token) return null;
  const rows = await db()
    .select({ session: sessions, customer: customers })
    .from(sessions)
    .innerJoin(customers, eq(customers.id, sessions.customerId))
    .where(and(eq(sessions.id, sha256(token)), eq(sessions.kind, "customer")))
    .limit(1);
  const row = rows[0];
  if (!row || row.session.expiresAt.getTime() < Date.now() || row.customer.deletedAt) return null;
  return row.customer;
}

export async function destroyCustomerSession() {
  const store = await cookies();
  const token = store.get(CUSTOMER_COOKIE)?.value;
  if (token) await db().delete(sessions).where(eq(sessions.id, sha256(token)));
  store.delete(CUSTOMER_COOKIE);
}

/** Long-lived random device id, used to detect admin sign-ins from new devices. */
export async function deviceId(): Promise<string> {
  const store = await cookies();
  let id = store.get(DEVICE_COOKIE)?.value;
  if (!id) {
    id = randomToken(16);
    store.set(DEVICE_COOKIE, id, {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      path: "/",
      maxAge: 400 * 24 * 60 * 60,
    });
  }
  return id;
}
