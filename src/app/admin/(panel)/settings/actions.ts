"use server";

import { refresh } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { assertStaff } from "@/server/auth/session";
import { db } from "@/server/db";
import { shippingMethods } from "@/server/db/schema";
import { audit } from "@/server/audit";
import { getSetting, saveSetting, type CommerceSettings, type HomeContent, type PolicyPages, type StoreInfo } from "@/server/settings";
import { storeImage, UploadError } from "@/server/storage";
import { ZIP_RE } from "@/lib/format";

export type SetState = { ok: boolean; message: string } | null;
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const str = (f: FormData, k: string, max = 500) => String(f.get(k) ?? "").trim().slice(0, max);

export async function saveStore(_: SetState, f: FormData): Promise<SetState> {
  const ctx = await assertStaff("settings.manage");
  const zip = str(f, "zip", 10);
  if (zip && !ZIP_RE.test(zip)) return { ok: false, message: "ZIP code must be 5 digits (or ZIP+4)." };
  const phone = str(f, "phone", 20);
  if (phone.replace(/\D/g, "").replace(/^1/, "").length !== 10) return { ok: false, message: "Enter a 10-digit phone number." };
  const email = z.string().email().safeParse(str(f, "email", 254));
  if (!email.success) return { ok: false, message: "Enter a valid email." };
  const hours = DAYS.map((day) => {
    const closed = f.get(`closed_${day}`) === "on";
    const open = str(f, `open_${day}`, 5);
    const close = str(f, `close_${day}`, 5);
    return { day, open: closed || !open ? null : open, close: closed || !close ? null : close };
  });
  const allBlank = hours.every((h) => !h.open && !h.close) && !DAYS.some((d) => f.get(`closed_${d}`) === "on");
  const before = await getSetting("store");
  const value: StoreInfo = {
    ...before,
    name: str(f, "name", 80) || before.name,
    legalName: str(f, "legalName", 120) || before.legalName,
    tagline: str(f, "tagline", 80),
    phone,
    email: email.data,
    streetAddress: str(f, "streetAddress", 120),
    city: str(f, "city", 60) || "Garner",
    state: (str(f, "state", 2) || "NC").toUpperCase(),
    zip,
    directionsNote: str(f, "directionsNote", 120),
    hours: allBlank ? [] : hours,
    instagram: str(f, "instagram", 200),
    facebook: str(f, "facebook", 200),
    tiktok: str(f, "tiktok", 200),
    googleBusinessUrl: str(f, "googleBusinessUrl", 300),
    mapEmbedQuery: str(f, "mapEmbedQuery", 200) || before.mapEmbedQuery,
  };
  for (const u of [value.instagram, value.facebook, value.tiktok, value.googleBusinessUrl]) {
    if (u && !/^https:\/\//.test(u)) return { ok: false, message: "Social and Google links must start with https://" };
  }
  await saveSetting("store", value);
  await audit(ctx.actor, "settings.store", "settings", "store", { name: value.name, phone: value.phone, address: value.streetAddress });
  refresh();
  return { ok: true, message: "Store details saved." };
}

export async function saveCommerce(_: SetState, f: FormData): Promise<SetState> {
  const ctx = await assertStaff("settings.manage");
  const n = (k: string, min: number, max: number) => Math.min(max, Math.max(min, Math.floor(Number(f.get(k)) || 0)));
  const value: CommerceSettings = {
    reservationMinutes: n("reservationMinutes", 31, 120),
    defaultSafetyStock: n("defaultSafetyStock", 0, 50),
    staleSyncMinutes: n("staleSyncMinutes", 15, 1440),
    maxQtyPerLine: n("maxQtyPerLine", 1, 99),
    pickupEnabled: f.get("pickupEnabled") === "on",
    pickupInstructions: str(f, "pickupInstructions", 400),
    announcement: str(f, "announcement", 140),
    returnsWindowDays: n("returnsWindowDays", 0, 365),
  };
  await saveSetting("commerce", value);
  await audit(ctx.actor, "settings.commerce", "settings", "commerce", value);
  refresh();
  return { ok: true, message: "Checkout and stock settings saved." };
}

function blocks(text: string) {
  return text.replace(/\r\n/g, "\n").split(/\n\s*\n/).map((b) => b.split("\n").map((l) => l.trim()).filter(Boolean)).filter((b) => b.length);
}

export async function saveHome(_: SetState, f: FormData): Promise<SetState> {
  const ctx = await assertStaff("settings.manage");
  const before = await getSetting("home");
  let heroImageUrl = f.get("removeHeroImage") === "on" ? null : before.heroImageUrl;
  const file = f.get("heroImage");
  if (file instanceof File && file.size > 0) {
    try {
      heroImageUrl = (await storeImage(file, "site")).url;
    } catch (err) {
      return { ok: false, message: err instanceof UploadError ? err.message : "Upload failed." };
    }
  }
  const stats = blocks(str(f, "stats", 2000))
    .flat()
    .map((l) => l.split("|").map((s) => s.trim()))
    .filter((p) => p[0] && p[1])
    .slice(0, 4)
    .map(([value, label]) => ({ value, label }));
  const testimonials = blocks(str(f, "testimonials", 8000))
    .filter((b) => b.length >= 2)
    .slice(0, 20)
    .map((b) => ({ quote: b[0].replace(/^["“]|["”]$/g, ""), name: b[1], source: b[2] ?? "" }));
  const faqs = blocks(str(f, "faqs", 8000))
    .filter((b) => b.length >= 2)
    .slice(0, 15)
    .map((b) => ({ q: b[0], a: b.slice(1).join(" ") }));
  const value: HomeContent = {
    heroEyebrow: str(f, "heroEyebrow", 60),
    heroTitle: str(f, "heroTitle", 60),
    heroAccent: str(f, "heroAccent", 60),
    heroSubtitle: str(f, "heroSubtitle", 300),
    heroImageUrl,
    aboutTitle: str(f, "aboutTitle", 80),
    aboutBody: blocks(str(f, "aboutBody", 3000)).map((b) => b.join(" ")).slice(0, 4),
    stats,
    testimonials,
    faqs,
  };
  await saveSetting("home", value);
  await audit(ctx.actor, "settings.home", "settings", "home", { testimonials: testimonials.length, faqs: faqs.length });
  refresh();
  return { ok: true, message: "Home page saved." };
}

export async function savePolicies(_: SetState, f: FormData): Promise<SetState> {
  const ctx = await assertStaff("settings.manage");
  const value: PolicyPages = {
    privacy: str(f, "privacy", 30000),
    terms: str(f, "terms", 30000),
    shipping: str(f, "shipping", 30000),
    returns: str(f, "returns", 30000),
    accessibility: str(f, "accessibility", 10000),
    updatedOn: new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "long", day: "numeric", year: "numeric" }).format(new Date()),
  };
  await saveSetting("policies", value);
  await audit(ctx.actor, "settings.policies", "settings", "policies");
  refresh();
  return { ok: true, message: "Policies saved and dated today." };
}

