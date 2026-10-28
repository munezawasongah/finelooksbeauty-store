"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { assertStaff } from "@/server/auth/session";
import { can, type Role } from "@/server/auth/permissions";
import { db } from "@/server/db";
import {
  inventoryBalances,
  productImages,
  products,
  productVariants,
  slugRedirects,
  stockMovements,
} from "@/server/db/schema";
import { audit } from "@/server/audit";
import { slugify } from "@/lib/format";
import { defaultLocationId } from "@/server/inventory";
import { getSetting } from "@/server/settings";
import { deleteStoredImage, storeImage, UploadError } from "@/server/storage";

export type ProductFormState = { ok: boolean; message: string; fields?: Record<string, string> } | null;

const productSchema = z.object({
  title: z.string().trim().min(2, "Enter a product name.").max(160),
  slug: z.string().trim().max(90).optional(),
  description: z.string().max(8000).default(""),
  brand: z.string().trim().max(80).optional(),
  categoryId: z.string().uuid().or(z.literal("")).optional(),
  status: z.enum(["draft", "active", "archived"]),
  badge: z.enum(["", "bestseller", "new", "sale", "limited"]).optional(),
  featured: z.literal("on").optional(),
  optionNames: z.string().max(200).optional(),
  seoTitle: z.string().max(70, "Keep SEO titles to 70 characters.").optional(),
  seoDescription: z.string().max(170, "Keep SEO descriptions to 170 characters.").optional(),
  canonicalOverride: z.string().max(300).optional(),
  noindex: z.literal("on").optional(),
});

async function uniqueSlug(base: string, excludeId?: string) {
  let slug = slugify(base) || "product";
  for (let i = 2; i < 200; i++) {
    const clash = await db().query.products.findFirst({
      where: and(eq(products.slug, slug), excludeId ? ne(products.id, excludeId) : undefined),
    });
    if (!clash) return slug;
    slug = `${slugify(base)}-${i}`;
  }
  throw new Error("Could not create a unique URL");
}

function fieldErrors(err: z.ZodError) {
  const fields: Record<string, string> = {};
  for (const i of err.issues) fields[String(i.path[0])] = i.message;
  return fields;
}

export async function createProduct(_: ProductFormState, form: FormData): Promise<ProductFormState> {
  const ctx = await assertStaff("products.edit");
  const parsed = productSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: "Check the highlighted fields.", fields: fieldErrors(parsed.error) };
  const d = parsed.data;
  const slug = await uniqueSlug(d.slug || d.title);
  const price = Math.round(Number(String(form.get("price") ?? "0").replace(/[$,]/g, "")) * 100);
  const sku = String(form.get("sku") ?? "").trim().toUpperCase();
  if (!sku) return { ok: false, message: "Enter a SKU for the first variant.", fields: { sku: "Required" } };
  if (!Number.isFinite(price) || price <= 0) return { ok: false, message: "Enter a price.", fields: { price: "Required" } };
  const clash = await db().query.productVariants.findFirst({ where: sql`upper(${productVariants.sku}) = ${sku}` });
  if (clash) return { ok: false, message: `SKU ${sku} is already used.`, fields: { sku: "Already used" } };

  const commerce = await getSetting("commerce");
  const loc = await defaultLocationId();
  const id = await db().transaction(async (tx) => {
    const [p] = await tx
      .insert(products)
      .values({
        title: d.title,
        slug,
        description: d.description,
        brand: d.brand || null,
        categoryId: d.categoryId || null,
        status: d.status,
        badge: (d.badge || null) as typeof products.$inferInsert.badge,
        featured: d.featured === "on",
        optionNames: (d.optionNames ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 3),
        seoTitle: d.seoTitle || null,
        seoDescription: d.seoDescription || null,
        canonicalOverride: d.canonicalOverride || null,
        noindex: d.noindex === "on",
      })
      .returning();
    const [v] = await tx
      .insert(productVariants)
      .values({ productId: p.id, sku, priceCents: price, barcode: String(form.get("barcode") ?? "").trim() || null })
      .returning();
    await tx.insert(inventoryBalances).values({ variantId: v.id, locationId: loc, safetyStock: commerce.defaultSafetyStock });
    await audit(ctx.actor, "product.create", "product", p.id, { title: p.title, sku }, tx);
    return p.id;
  });
  redirect(`/admin/products/${id}?created=1`);
}

