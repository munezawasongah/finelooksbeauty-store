import Link from "next/link";
import { Suspense } from "react";
import { and, asc, eq, sql, type SQL } from "drizzle-orm";
import { requireStaff } from "@/server/auth/session";
import { can, type Role } from "@/server/auth/permissions";
import { db } from "@/server/db";
import { cloverItemMappings, inventoryBalances, products, productVariants } from "@/server/db/schema";
import { defaultLocationId, availableToSell } from "@/server/inventory";
import { dateET, variantLabel } from "@/lib/format";
import { Badge, Empty, PageHeader, Pager, Panel, Table, Td } from "@/components/admin/ui";
import { CatalogImportForm, StockImportForm } from "./forms";

export const metadata = { title: "Inventory" };

const FILTERS = [
  { key: "all", label: "All" },
  { key: "low", label: "Low stock" },
  { key: "out", label: "Out of stock" },
  { key: "reserved", label: "Held in checkout" },
  { key: "paused", label: "Paused online" },
  { key: "negative", label: "Negative" },
];

export default function InventoryPage(props: PageProps<"/admin/inventory">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-white" />}>
      <Content {...props} />
    </Suspense>
  );
}

async function Content({ searchParams }: PageProps<"/admin/inventory">) {
  const ctx = await requireStaff("inventory.view");
  const sp = await searchParams;
  const filter = FILTERS.find((f) => f.key === sp.filter)?.key ?? "all";
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const page = Math.max(1, Number(sp.page) || 1);
  const size = 50;
  const loc = await defaultLocationId();

  const where: SQL[] = [eq(inventoryBalances.locationId, loc), sql`${products.status} <> 'archived'`];
  if (filter === "low") where.push(sql`${inventoryBalances.onHand} - ${inventoryBalances.reserved} <= ${productVariants.lowStockThreshold} and ${inventoryBalances.onHand} - ${inventoryBalances.reserved} > 0`);
  if (filter === "out") where.push(sql`${inventoryBalances.onHand} - ${inventoryBalances.reserved} <= 0`);
  if (filter === "reserved") where.push(sql`${inventoryBalances.reserved} > 0`);
  if (filter === "paused") where.push(eq(inventoryBalances.checkoutPaused, true));
  if (filter === "negative") where.push(sql`${inventoryBalances.onHand} < 0`);
  if (q) where.push(sql`(${products.title} ilike ${"%" + q + "%"} or upper(${productVariants.sku}) like upper(${"%" + q + "%"}) or ${productVariants.barcode} = ${q})`);
  const w = and(...where);

  const base = db()
    .select({ b: inventoryBalances, v: productVariants, title: products.title, productId: products.id, clover: cloverItemMappings.syncStatus })
    .from(inventoryBalances)
    .innerJoin(productVariants, eq(productVariants.id, inventoryBalances.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .leftJoin(cloverItemMappings, eq(cloverItemMappings.variantId, productVariants.id))
    .where(w);
  const [rows, [{ n }]] = await Promise.all([
    base.orderBy(asc(products.title), asc(productVariants.sortOrder)).limit(size).offset((page - 1) * size),
    db()
      .select({ n: sql<number>`count(*)::int` })
      .from(inventoryBalances)
      .innerJoin(productVariants, eq(productVariants.id, inventoryBalances.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(w),
  ]);
  const role = ctx.user.role as Role;
  const href = (p: number) => `/admin/inventory?${new URLSearchParams({ filter, ...(q ? { q } : {}), page: String(p) })}`;

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Available to sell online = on hand − held in checkout − safety stock."
        actions={can(role, "exports.run") ? <a href="/admin/export/inventory" className="btn btn-outline btn-sm">Export CSV</a> : null}
      />
      <div className="no-scrollbar mb-4 flex gap-1 overflow-x-auto">
        {FILTERS.map((f) => (
          <Link key={f.key} href={`/admin/inventory?filter=${f.key}`} className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold ${f.key === filter ? "bg-ink text-white" : "text-ink-soft hover:bg-white"}`}>
            {f.label}
          </Link>
        ))}
      </div>
      <Panel pad={false}>
        <form className="flex gap-2 border-b border-line p-3" role="search">
          <input type="hidden" name="filter" value={filter} />
          <label htmlFor="iq" className="sr-only">Search</label>
          <input id="iq" name="q" defaultValue={q} placeholder="Product, SKU or barcode" className="field flex-1 !py-2" />
          <button className="btn btn-dark btn-sm">Search</button>
        </form>
        <Table head={["Product / SKU", "On hand", "Held", "Safety", "Sellable", "Clover", "Last sync (ET)", ""]} empty={rows.length === 0 ? <Empty>Nothing here.</Empty> : null}>
          {rows.map(({ b, v, title, clover }) => {
            const avail = availableToSell(b);
            return (
              <tr key={v.id} className="hover:bg-mist/50">
                <Td>
                  <span className="block font-semibold">{title}</span>
                  <span className="text-xs text-muted">
                    {v.sku}
                    {variantLabel(v.options) && ` · ${variantLabel(v.options)}`}
                  </span>
                </Td>
                <Td className={b.onHand < 0 ? "font-bold text-danger" : "font-semibold"}>{b.onHand}</Td>
                <Td>{b.reserved || "—"}</Td>
                <Td>{b.safetyStock}</Td>
                <Td>
                  {b.checkoutPaused ? (
                    <Badge tone="red">paused{b.pauseReason && b.pauseReason !== "manual" ? ` · ${b.pauseReason.replace("_", " ")}` : ""}</Badge>
                  ) : (
                    <Badge tone={avail <= 0 ? "red" : avail <= v.lowStockThreshold ? "amber" : "green"}>{avail}</Badge>
                  )}
                </Td>
                <Td>{clover ? <Badge tone={clover === "ok" ? "green" : clover === "error" ? "red" : "amber"}>{clover}</Badge> : <span className="text-xs text-muted">not linked</span>}</Td>
                <Td className="text-xs text-muted">{b.lastSyncedAt ? dateET(b.lastSyncedAt, true) : "—"}</Td>
                <Td>
                  <Link href={`/admin/inventory/${v.id}`} className="text-sm font-bold text-iris-700">
                    {can(role, "inventory.adjust") ? "Adjust" : "History"}
                  </Link>
                </Td>
              </tr>
            );
          })}
        </Table>
        <Pager page={page} pages={Math.ceil(n / size)} href={href} />
      </Panel>

      {can(role, "inventory.import") && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Panel title="Stocktake CSV import">
            <p className="mb-3 text-sm text-muted">
              Columns: <code>sku, on_hand</code> (optional <code>safety_stock, low_stock_threshold</code>). Sets each SKU&apos;s count and logs one movement per change.
            </p>
            <StockImportForm />
          </Panel>
          <Panel title="Catalog CSV import">
            <p className="mb-3 text-sm text-muted">
              Columns: <code>title, sku, price</code> plus optional <code>category, brand, status, compare_at, barcode, description, option_names, option_values, on_hand</code>. Rows with the same title become one product. Use <code>|</code> between option names/values.
            </p>
            <CatalogImportForm />
          </Panel>
        </div>
      )}
    </>
  );
}
