import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db } from "./db";
import {
  alerts,
  categories,
  cloverConnections,
  cloverItemMappings,
  cloverOutbound,
  integrationEvents,
  inventoryBalances,
  orderItems,
  orders,
  products,
  productVariants,
  sessions,
} from "./db/schema";
import { raiseAlert } from "./audit";

export async function purgeExpiredSessions() {
  await db().delete(sessions).where(lt(sessions.expiresAt, new Date()));
}

/** SKUs at or below their low-stock threshold (dashboard list + daily alert). */
export async function lowStockList(limit = 200) {
  return db()
    .select({
      variantId: productVariants.id,
      sku: productVariants.sku,
      options: productVariants.options,
      threshold: productVariants.lowStockThreshold,
      productId: products.id,
      title: products.title,
      onHand: inventoryBalances.onHand,
      reserved: inventoryBalances.reserved,
      safetyStock: inventoryBalances.safetyStock,
      paused: inventoryBalances.checkoutPaused,
    })
    .from(inventoryBalances)
    .innerJoin(productVariants, eq(productVariants.id, inventoryBalances.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(
      and(
        eq(productVariants.active, true),
        eq(products.status, "active"),
        sql`${inventoryBalances.onHand} - ${inventoryBalances.reserved} <= ${productVariants.lowStockThreshold}`,
      ),
    )
    .orderBy(sql`${inventoryBalances.onHand} - ${inventoryBalances.reserved}`)
    .limit(limit);
}

export async function lowStockDigest() {
  const rows = await lowStockList(500);
  if (rows.length) {
    await raiseAlert({
      kind: "low_stock",
      severity: "info",
      message: `${rows.length} SKU(s) are at or below their low-stock threshold.`,
      dedupeKey: `low_stock:${new Date().toISOString().slice(0, 10)}`,
    });
  }
}

/** Dashboard numbers. Day boundaries are in Eastern Time. */
export async function dashboardSummary() {
  const r = await db().execute(sql`
    with bounds as (
      select (date_trunc('day', now() at time zone 'America/New_York') at time zone 'America/New_York') as today,
             (date_trunc('day', now() at time zone 'America/New_York') at time zone 'America/New_York') - interval '29 days' as d30
    )
    select
      (select coalesce(sum(total_cents - refunded_cents),0)::int from orders, bounds where paid_at >= bounds.today) as sales_today,
      (select count(*)::int from orders, bounds where paid_at >= bounds.today) as orders_today,
      (select coalesce(sum(total_cents - refunded_cents),0)::int from orders, bounds where paid_at >= bounds.d30) as sales_30d,
      (select count(*)::int from orders, bounds where paid_at >= bounds.d30) as orders_30d,
      (select count(*)::int from orders where status in ('paid','processing')) as to_fulfill,
      (select count(*)::int from orders where status = 'ready_for_pickup') as awaiting_pickup,
      (select count(*)::int from orders where status = 'exception') as exceptions,
      (select count(*)::int from orders where status = 'pending_payment') as pending_payment
  `);
  return r.rows[0] as {
    sales_today: number;
    orders_today: number;
    sales_30d: number;
    orders_30d: number;
    to_fulfill: number;
    awaiting_pickup: number;
    exceptions: number;
    pending_payment: number;
  };
}

export async function salesByDay(days = 30) {
  const r = await db().execute(sql`
    with d as (
      select generate_series(
        (date_trunc('day', now() at time zone 'America/New_York') - make_interval(days => ${days - 1}))::date,
        (date_trunc('day', now() at time zone 'America/New_York'))::date,
        interval '1 day')::date as day
    )
    select to_char(d.day, 'MM/DD') as label,
           coalesce(sum(o.total_cents - o.refunded_cents), 0)::int as cents,
           count(o.id)::int as orders
    from d left join orders o on (o.paid_at at time zone 'America/New_York')::date = d.day
    group by d.day order by d.day
  `);
  return r.rows as { label: string; cents: number; orders: number }[];
}

export async function topProducts(days = 30, limit = 8) {
  return db()
    .select({
      title: orderItems.productTitle,
      units: sql<number>`sum(${orderItems.quantity})::int`,
      cents: sql<number>`sum(${orderItems.lineTotalCents})::int`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(gte(orders.paidAt, new Date(Date.now() - days * 86400_000))))
    .groupBy(orderItems.productTitle)
    .orderBy(desc(sql`sum(${orderItems.quantity})`))
    .limit(limit);
}

export async function integrationHealth() {
  const [conn, unmapped, pendingMap, errors, outboundPending, outboundFailed, evPending, evFailed, openAlerts] =
    await Promise.all([
      db().query.cloverConnections.findFirst({ orderBy: (c, { desc }) => [desc(c.updatedAt)] }),
      db().select({ n: sql<number>`count(*)::int` }).from(cloverItemMappings).where(eq(cloverItemMappings.syncStatus, "unmapped")),
      db().select({ n: sql<number>`count(*)::int` }).from(cloverItemMappings).where(eq(cloverItemMappings.syncStatus, "pending")),
      db().select({ n: sql<number>`count(*)::int` }).from(cloverItemMappings).where(eq(cloverItemMappings.syncStatus, "error")),
      db().select({ n: sql<number>`count(*)::int` }).from(cloverOutbound).where(eq(cloverOutbound.status, "pending")),
      db().select({ n: sql<number>`count(*)::int` }).from(cloverOutbound).where(eq(cloverOutbound.status, "failed")),
      db()
        .select({ n: sql<number>`count(*)::int` })
        .from(integrationEvents)
        .where(inArray(integrationEvents.status, ["pending", "processing"])),
      db().select({ n: sql<number>`count(*)::int` }).from(integrationEvents).where(eq(integrationEvents.status, "failed")),
      db().select({ n: sql<number>`count(*)::int` }).from(alerts).where(sql`${alerts.resolvedAt} is null`),
    ]);
  const lastStripe = await db().query.integrationEvents.findFirst({
    where: eq(integrationEvents.provider, "stripe"),
    orderBy: (e, { desc }) => [desc(e.receivedAt)],
  });
  const lastClover = await db().query.integrationEvents.findFirst({
    where: eq(integrationEvents.provider, "clover"),
    orderBy: (e, { desc }) => [desc(e.receivedAt)],
  });
  return {
    clover: conn ?? null,
    unmapped: unmapped[0].n,
    pendingReview: pendingMap[0].n,
    mappingErrors: errors[0].n,
    outboundPending: outboundPending[0].n,
    outboundFailed: outboundFailed[0].n,
    eventsPending: evPending[0].n,
    eventsFailed: evFailed[0].n,
    openAlerts: openAlerts[0].n,
    lastStripeEventAt: lastStripe?.receivedAt ?? null,
    lastCloverEventAt: lastClover?.receivedAt ?? null,
  };
}

export async function categoryOptions() {
  return db().select({ id: categories.id, name: categories.name, parentId: categories.parentId }).from(categories).orderBy(categories.sortOrder, categories.name);
}

void cloverConnections;
