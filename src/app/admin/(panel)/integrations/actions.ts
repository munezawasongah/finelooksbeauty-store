"use server";

import { refresh } from "next/cache";
import { eq, inArray, sql } from "drizzle-orm";
import { assertStaff } from "@/server/auth/session";
import { db } from "@/server/db";
import { cloverConnections, cloverItemMappings, integrationEvents, inventoryBalances, products, productVariants } from "@/server/db/schema";
import { getSetting } from "@/server/settings";
import { defaultLocationId } from "@/server/inventory";
import { slugify } from "@/lib/format";
import { approveMapping, importItems, reconcile, retryFailedPushes, unlinkMapping } from "@/server/clover/sync";
import { processEvent } from "@/server/events";
import { audit } from "@/server/audit";
import { enqueue } from "@/server/queue";

export type IntState = { ok: boolean; message: string } | null;

export async function runImport(): Promise<IntState> {
  const ctx = await assertStaff("integrations.manage");
  try {
    const r = await importItems(ctx.user.email);
    refresh();
    return { ok: true, message: `Read ${r.total} Clover items: ${r.created} new, ${r.suggested} matched by SKU/barcode for review.` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Import failed." };
  }
}

export async function runReconcile(): Promise<IntState> {
  const ctx = await assertStaff("integrations.manage");
  try {
    const r = await reconcile(ctx.user.email);
    refresh();
    if (!r) return { ok: false, message: "Clover is not connected." };
    return { ok: true, message: `Checked ${r.checked} SKUs, ${r.discrepancies.length} corrected.` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Reconciliation failed." };
  }
}

export async function retryPushes(): Promise<IntState> {
  const ctx = await assertStaff("integrations.manage");
  const n = await retryFailedPushes(ctx.actor);
  await enqueue("clover:push", {});
  refresh();
  return { ok: true, message: `${n} failed Clover writes queued again.` };
}

export async function approve(_: IntState, form: FormData): Promise<IntState> {
  const ctx = await assertStaff("integrations.manage");
  const mappingId = String(form.get("mappingId") ?? "");
  let variantId = String(form.get("variantId") ?? "");
  const sku = String(form.get("sku") ?? "").trim();
  if (sku) {
    const v = await db().query.productVariants.findFirst({ where: sql`upper(${productVariants.sku}) = upper(${sku})` });
    if (!v) return { ok: false, message: `No website SKU ${sku}.` };
    variantId = v.id;
  }
  if (!variantId) return { ok: false, message: "Enter the website SKU to link." };
  try {
    await approveMapping(ctx.actor, mappingId, variantId);
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Could not link." };
  }
  refresh();
  return { ok: true, message: "Linked. Website stock now follows Clover." };
}

export async function unlink(form: FormData) {
  const ctx = await assertStaff("integrations.manage");
  await unlinkMapping(ctx.actor, String(form.get("mappingId") ?? ""));
  refresh();
}

export async function retryEvents(form: FormData) {
  const ctx = await assertStaff("integrations.manage");
  const ids = form.getAll("eventId").map(String);
  const rows = await db().select({ id: integrationEvents.id }).from(integrationEvents).where(inArray(integrationEvents.id, ids));
  for (const r of rows) {
    await db().update(integrationEvents).set({ attemptCount: 0 }).where(eq(integrationEvents.id, r.id));
    await processEvent(r.id).catch(() => {});
  }
  await audit(ctx.actor, "events.retry", "integration", null, { count: rows.length });
  refresh();
}

export async function disconnectClover(form: FormData) {
  const ctx = await assertStaff("integrations.manage");
  const merchantId = String(form.get("merchantId") ?? "");
  await db().update(cloverConnections).set({ status: "disconnected", updatedAt: new Date() }).where(eq(cloverConnections.merchantId, merchantId));
  await audit(ctx.actor, "clover.disconnected", "integration", merchantId);
  refresh();
}

/** Create a draft website product from an unmapped Clover item and link it. */
export async function createFromClover(_: IntState, form: FormData): Promise<IntState> {
  const ctx = await assertStaff("integrations.manage");
  const mappingId = String(form.get("mappingId") ?? "");
  const map = await db().query.cloverItemMappings.findFirst({ where: eq(cloverItemMappings.id, mappingId) });
  if (!map) return { ok: false, message: "Clover item not found." };
  if (map.variantId) return { ok: false, message: "Already linked." };
  const sku = (map.cloverSku || map.cloverCode || `CLV-${map.cloverItemId}`).toUpperCase().replace(/[^A-Z0-9._-]/g, "-").slice(0, 60);
  const clash = await db().query.productVariants.findFirst({ where: sql`upper(${productVariants.sku}) = ${sku}` });
  if (clash) return { ok: false, message: `SKU ${sku} already exists on the website — link it instead.` };
  const commerce = await getSetting("commerce");
  const loc = await defaultLocationId();
  let slug = slugify(map.cloverName) || "product";
  for (let n = 2; await db().query.products.findFirst({ where: eq(products.slug, slug) }); n++) slug = `${slugify(map.cloverName)}-${n}`;
  const variantId = await db().transaction(async (tx) => {
    const [p] = await tx.insert(products).values({ title: map.cloverName, slug, status: "draft" }).returning();
    const [v] = await tx
      .insert(productVariants)
      .values({ productId: p.id, sku, barcode: map.cloverCode, priceCents: map.cloverPriceCents ?? 0 })
      .returning();
    await tx.insert(inventoryBalances).values({ variantId: v.id, locationId: loc, safetyStock: commerce.defaultSafetyStock });
    await audit(ctx.actor, "product.create_from_clover", "product", p.id, { cloverItemId: map.cloverItemId, sku }, tx);
    return v.id;
  });
  await approveMapping(ctx.actor, map.id, variantId);
  refresh();
  return { ok: true, message: `Draft product "${map.cloverName}" created and linked. Add photos and publish it from Products.` };
}
