import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getStaffSession } from "@/server/auth/session";
import { can, type Role } from "@/server/auth/permissions";
import { db } from "@/server/db";
import { categories, customers, inventoryBalances, orders, products, productVariants } from "@/server/db/schema";
import { defaultLocationId, availableToSell } from "@/server/inventory";
import { toCsv } from "@/lib/csv";
import { dateET, variantLabel } from "@/lib/format";
import { audit } from "@/server/audit";

const TABS: Record<string, string[]> = {
  todo: ["paid", "processing"],
  pickup: ["ready_for_pickup"],
  review: ["exception"],
  shipped: ["shipped"],
  done: ["delivered"],
  pending: ["pending_payment"],
  cancelled: ["cancelled"],
};

/** CSV exports (orders, products, inventory, customers). Requires the exports.run permission. */
export async function GET(req: Request, ctx: RouteContext<"/admin/export/[kind]">) {
  const staff = await getStaffSession();
  if (!staff || !staff.session.mfaVerified) return new Response("Unauthorized", { status: 401 });
  if (!can(staff.user.role as Role, "exports.run")) return new Response("Forbidden", { status: 403 });
  const { kind } = await ctx.params;
  const url = new URL(req.url);
  let csv: string;

  if (kind === "orders") {
    const tab = url.searchParams.get("tab") ?? "all";
    const rows = await db()
      .select()
      .from(orders)
      .where(TABS[tab] ? inArray(orders.status, TABS[tab] as ("paid")[]) : undefined)
      .orderBy(desc(orders.createdAt))
      .limit(20000);
    csv = toCsv(
      ["order", "created_et", "paid_et", "status", "payment", "method", "customer", "email", "subtotal", "discount", "shipping", "tax", "total", "refunded", "ship_city", "ship_state", "ship_zip"],
      rows.map((o) => [
        o.number,
        dateET(o.createdAt, true),
        dateET(o.paidAt, true),
        o.status,
        o.paymentStatus,
        o.fulfillmentMethod,
        o.customerName,
        o.email,
        (o.subtotalCents / 100).toFixed(2),
        (o.discountCents / 100).toFixed(2),
        (o.shippingCents / 100).toFixed(2),
        (o.taxCents / 100).toFixed(2),
        (o.totalCents / 100).toFixed(2),
        (o.refundedCents / 100).toFixed(2),
        o.shippingAddress?.city,
        o.shippingAddress?.state,
        o.shippingAddress?.zip,
      ]),
    );
  } else if (kind === "products") {
    const rows = await db()
      .select({ p: products, v: productVariants, cat: categories.slug })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .leftJoin(categories, eq(categories.id, products.categoryId))
      .orderBy(asc(products.title), asc(productVariants.sortOrder));
    csv = toCsv(
      ["title", "sku", "price", "compare_at", "barcode", "category", "brand", "status", "option_names", "option_values", "active", "description"],
      rows.map(({ p, v, cat }) => [
        p.title,
        v.sku,
        (v.priceCents / 100).toFixed(2),
        v.compareAtCents ? (v.compareAtCents / 100).toFixed(2) : "",
        v.barcode,
        cat,
        p.brand,
        p.status,
        p.optionNames.join("|"),
        p.optionNames.map((n) => v.options[n] ?? "").join("|"),
        v.active ? "yes" : "no",
        p.description,
      ]),
    );
  } else if (kind === "inventory") {
    const loc = await defaultLocationId();
    const rows = await db()
      .select({ b: inventoryBalances, v: productVariants, title: products.title })
      .from(inventoryBalances)
      .innerJoin(productVariants, eq(productVariants.id, inventoryBalances.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(and(eq(inventoryBalances.locationId, loc), sql`${products.status} <> 'archived'`))
      .orderBy(asc(products.title));
    csv = toCsv(
      ["sku", "product", "variant", "on_hand", "reserved", "safety_stock", "available_online", "low_stock_threshold", "paused", "last_sync_et"],
      rows.map(({ b, v, title }) => [
        v.sku,
        title,
        variantLabel(v.options),
        b.onHand,
        b.reserved,
        b.safetyStock,
        availableToSell(b),
        v.lowStockThreshold,
        b.checkoutPaused ? "yes" : "no",
        dateET(b.lastSyncedAt, true),
      ]),
    );
  } else if (kind === "customers") {
    if (!can(staff.user.role as Role, "customers.view")) return new Response("Forbidden", { status: 403 });
    const rows = await db().select().from(customers).where(sql`${customers.deletedAt} is null`).orderBy(asc(customers.createdAt));
    csv = toCsv(
      ["email", "first_name", "last_name", "phone", "marketing_opt_in", "created_et"],
      rows.map((c) => [c.email, c.firstName, c.lastName, c.phone, c.marketingOptIn ? "yes" : "no", dateET(c.createdAt, true)]),
    );
  } else {
    return new Response("Not found", { status: 404 });
  }

  await audit(staff.actor, "export", kind, null, { query: url.search });
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="fine-looks-${kind}-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
