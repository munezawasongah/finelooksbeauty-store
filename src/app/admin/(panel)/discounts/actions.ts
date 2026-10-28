"use server";

import { refresh } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { assertStaff } from "@/server/auth/session";
import { db } from "@/server/db";
import { discounts } from "@/server/db/schema";
import { audit } from "@/server/audit";
import { easternToUtc } from "@/lib/format";

export type DiscState = { ok: boolean; message: string } | null;

/** Dates from the form are Eastern Time calendar days. */
function etDate(v: string | undefined, endOfDay = false) {
  if (!v) return null;
  return easternToUtc(v, endOfDay ? "23:59:59" : "00:00:00");
}

export async function saveDiscount(_: DiscState, form: FormData): Promise<DiscState> {
  const ctx = await assertStaff("discounts.manage");
  const parsed = z
    .object({
      id: z.string().uuid().optional().or(z.literal("")),
      code: z.string().trim().min(3).max(30).regex(/^[A-Za-z0-9_-]+$/, "Letters, numbers, dash and underscore only."),
      description: z.string().max(120).optional(),
      type: z.enum(["percent", "fixed"]),
      value: z.coerce.number().positive(),
      minSubtotal: z.coerce.number().min(0).default(0),
      startsAt: z.string().optional(),
      endsAt: z.string().optional(),
      usageLimit: z.string().optional(),
      active: z.literal("on").optional(),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the form." };
  const d = parsed.data;
  if (d.type === "percent" && d.value > 90) return { ok: false, message: "Percent discounts are capped at 90%." };
  const values = {
    code: d.code.toUpperCase(),
    description: d.description || null,
    type: d.type,
    value: d.type === "percent" ? Math.round(d.value) : Math.round(d.value * 100),
    minSubtotalCents: Math.round(d.minSubtotal * 100),
    startsAt: etDate(d.startsAt),
    endsAt: etDate(d.endsAt, true),
    usageLimit: d.usageLimit ? Math.max(1, Math.floor(Number(d.usageLimit))) : null,
    active: d.active === "on",
  };
  try {
    if (d.id) {
      await db().update(discounts).set(values).where(eq(discounts.id, d.id));
      await audit(ctx.actor, "discount.update", "discount", d.id, values);
    } else {
      const [row] = await db().insert(discounts).values(values).returning();
      await audit(ctx.actor, "discount.create", "discount", row.id, values);
    }
  } catch (err) {
    if (err instanceof Error && /discounts_code_uq/.test(err.message)) return { ok: false, message: "That code already exists." };
    throw err;
  }
  refresh();
  return { ok: true, message: "Saved." };
}

export async function toggleDiscount(form: FormData) {
  const ctx = await assertStaff("discounts.manage");
  const id = String(form.get("id") ?? "");
  await db().update(discounts).set({ active: sql`not ${discounts.active}` }).where(eq(discounts.id, id));
  await audit(ctx.actor, "discount.toggle", "discount", id);
  refresh();
}
