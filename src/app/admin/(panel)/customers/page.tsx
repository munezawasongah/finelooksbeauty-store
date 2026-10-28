import Link from "next/link";
import { Suspense } from "react";
import { sql } from "drizzle-orm";
import { requireStaff } from "@/server/auth/session";
import { can, type Role } from "@/server/auth/permissions";
import { db } from "@/server/db";
import { customers, orders } from "@/server/db/schema";
import { dateET, formatPhoneUS, money } from "@/lib/format";
import { Badge, Empty, PageHeader, Pager, Panel, Table, Td } from "@/components/admin/ui";

export const metadata = { title: "Customers" };

export default function CustomersPage(props: PageProps<"/admin/customers">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-white" />}>
      <Content {...props} />
    </Suspense>
  );
}

/** Customers = account holders plus guest buyers, grouped by email. */
async function Content({ searchParams }: PageProps<"/admin/customers">) {
  const ctx = await requireStaff("customers.view");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80).toLowerCase() : "";
  const page = Math.max(1, Number(sp.page) || 1);
  const size = 40;
  const like = `%${q}%`;
  const r = await db().execute(sql`
    with buyers as (
      select lower(o.email) as email,
             max(o.customer_name) as name,
             max(o.phone) as phone,
             count(*) filter (where o.payment_status in ('paid','partially_refunded','refunded'))::int as orders,
             coalesce(sum(o.total_cents - o.refunded_cents) filter (where o.payment_status in ('paid','partially_refunded','refunded')), 0)::int as spent,
             max(o.created_at) as last_order,
             bool_or(o.marketing_opt_in) as marketing_order
      from ${orders} o where o.email is not null group by lower(o.email)
    ), people as (
      select coalesce(lower(c.email), b.email) as email,
             coalesce(nullif(trim(concat(c.first_name, ' ', c.last_name)), ''), b.name) as name,
             coalesce(c.phone, b.phone) as phone,
             coalesce(b.orders, 0) as orders, coalesce(b.spent, 0) as spent, b.last_order,
             (c.id is not null) as has_account, coalesce(c.marketing_opt_in, false) or coalesce(b.marketing_order, false) as marketing,
             c.created_at
      from ${customers} c full outer join buyers b on lower(c.email) = b.email
      where c.deleted_at is null
    )
    select *, count(*) over()::int as total from people
    where ${q ? sql`(email like ${like} or lower(name) like ${like} or phone like ${"%" + q.replace(/\D/g, "") + "%"})` : sql`true`}
    order by last_order desc nulls last, created_at desc nulls last
    limit ${size} offset ${(page - 1) * size}
  `);
  const rows = r.rows as { email: string; name: string | null; phone: string | null; orders: number; spent: number; last_order: string | null; has_account: boolean; marketing: boolean; total: number }[];
  const total = rows[0]?.total ?? 0;

  return (
    <>
      <PageHeader
        title="Customers"
        description="Account holders and guest buyers, matched by email."
        actions={can(ctx.user.role as Role, "exports.run") ? <a href="/admin/export/customers" className="btn btn-outline btn-sm">Export accounts CSV</a> : null}
      />
      <Panel pad={false}>
        <form className="flex gap-2 border-b border-line p-3" role="search">
          <label htmlFor="cq" className="sr-only">Search customers</label>
          <input id="cq" name="q" defaultValue={q} placeholder="Name, email or phone" className="field flex-1 !py-2" />
          <button className="btn btn-dark btn-sm">Search</button>
        </form>
        <Table head={["Customer", "Phone", "Orders", "Spent (net)", "Last order", "Type", "Marketing"]} empty={rows.length === 0 ? <Empty>No customers found.</Empty> : null}>
          {rows.map((c) => (
            <tr key={c.email}>
              <Td>
                <Link href={`/admin/orders?tab=all&q=${encodeURIComponent(c.email)}`} className="font-semibold text-ink hover:text-iris-700">
                  {c.name || "—"}
                </Link>
                <span className="block text-xs text-muted">{c.email}</span>
              </Td>
              <Td className="text-sm">{formatPhoneUS(c.phone)}</Td>
              <Td>{c.orders}</Td>
              <Td className="font-semibold">{money(c.spent)}</Td>
              <Td className="text-xs text-muted">{c.last_order ? dateET(c.last_order) : "—"}</Td>
              <Td>{c.has_account ? <Badge tone="iris">account</Badge> : <Badge>guest</Badge>}</Td>
              <Td>{c.marketing ? <Badge tone="green">opted in</Badge> : <span className="text-xs text-muted">no</span>}</Td>
            </tr>
          ))}
        </Table>
        <Pager page={page} pages={Math.ceil(total / size)} href={(p) => `/admin/customers?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) })}`} />
      </Panel>
      <p className="mt-3 text-xs text-muted">Only email customers who opted in to marketing (CAN-SPAM). Order emails are separate and always sent.</p>
    </>
  );
}