export async function updateProduct(_: ProductFormState, form: FormData): Promise<ProductFormState> {
  const ctx = await assertStaff("products.edit");
  const id = String(form.get("id") ?? "");
  const parsed = productSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: "Check the highlighted fields.", fields: fieldErrors(parsed.error) };
  const d = parsed.data;
  const current = await db().query.products.findFirst({ where: eq(products.id, id) });
  if (!current) return { ok: false, message: "Product not found." };
  const slug = d.slug && slugify(d.slug) !== current.slug ? await uniqueSlug(d.slug, id) : current.slug;

  await db().transaction(async (tx) => {
    if (slug !== current.slug) {
      await tx
        .insert(slugRedirects)
        .values({ entity: "product", fromSlug: current.slug, entityId: id })
        .onConflictDoUpdate({ target: [slugRedirects.entity, slugRedirects.fromSlug], set: { entityId: id } });
      await tx.delete(slugRedirects).where(and(eq(slugRedirects.entity, "product"), eq(slugRedirects.fromSlug, slug)));
    }
    await tx
      .update(products)
      .set({
        title: d.title,
        slug,
        description: d.description,
        brand: d.brand || null,
        categoryId: d.categoryId || null,
        status: d.status,
        badge: (d.badge || null) as typeof products.$inferInsert.badge,
        featured: d.featured === "on",
        optionNames: (d.optionNames ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 3),
        seoTitle: d.seoTitle || null,
        seoDescription: d.seoDescription || null,
        canonicalOverride: d.canonicalOverride || null,
        noindex: d.noindex === "on",
        updatedAt: new Date(),
      })
      .where(eq(products.id, id));
    await audit(
      ctx.actor,
      "product.update",
      "product",
      id,
      {
        before: { title: current.title, slug: current.slug, status: current.status, categoryId: current.categoryId },
        after: { title: d.title, slug, status: d.status, categoryId: d.categoryId || null },
      },
      tx,
    );
  });
  refresh();
  return { ok: true, message: slug !== current.slug ? `Saved. Old URL now redirects to /${slug}.` : "Saved." };
}

