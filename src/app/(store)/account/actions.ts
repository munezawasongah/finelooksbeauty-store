"use server";

import { redirect } from "next/navigation";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { authTokens, carts, customers, sessions } from "@/server/db/schema";
import {
  createCustomerSession,
  destroyCustomerSession,
  getCustomer,
  requestMeta,
} from "@/server/auth/session";
import { burnPasswordCheck, checkPasswordPolicy, hashPassword, verifyPassword } from "@/server/auth/password";
import { rateLimit } from "@/server/redis";
import { randomToken, sha256 } from "@/server/crypto";
import { enqueue } from "@/server/queue";
import { env } from "@/server/env";
import { CART_COOKIE } from "@/server/cart";
import { cookies } from "next/headers";

export type FormState = { ok: boolean; message: string; fields?: Record<string, string> } | null;

const LOCK_AFTER = 8;
const LOCK_MINUTES = 15;

async function attachCart(customerId: string) {
  const id = (await cookies()).get(CART_COOKIE)?.value;
  if (id) await db().update(carts).set({ customerId }).where(eq(carts.id, id));
}

export async function signIn(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "/account");
  const { ip } = await requestMeta();
  if (!(await rateLimit(`cust-login:ip:${ip}`, 20, 900)) || !(await rateLimit(`cust-login:${email}`, 10, 900))) {
    return { ok: false, message: "Too many attempts. Try again in 15 minutes." };
  }
  const c = await db().query.customers.findFirst({ where: sql`lower(${customers.email}) = ${email}` });
  if (!c || !c.passwordHash || c.deletedAt) {
    await burnPasswordCheck(password);
    return { ok: false, message: "Email or password is incorrect." };
  }
  if (c.lockedUntil && c.lockedUntil.getTime() > Date.now()) {
    return { ok: false, message: "This account is temporarily locked. Try again later or reset your password." };
  }
  if (!(await verifyPassword(password, c.passwordHash))) {
    const failed = c.failedLogins + 1;
    await db()
      .update(customers)
      .set({ failedLogins: failed, lockedUntil: failed >= LOCK_AFTER ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null })
      .where(eq(customers.id, c.id));
    return { ok: false, message: "Email or password is incorrect." };
  }
  await db().update(customers).set({ failedLogins: 0, lockedUntil: null }).where(eq(customers.id, c.id));
  await createCustomerSession(c.id);
  await attachCart(c.id);
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/account");
}

const registerSchema = z.object({
  firstName: z.string().trim().min(1, "Enter your first name.").max(60),
  lastName: z.string().trim().min(1, "Enter your last name.").max(60),
  email: z.string().trim().toLowerCase().email("Enter a valid email.").max(254),
  password: z.string().min(1, "Choose a password."),
  marketing: z.literal("on").optional(),
});

export async function register(_: FormState, form: FormData): Promise<FormState> {
  const parsed = registerSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const i of parsed.error.issues) fields[String(i.path[0])] = i.message;
    return { ok: false, message: "Check the highlighted fields.", fields };
  }
  const { ip } = await requestMeta();
  if (!(await rateLimit(`register:${ip}`, 5, 3600))) return { ok: false, message: "Too many sign-ups. Try again later." };
  const problem = await checkPasswordPolicy(parsed.data.password, [parsed.data.email, parsed.data.firstName]);
  if (problem) return { ok: false, message: problem, fields: { password: problem } };

  const existing = await db().query.customers.findFirst({ where: sql`lower(${customers.email}) = ${parsed.data.email}` });
  if (existing?.passwordHash) {
    return { ok: false, message: "An account with this email already exists. Sign in or reset your password." };
  }
  const hash = await hashPassword(parsed.data.password);
  let id: string;
  if (existing) {
    await db()
      .update(customers)
      .set({ passwordHash: hash, firstName: parsed.data.firstName, lastName: parsed.data.lastName, marketingOptIn: parsed.data.marketing === "on" })
      .where(eq(customers.id, existing.id));
    id = existing.id;
  } else {
    const [c] = await db()
      .insert(customers)
      .values({
        email: parsed.data.email,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        passwordHash: hash,
        marketingOptIn: parsed.data.marketing === "on",
      })
      .returning({ id: customers.id });
    id = c.id;
  }
  await createCustomerSession(id);
  await attachCart(id);
  redirect("/account");
}