export async function saveShipping(_: SetState, f: FormData): Promise<SetState> {
  const ctx = await assertStaff("settings.manage");
  const ids = f.getAll("id").map(String);
  const rows = ids.map((id, i) => ({
    id,
    name: String(f.getAll("name")[i] ?? "").trim().slice(0, 60),
    carrier: String(f.getAll("carrier")[i] ?? "Other"),
    amount: Number(String(f.getAll("amount")[i] ?? "").replace(/[$,]/g, "")),
    freeOver: String(f.getAll("freeOver")[i] ?? "").trim(),
    minDays: Math.max(0, Math.floor(Number(f.getAll("minDays")[i]) || 0)),
    maxDays: Math.max(0, Math.floor(Number(f.getAll("maxDays")[i]) || 0)),
    active: f.getAll("active").map(String).includes(id || `new${i}`),
    remove: f.getAll("remove").map(String).includes(id),
  }));
  for (const r of rows) {
    if (r.remove || (!r.id && !r.name)) continue;
    if (!r.name || !Number.isFinite(r.amount) || r.amount < 0) return { ok: false, message: "Each shipping option needs a name and a price." };
    if (r.maxDays < r.minDays) return { ok: false, message: `${r.name}: maximum days must be at least the minimum.` };
    if (!["USPS", "UPS", "FedEx", "Other"].includes(r.carrier)) return { ok: false, message: "Unknown carrier." };
  }
  await db().transaction(async (tx) => {
    for (const [i, r] of rows.entries()) {
      if (r.remove && r.id) {
        await tx.delete(shippingMethods).where(eq(shippingMethods.id, r.id));
        continue;
      }
      if (!r.name) continue;
      const values = {
        name: r.name,
        carrier: r.carrier as "USPS",
        amountCents: Math.round(r.amount * 100),
        freeOverCents: r.freeOver ? Math.round(Number(r.freeOver.replace(/[$,]/g, "")) * 100) : null,
        minDays: r.minDays,
        maxDays: r.maxDays,
        active: r.active,
        sortOrder: i,
      };
      if (r.id) await tx.update(shippingMethods).set(values).where(eq(shippingMethods.id, r.id));
      else await tx.insert(shippingMethods).values(values);
    }
    await audit(ctx.actor, "settings.shipping", "settings", "shipping", { count: rows.length }, tx);
  });
  refresh();
  return { ok: true, message: "Shipping options saved." };
}