/** Saves the whole variants table. Price changes need the separate prices.edit permission. */
export async function saveVariants(_: ProductFormState, form: FormData): Promise<ProductFormState> {
  const ctx = await assertStaff("products.edit");
  const canPrice = can(ctx.user.role as Role, "prices.edit");
  const productId = String(form.get("productId") ?? "");
  const product = await db().query.products.findFirst({ where: eq(products.id, productId) });
  if (!product) return { ok: false, message: "Product not found." };

  type Row = {
    id: string;
    sku: string;
    barcode: string;
    options: Record<string, string>;
    price: number;
    compareAt: number | null;
    threshold: number;
    taxCode: string;
    active: boolean;
    remove: boolean;
  };
  const rows = new Map<string, Row>();
  for (const [key, value] of form.entries()) {
    const m = /^v\[(\w+)\]\[(\w+)\](?:\[(.+)\])?$/.exec(key);
    if (!m) continue;
    const [, idx, field, opt] = m;
    const r = rows.get(idx) ?? { id: "", sku: "", barcode: "", options: {}, price: 0, compareAt: null, threshold: 3, taxCode: "", active: false, remove: false };
    const v = String(value).trim();
    if (field === "id") r.id = v;
    if (field === "sku") r.sku = v.toUpperCase();
    if (field === "barcode") r.barcode = v;
    if (field === "opt" && opt) r.options[opt] = v;
    if (field === "price") r.price = Math.round(Number(v.replace(/[$,]/g, "")) * 100);
    if (field === "compareAt") r.compareAt = v ? Math.round(Number(v.replace(/[$,]/g, "")) * 100) : null;
    if (field === "threshold") r.threshold = Math.max(0, Math.floor(Number(v) || 0));
    if (field === "taxCode") r.taxCode = v;
    if (field === "active") r.active = v === "on";
    if (field === "remove") r.remove = v === "on";
    rows.set(idx, r);
  }
  const list = [...rows.values()].filter((r) => r.sku || r.id);
  if (!list.filter((r) => !r.remove).length) return { ok: false, message: "A product needs at least one variant." };
  for (const r of list) {
    if (r.remove) continue;
    if (!/^[A-Z0-9][A-Z0-9._-]{1,59}$/.test(r.sku)) return { ok: false, message: `SKU "${r.sku}" can use letters, numbers, dot, dash or underscore.` };
    if (!Number.isFinite(r.price) || r.price <= 0) return { ok: false, message: `Enter a price for ${r.sku}.` };
    if (r.compareAt != null && (!Number.isFinite(r.compareAt) || r.compareAt <= r.price)) {
      return { ok: false, message: `"Compare at" for ${r.sku} must be higher than the price, or empty.` };
    }
  }
  const skus = list.filter((r) => !r.remove).map((r) => r.sku);
  if (new Set(skus).size !== skus.length) return { ok: false, message: "Each variant needs its own SKU." };
  const combos = list.filter((r) => !r.remove).map((r) => JSON.stringify(product.optionNames.map((n) => r.options[n] ?? "")));
  if (product.optionNames.length && new Set(combos).size !== combos.length) {
    return { ok: false, message: "Two variants have the same option values." };
  }

  const existing = await db().select().from(productVariants).where(eq(productVariants.productId, productId));
  const loc = await defaultLocationId();
  const commerce = await getSetting("commerce");
  const notes: string[] = [];

  try {
    await db().transaction(async (tx) => {
      for (const r of list) {
        const before = existing.find((e) => e.id === r.id);
        const options = Object.fromEntries(product.optionNames.map((n) => [n, r.options[n] ?? ""]).filter(([, v]) => v));
        if (r.remove && before) {
          const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(stockMovements).where(eq(stockMovements.variantId, before.id));
          if (n > 0) {
            await tx.update(productVariants).set({ active: false, updatedAt: new Date() }).where(eq(productVariants.id, before.id));
            notes.push(`${before.sku} has stock history, so it was deactivated instead of deleted.`);
          } else {
            await tx.delete(productVariants).where(eq(productVariants.id, before.id));
          }
          await audit(ctx.actor, "variant.remove", "variant", before.id, { sku: before.sku }, tx);
          continue;
        }
        if (before) {
          const priceChanged = before.priceCents !== r.price || (before.compareAtCents ?? null) !== r.compareAt;
          if (priceChanged && !canPrice) throw new Error("You don't have permission to change prices.");
          await tx
            .update(productVariants)
            .set({
              sku: r.sku,
              barcode: r.barcode || null,
              options,
              priceCents: r.price,
              compareAtCents: r.compareAt,
              lowStockThreshold: r.threshold,
              taxCode: r.taxCode || null,
              active: r.active,
              updatedAt: new Date(),
            })
            .where(eq(productVariants.id, before.id));
          if (priceChanged) {
            await audit(ctx.actor, "price.change", "variant", before.id, { sku: r.sku, before: before.priceCents, after: r.price, compareAt: r.compareAt }, tx);
          }
        } else {
          if (!canPrice) throw new Error("You don't have permission to set prices for new variants.");
          const [v] = await tx
            .insert(productVariants)
            .values({
              productId,
              sku: r.sku,
              barcode: r.barcode || null,
              options,
              priceCents: r.price,
              compareAtCents: r.compareAt,
              lowStockThreshold: r.threshold,
              taxCode: r.taxCode || null,
              active: true,
              sortOrder: existing.length + rows.size,
            })
            .returning();
          await tx.insert(inventoryBalances).values({ variantId: v.id, locationId: loc, safetyStock: commerce.defaultSafetyStock }).onConflictDoNothing();
          await audit(ctx.actor, "variant.create", "variant", v.id, { sku: v.sku, price: v.priceCents }, tx);
        }
      }
      await tx.update(products).set({ updatedAt: new Date() }).where(eq(products.id, productId));
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not save variants.";
    if (/variants_sku_uq/.test(msg)) return { ok: false, message: "One of those SKUs is already used by another product." };
    if (/variants_barcode_uq/.test(msg)) return { ok: false, message: "One of those barcodes is already used by another product." };
    return { ok: false, message: msg };
  }
  refresh();
  return { ok: true, message: ["Variants saved.", ...notes].join(" ") };
}

export async function uploadImages(_: ProductFormState, form: FormData): Promise<ProductFormState> {
  const ctx = await assertStaff("products.edit");
  const productId = String(form.get("productId") ?? "");
  const product = await db().query.products.findFirst({ where: eq(products.id, productId) });
  if (!product) return { ok: false, message: "Product not found." };
  const files = form.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);
  const alt = String(form.get("alt") ?? "").trim();
  if (!files.length) return { ok: false, message: "Choose at least one image." };
  if (!alt) return { ok: false, message: "Describe the image (alt text) for accessibility and search." };
  if (files.length > 10) return { ok: false, message: "Upload up to 10 images at a time." };
  if (files.reduce((s, f) => s + f.size, 0) > 24 * 1024 * 1024) {
    return { ok: false, message: "Those images add up to more than 24 MB. Upload fewer at a time." };
  }
  const [{ max }] = await db()
    .select({ max: sql<number>`coalesce(max(${productImages.sortOrder}), -1)::int` })
    .from(productImages)
    .where(eq(productImages.productId, productId));
  let order = max + 1;
  try {
    for (const f of files) {
      const stored = await storeImage(f);
      await db().insert(productImages).values({
        productId,
        url: stored.url,
        alt: files.length > 1 ? `${alt} (${order - max})` : alt,
        width: stored.width,
        height: stored.height,
        sortOrder: order++,
      });
    }
  } catch (err) {
    return { ok: false, message: err instanceof UploadError ? err.message : "Upload failed. Try a smaller JPG or PNG." };
  }
  await audit(ctx.actor, "product.images_upload", "product", productId, { count: files.length });
  refresh();
  return { ok: true, message: `${files.length} image${files.length > 1 ? "s" : ""} uploaded.` };
}

export async function updateImage(form: FormData) {
  const ctx = await assertStaff("products.edit");
  const id = String(form.get("imageId") ?? "");
  const intent = String(form.get("intent") ?? "save");
  const img = await db().query.productImages.findFirst({ where: eq(productImages.id, id) });
  if (!img) return;
  if (intent === "delete") {
    await db().delete(productImages).where(eq(productImages.id, id));
    await deleteStoredImage(img.url);
    await audit(ctx.actor, "product.image_delete", "product", img.productId, { url: img.url });
  } else if (intent === "first") {
    await db().update(productImages).set({ sortOrder: sql`${productImages.sortOrder} + 1` }).where(eq(productImages.productId, img.productId));
    await db().update(productImages).set({ sortOrder: 0 }).where(eq(productImages.id, id));
  } else {
    const alt = String(form.get("alt") ?? "").trim().slice(0, 200);
    if (alt) await db().update(productImages).set({ alt }).where(eq(productImages.id, id));
  }
  refresh();
}

export async function bulkProductStatus(form: FormData) {
  const ctx = await assertStaff("products.edit");
  const ids = form.getAll("ids").map(String).filter((s) => /^[0-9a-f-]{36}$/.test(s));
  const status = z.enum(["draft", "active", "archived"]).safeParse(form.get("status"));
  if (!ids.length || !status.success) return;
  await db().update(products).set({ status: status.data, updatedAt: new Date() }).where(inArray(products.id, ids));
  await audit(ctx.actor, "product.bulk_status", "product", null, { ids, status: status.data });
  refresh();
}