export async function signOut() {
  await destroyCustomerSession();
  redirect("/");
}

export async function requestPasswordReset(_: FormState, form: FormData): Promise<FormState> {
  const email = z.string().trim().toLowerCase().email().safeParse(form.get("email"));
  const generic: FormState = { ok: true, message: "If an account exists for that email, we've sent a reset link." };
  if (!email.success) return { ok: false, message: "Enter a valid email." };
  const { ip } = await requestMeta();
  if (!(await rateLimit(`reset:${ip}`, 5, 3600)) || !(await rateLimit(`reset:${email.data}`, 3, 3600))) return generic;
  const c = await db().query.customers.findFirst({ where: sql`lower(${customers.email}) = ${email.data}` });
  if (c && !c.deletedAt) {
    const token = randomToken();
    await db().insert(authTokens).values({
      id: sha256(token),
      subjectType: "customer",
      subjectId: c.id,
      purpose: "password_reset",
      expiresAt: new Date(Date.now() + 60 * 60_000),
    });
    await enqueue("email:send", {
      template: "password_reset",
      to: c.email,
      data: { link: `${env().APP_URL.replace(/\/$/, "")}/account/reset?token=${token}` },
    });
  }
  return generic;
}

export async function resetPassword(_: FormState, form: FormData): Promise<FormState> {
  const token = String(form.get("token") ?? "");
  const password = String(form.get("password") ?? "");
  const row = await db().query.authTokens.findFirst({
    where: and(
      eq(authTokens.id, sha256(token)),
      eq(authTokens.purpose, "password_reset"),
      eq(authTokens.subjectType, "customer"),
      isNull(authTokens.usedAt),
      gt(authTokens.expiresAt, new Date()),
    ),
  });
  if (!row) return { ok: false, message: "This link has expired. Request a new one." };
  const c = await db().query.customers.findFirst({ where: eq(customers.id, row.subjectId) });
  if (!c) return { ok: false, message: "This link has expired. Request a new one." };
  const problem = await checkPasswordPolicy(password, [c.email, c.firstName ?? ""]);
  if (problem) return { ok: false, message: problem };
  await db().transaction(async (tx) => {
    await tx.update(authTokens).set({ usedAt: new Date() }).where(eq(authTokens.id, row.id));
    await tx
      .update(customers)
      .set({ passwordHash: await hashPassword(password), failedLogins: 0, lockedUntil: null })
      .where(eq(customers.id, c.id));
    await tx.delete(sessions).where(eq(sessions.customerId, c.id));
  });
  await createCustomerSession(c.id);
  redirect("/account");
}

export async function updateProfile(_: FormState, form: FormData): Promise<FormState> {
  const c = await getCustomer();
  if (!c) redirect("/account/login");
  const parsed = z
    .object({
      firstName: z.string().trim().min(1).max(60),
      lastName: z.string().trim().min(1).max(60),
      phone: z.string().trim().max(20).optional(),
      marketing: z.literal("on").optional(),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: "Check your details." };
  await db()
    .update(customers)
    .set({
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      phone: parsed.data.phone || null,
      marketingOptIn: parsed.data.marketing === "on",
      updatedAt: new Date(),
    })
    .where(eq(customers.id, c.id));
  return { ok: true, message: "Saved." };
}

/** Customer-initiated account deletion: personal data removed; order records kept for tax/recordkeeping. */
export async function deleteAccount() {
  const c = await getCustomer();
  if (!c) redirect("/account/login");
  await db()
    .update(customers)
    .set({
      email: `deleted+${c.id}@invalid.local`,
      firstName: null,
      lastName: null,
      phone: null,
      passwordHash: null,
      marketingOptIn: false,
      deletedAt: new Date(),
    })
    .where(eq(customers.id, c.id));
  await db().delete(sessions).where(eq(sessions.customerId, c.id));
  await destroyCustomerSession();
  redirect("/?account=deleted");
}
