"use server";

import { refresh } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { assertStaff } from "@/server/auth/session";
import { db } from "@/server/db";
import { categories, inventoryBalances, products, productVariants } from "@/server/db/schema";
import { changeStock, defaultLocationId } from "@/server/inventory";
import { queueCloverPushes } from "@/server/orders/lifecycle";
import { audit } from "@/server/audit";
import { enqueue } from "@/server/queue";
import { parseCsv } from "@/lib/csv";
import { slugify } from "@/lib/format";
import { getSetting } from "@/server/settings";

export type InvState = { ok: boolean; message: string; details?: string[] } | null;

const REASONS = ["Stocktake count", "Received delivery", "Damaged / unsellable", "Lost or stolen", "Correction", "Returned to stock", "Other"] as const;

export async function adjustStock(_: InvState, form: FormData): Promise<InvState> {
  const ctx = await assertStaff("inventory.adjust");
  const parsed = z
    .object({
      variantId: z.string().uuid(),
      mode: z.enum(["set", "add", "remove"]),
      quantity: z.coerce.number().int().min(0).max(100000),
      reason: z.enum(REASONS),
      note: z.string().max(300).optional(),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: "Choose a quantity and a reason." };
  const d = parsed.data;
  if (d.reason === "Other" && !d.note?.trim()) return { ok: false, message: "Explain the reason in the note." };
  const loc = await defaultLocationId();
  const res = await db().transaction(async (tx) => {
    const r = await changeStock(tx, {
      variantId: d.variantId,
      locationId: loc,
      ...(d.mode === "set" ? { setTo: d.quantity } : { delta: d.mode === "add" ? d.quantity : -d.quantity }),
      type: d.reason === "Stocktake count" ? "reconciliation" : d.reason === "Returned to stock" ? "return_restock" : "adjustment",
      sourceType: "admin",
      sourceId: ctx.user.id,
      reason: d.note?.trim() ? `${d.reason}: ${d.note.trim()}` : d.reason,
      actor: ctx.actor,
    });
    if (r.movementId) await queueCloverPushes(tx, [{ variantId: d.variantId, delta: r.delta, movementId: r.movementId }]);
    return r;
  });
  await enqueue("clover:push", {});
  refresh();
  return { ok: true, message: res.delta === 0 ? "No change — that's already the count." : `Stock is now ${res.onHand} (${res.delta > 0 ? "+" : ""}${res.delta}).` };
}

export async function updateBalanceSettings(_: InvState, form: FormData): Promise<InvState> {
  const ctx = await assertStaff("inventory.adjust");
  const variantId = String(form.get("variantId") ?? "");
  const safety = Math.max(0, Math.floor(Number(form.get("safetyStock") ?? 0)));
  const paused = form.get("paused") === "on";
  const loc = await defaultLocationId();
  const before = await db().query.inventoryBalances.findFirst({
    where: and(eq(inventoryBalances.variantId, variantId), eq(inventoryBalances.locationId, loc)),
  });
  if (!before) return { ok: false, message: "Not found." };
  await db()
    .update(inventoryBalances)
    .set({
      safetyStock: safety,
      checkoutPaused: paused,
      pauseReason: paused ? (before.checkoutPaused ? before.pauseReason ?? "manual" : "manual") : null,
      updatedAt: new Date(),
    })
    .where(and(eq(inventoryBalances.variantId, variantId), eq(inventoryBalances.locationId, loc)));
  await audit(ctx.actor, "inventory.settings", "variant", variantId, {
    safetyStock: [before.safetyStock, safety],
    paused: [before.checkoutPaused, paused],
  });
  refresh();
  return { ok: true, message: "Saved." };
}

/** Stocktake CSV: sku, on_hand[, safety_stock][, low_stock_threshold]. Sets counts (one movement per change). */
export async function importStockCsv(_: InvState, form: FormData): Promise<InvState> {
  const ctx = await assertStaff("inventory.import");
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return { ok: false, message: "Choose a CSV file." };
  if (file.size > 5 * 1024 * 1024) return { ok: false, message: "CSV must be under 5 MB." };
  const rows = parseCsv(await file.text());
  if (!rows.length || !("sku" in rows[0]) || !("on_hand" in rows[0])) {
    return { ok: false, message: "The first row must include the columns sku and on_hand." };
  }
  const loc = await defaultLocationId();
  const errors: string[] = [];
  let changed = 0;
  const batch = `csv:${Date.now()}`;
  for (const [i, r] of rows.entries()) {
    const line = i + 2;
    const qty = Number(r.on_hand);
    if (!Number.isInteger(qty) || qty < 0) {
      errors.push(`Row ${line}: on_hand "${r.on_hand}" is not a whole number.`);
      continue;
    }
    const v = await db().query.productVariants.findFirst({ where: sql`upper(${productVariants.sku}) = upper(${r.sku})` });
    if (!v) {
      errors.push(`Row ${line}: SKU ${r.sku} not found.`);
      continue;
    }
    await db().transaction(async (tx) => {
      const res = await changeStock(tx, {
        variantId: v.id,
        locationId: loc,
        setTo: qty,
        type: "reconciliation",
        sourceType: "csv",
        sourceId: batch,
        reason: `Stocktake CSV (${file.name})`,
        actor: ctx.actor,
      });
      if (res.movementId) {
        changed++;
        await queueCloverPushes(tx, [{ variantId: v.id, delta: res.delta, movementId: res.movementId }]);
      }
      if (r.safety_stock !== undefined && r.safety_stock !== "") {
        await tx
          .update(inventoryBalances)
          .set({ safetyStock: Math.max(0, Math.floor(Number(r.safety_stock) || 0)) })
          .where(and(eq(inventoryBalances.variantId, v.id), eq(inventoryBalances.locationId, loc)));
      }
      if (r.low_stock_threshold !== undefined && r.low_stock_threshold !== "") {
        await tx
          .update(productVariants)
          .set({ lowStockThreshold: Math.max(0, Math.floor(Number(r.low_stock_threshold) || 0)) })
          .where(eq(productVariants.id, v.id));
      }
    });
  }
  await audit(ctx.actor, "inventory.csv_import", "inventory", null, { file: file.name, rows: rows.length, changed, errors: errors.length });
  await enqueue("clover:push", {});
  refresh();
  return {
    ok: errors.length === 0,
    message: `${rows.length - errors.length} rows read, ${changed} SKUs changed${errors.length ? `, ${errors.length} problems` : ""}.`,
    details: errors.slice(0, 50),
  };
}

/**
 * Catalog CSV import. Columns: title, sku, price (required); category, brand, status,
 * compare_at, barcode, description, option_names ("Length|Color"), option_values
 * ("24 in|Natural Black"), on_hand. Rows with the same title become variants of one product.
 * Existing SKUs are updated (price changes need prices.edit).
 */
export async function importCatalogCsv(_: InvState, form: FormData): Promise<InvState> {
  const ctx = await assertStaff("inventory.import");
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return { ok: false, message: "Choose a CSV file." };
  if (file.size > 10 * 1024 * 1024) return { ok: false, message: "CSV must be under 10 MB." };
  const rows = parseCsv(await file.text());
  for (const col of ["title", "sku", "price"]) {
    if (!rows.length || !(col in rows[0])) return { ok: false, message: `Missing column: ${col}` };
  }
  const cats = await db().select().from(categories);
  const loc = await defaultLocationId();
  const commerce = await getSetting("commerce");
  const errors: string[] = [];
  let createdProducts = 0;
  let createdVariants = 0;
  let updatedVariants = 0;
  const byTitle = new Map<string, string>();

  for (const [i, r] of rows.entries()) {
    const line = i + 2;
    const price = Math.round(Number((r.price || "").replace(/[$,]/g, "")) * 100);
    const sku = r.sku.toUpperCase();
    if (!r.title || !sku || !Number.isFinite(price) || price <= 0) {
      errors.push(`Row ${line}: title, sku and a positive price are required.`);
      continue;
    }
    if (!/^[A-Z0-9][A-Z0-9._-]{1,59}$/.test(sku)) {
      errors.push(`Row ${line}: SKU "${r.sku}" has invalid characters.`);
      continue;
    }
    const names = (r.option_names || "").split("|").map((s) => s.trim()).filter(Boolean).slice(0, 3);
    const values = (r.option_values || "").split("|").map((s) => s.trim());
    const options = Object.fromEntries(names.map((n, k) => [n, values[k] ?? ""]).filter(([, v]) => v));
    const compareAt = r.compare_at ? Math.round(Number(r.compare_at.replace(/[$,]/g, "")) * 100) : null;
    try {
      await db().transaction(async (tx) => {
        const existing = await tx.query.productVariants.findFirst({ where: sql`upper(${productVariants.sku}) = ${sku}` });
        if (existing) {
          await tx
            .update(productVariants)
            .set({ priceCents: price, compareAtCents: compareAt, barcode: r.barcode || existing.barcode, options: Object.keys(options).length ? options : existing.options, updatedAt: new Date() })
            .where(eq(productVariants.id, existing.id));
          if (existing.priceCents !== price) await audit(ctx.actor, "price.change", "variant", existing.id, { sku, before: existing.priceCents, after: price, via: "csv" }, tx);
          updatedVariants++;
          byTitle.set(r.title.toLowerCase(), existing.productId);
          return;
        }
        let productId = byTitle.get(r.title.toLowerCase());
        if (!productId) {
          const found = await tx.query.products.findFirst({ where: sql`lower(${products.title}) = lower(${r.title})` });
          productId = found?.id;
        }
        if (!productId) {
          const cat = cats.find((c) => c.slug === slugify(r.category || "") || c.name.toLowerCase() === (r.category || "").toLowerCase());
          let slug = slugify(r.title) || "product";
          for (let n = 2; await tx.query.products.findFirst({ where: eq(products.slug, slug) }); n++) slug = `${slugify(r.title)}-${n}`;
          const [p] = await tx
            .insert(products)
            .values({
              title: r.title,
              slug,
              description: r.description || "",
              brand: r.brand || null,
              categoryId: cat?.id ?? null,
              status: (["active", "draft", "archived"].includes(r.status) ? r.status : "draft") as "draft",
              optionNames: names,
            })
            .returning();
          productId = p.id;
          createdProducts++;
        }
        byTitle.set(r.title.toLowerCase(), productId);
        const [v] = await tx
          .insert(productVariants)
          .values({ productId, sku, barcode: r.barcode || null, options, priceCents: price, compareAtCents: compareAt })
          .returning();
        await tx.insert(inventoryBalances).values({ variantId: v.id, locationId: loc, safetyStock: commerce.defaultSafetyStock }).onConflictDoNothing();
        const qty = Number(r.on_hand);
        if (Number.isInteger(qty) && qty > 0) {
          await changeStock(tx, { variantId: v.id, locationId: loc, setTo: qty, type: "initial_import", sourceType: "csv", sourceId: file.name, reason: "Catalog CSV import", actor: ctx.actor });
        }
        createdVariants++;
      });
    } catch (err) {
      errors.push(`Row ${line}: ${err instanceof Error ? err.message.slice(0, 120) : "failed"}`);
    }
  }
  await audit(ctx.actor, "catalog.csv_import", "product", null, { file: file.name, createdProducts, createdVariants, updatedVariants, errors: errors.length });
  refresh();
  return {
    ok: errors.length === 0,
    message: `${createdProducts} products and ${createdVariants} variants created, ${updatedVariants} variants updated${errors.length ? `, ${errors.length} problems` : ""}. New products start as drafts unless status=active.`,
    details: errors.slice(0, 50),
  };
}
