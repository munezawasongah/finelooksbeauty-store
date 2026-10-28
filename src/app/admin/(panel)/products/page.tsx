import Link from "next/link";
import Image from "next/image";
import { Suspense } from "react";
import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";
import { Plus } from "lucide-react";
import { requireStaff } from "@/server/auth/session";
import { db } from "@/server/db";
import { categories, inventoryBalances, productImages, products, productVariants } from "@/server/db/schema";
import { money } from "@/lib/format";
import { can, type Role } from "@/server/auth/permissions";
import { Badge, Empty, PageHeader, Pager, Panel, Table, Td } from "@/components/admin/ui";
import { bulkProductStatus } from "./actions";

export const metadata = { title: "Products" };

export default function ProductsPage(props: PageProps<"/admin/products">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-white" />}>
      <Content {...props} />
    </Suspense>
  );
}

async function Content({ searchParams }: PageProps<"/admin/products">) {
  const ctx = await requireStaff("products.view");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const status = typeof sp.status === "string" && ["draft", "active", "archived"].includes(sp.status) ? sp.status : "";
  const cat = typeof sp.cat === "string" ? sp.cat : "";
  const page = Math.max(1, Number(sp.page) || 1);
  const size = 40;
  const where: SQL[] = [];
  if (status) where.push(eq(products.status, status as "active"));
  else where.push(sql`${products.status} <> 'archived'`);
  if (cat) where.push(eq(products.categoryId, cat));
  if (q) {
    where.push(sql`(${products.title} ilike ${"%" + q + "%"} or ${products.brand} ilike ${"%" + q + "%"} or exists (
      select 1 from ${productVariants} v where v.product_id = ${products.id} and (upper(v.sku) like upper(${"%" + q + "%"}) or v.barcode = ${q})))`);
  }
  const w = and(...where);
  const [rows, [{ n }], cats] = await Promise.all([
    db()
      .select({
        p: products,
        category: categories.name,
        variants: sql<number>`(select count(*)::int from ${productVariants} v where v.product_id = ${products.id} and v.active)`,
        minPrice: sql<number>`(select min(v.price_cents) from ${productVariants} v where v.product_id = ${products.id} and v.active)`,
        stock: sql<number>`coalesce((select sum(b.on_hand)::int from ${inventoryBalances} b join ${productVariants} v on v.id = b.variant_id where v.product_id = ${products.id}), 0)`,
        image: sql<string | null>`(select url from ${productImages} i where i.product_id = ${products.id} order by sort_order limit 1)`,
      })
      .from(products)
      .leftJoin(categories, eq(categories.id, products.categoryId))
      .where(w)
      .orderBy(desc(products.updatedAt))
      .limit(size)
      .offset((page - 1) * size),
    db().select({ n: sql<number>`count(*)::int` }).from(products).where(w),
    db().select().from(categories).orderBy(asc(categories.sortOrder)),
  ]);
  const editable = can(ctx.user.role as Role, "products.edit");
  const href = (p: number) => `/admin/products?${new URLSearchParams({ ...(q ? { q } : {}), ...(status ? { status } : {}), ...(cat ? { cat } : {}), page: String(p) })}`;

  return (
    <>
      <PageHeader
        title="Products"
        description={`${n} products`}
        actions={
          editable ? (
            <>
              <a href="/admin/export/products" className="btn btn-outline btn-sm">Export CSV</a>
              <Link href="/admin/products/new" className="btn btn-primary btn-sm">
                <Plus size={15} aria-hidden /> New product
              </Link>
            </>
          ) : null
        }
      />
      <Panel pad={false}>
        <form className="flex flex-wrap gap-2 border-b border-line p-3" role="search">
          <label htmlFor="pq" className="sr-only">Search</label>
          <input id="pq" name="q" defaultValue={q} placeholder="Name, brand, SKU or barcode" className="field !w-auto flex-1 !py-2" />
          <select name="cat" defaultValue={cat} className="field !w-auto !py-2" aria-label="Category">
            <option value="">All categories</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select name="status" defaultValue={status} className="field !w-auto !py-2" aria-label="Status">
            <option value="">Active &amp; draft</option>
            <option value="active">Active</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
          </select>
          <button className="btn btn-dark btn-sm">Filter</button>
        </form>
        <form action={bulkProductStatus}>
          <Table head={["", "Product", "Category", "Status", "Variants", "From", "On hand"]} empty={rows.length === 0 ? <Empty>No products match.</Empty> : null}>
            {rows.map(({ p, category, variants, minPrice, stock, image }) => (
              <tr key={p.id} className="hover:bg-mist/50">
                <Td className="w-8">{editable && <input type="checkbox" name="ids" value={p.id} aria-label={`Select ${p.title}`} className="h-4 w-4 accent-iris-600" />}</Td>
                <Td>
                  <Link href={`/admin/products/${p.id}`} className="flex items-center gap-3">
                    <span className="relative h-11 w-9 shrink-0 overflow-hidden rounded-lg bg-mist">
                      {image && <Image src={image} alt="" fill sizes="36px" className="object-cover" />}
                    </span>
                    <span>
                      <span className="block font-semibold text-ink hover:text-iris-700">{p.title}</span>
                      <span className="text-xs text-muted">{p.brand}</span>
                    </span>
                  </Link>
                </Td>
                <Td className="text-muted">{category ?? "—"}</Td>
                <Td>
                  <Badge tone={p.status === "active" ? "green" : p.status === "draft" ? "amber" : "neutral"}>{p.status}</Badge>
                  {p.featured && <span className="ml-1"><Badge tone="iris">featured</Badge></span>}
                </Td>
                <Td>{variants}</Td>
                <Td>{minPrice ? money(minPrice) : "—"}</Td>
                <Td className={stock <= 0 ? "font-semibold text-danger" : ""}>{stock}</Td>
              </tr>
            ))}
          </Table>
          {editable && rows.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-t border-line p-3 text-sm">
              <span className="text-muted">With selected:</span>
              <button name="status" value="active" className="btn btn-outline btn-sm">Publish</button>
              <button name="status" value="draft" className="btn btn-outline btn-sm">Move to draft</button>
              <button name="status" value="archived" className="btn btn-outline btn-sm">Archive</button>
            </div>
          )}
        </form>
        <Pager page={page} pages={Math.ceil(n / size)} href={href} />
      </Panel>
    </>
  );
}
