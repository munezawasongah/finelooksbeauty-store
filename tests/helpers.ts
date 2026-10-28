import { sql } from "drizzle-orm";
import { db } from "../src/server/db";
import { inventoryBalances, locations, orders, productVariants, products } from "../src/server/db/schema";
import { randomUUID } from "node:crypto";

export async function resetDb() {
  await db().execute(sql`
    truncate table stock_reservations, order_items, order_events, payments, refunds, orders,
      inventory_balances, product_variants, product_images, products, categories, locations,
      integration_events, clover_outbound, clover_item_mappings, clover_connections, alerts,
      cart_items, carts, sessions, users, customers, discounts, shipping_methods, settings cascade
  `);
  // stock_movements is append-only (row trigger); TRUNCATE bypasses row triggers.
  await db().execute(sql`truncate table stock_movements cascade`);
}

export async function makeLocation() {
  const { resetLocationCache } = await import("../src/server/inventory");
  resetLocationCache();
  const [loc] = await db()
    .insert(locations)
    .values({ code: "garner", name: "Garner store", isDefault: true })
    .returning();
  return loc;
}

export async function makeVariant(locationId: string, onHand: number, safetyStock = 0) {
  const [p] = await db()
    .insert(products)
    .values({ slug: `wig-${randomUUID().slice(0, 8)}`, title: "Body Wave Lace Front Wig", status: "active" })
    .returning();
  const [v] = await db()
    .insert(productVariants)
    .values({ productId: p.id, sku: `BW-${randomUUID().slice(0, 8)}`, priceCents: 12999, options: { Length: '24"' } })
    .returning();
  await db().insert(inventoryBalances).values({ variantId: v.id, locationId, onHand, safetyStock });
  return v;
}

export async function makeOrder() {
  const [o] = await db()
    .insert(orders)
    .values({
      number: `T-${randomUUID().slice(0, 8)}`,
      fulfillmentMethod: "pickup",
      subtotalCents: 12999,
      totalCents: 12999,
    })
    .returning();
  return o;
}

export async function balance(variantId: string) {
  const b = await db().query.inventoryBalances.findFirst({ where: (t, { eq }) => eq(t.variantId, variantId) });
  return b!;
}
