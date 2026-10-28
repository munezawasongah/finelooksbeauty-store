import Link from "next/link";
import { Suspense } from "react";
import { and, desc, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import { requireStaff } from "@/server/auth/session";
import { db } from "@/server/db";
import { orders } from "@/server/db/schema";
import { dateET, money } from "@/lib/format";
import { Badge, Empty, ORDER_STATUS, PAYMENT_STATUS, PageHeader, Pager, Panel, Table, Td } from "@/components/admin/ui";
import { can, type Role } from "@/server/auth/permissions";

export const metadata = { title: "Orders" };

const TABS = [
  { key: "todo", label: "To fulfill", statuses: ["paid", "processing"] },
  { key: "pickup", label: "Awaiting pickup", statuses: ["ready_for_pickup"] },
  { key: "review", label: "Needs review", statuses: ["exception"] },
  { key: "shipped", label: "Shipped", statuses: ["shipped"] },
  { key: "done", label: "Completed", statuses: ["delivered"] },
  { key: "pending", label: "Awaiting payment", statuses: ["pending_payment"] },
  { key: "cancelled", label: "Cancelled", statuses: ["cancelled"] },
  { key: "all", label: "All", statuses: [] },
] as const;

export default function OrdersPage(props: PageProps<"/admin/orders">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-white" />}>
      <Content {...props} />
    </Suspense>
  );
}

async function Content({ searchParams }: PageProps<"/admin/orders">) {
  const ctx = await requireStaff("orders.view");
  const sp = await searchParams;
  const tab = TABS.find((t) => t.key === sp.tab) ?? TABS[0];
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const page = Math.max(1, Number(sp.page) || 1);
  const size = 30;

  const where: SQL[] = [];
  if (tab.statuses.length) where.push(inArray(orders.status, [...tab.statuses]));
  if (sp.method === "pickup" || sp.method === "ship") where.push(eq(orders.fulfillmentMethod, sp.method));
  if (q) {
    where.push(
      or(
        sql`${orders.number} ilike ${"%" + q + "%"}`,
        sql`${orders.email} ilike ${"%" + q + "%"}`,
        sql`${orders.customerName} ilike ${"%" + q + "%"}`,
        sql`${orders.phone} ilike ${"%" + q.replace(/\D/g, "") + "%"}`,
      )!,
    );
  }
  const w = where.length ? and(...where) : undefined;
  const [rows, [{ n }]] = await Promise.all([
    db().select().from(orders).where(w).orderBy(desc(orders.createdAt)).limit(size).offset((page - 1) * size),
    db().select({ n: sql<number>`count(*)::int` }).from(orders).where(w),
  ]);
  const href = (p: number) => `/admin/orders?${new URLSearchParams({ tab: tab.key, ...(q ? { q } : {}), page: String(p) })}`;

  return (
    <>
      <PageHeader
        title="Orders"
        description="Paid orders appear here after Stripe confirms payment."
        actions={
          can(ctx.user.role as Role, "exports.run") ? (
            <a className="btn btn-outline btn-sm" href={`/admin/export/orders?tab=${tab.key}`}>
              Export CSV
            </a>
          ) : null
        }
      />
      <div className="no-scrollbar mb-4 flex gap-1 overflow-x-auto">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/admin/orders?tab=${t.key}`}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold ${
              t.key === tab.key ? "bg-ink text-white" : "text-ink-soft hover:bg-white"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>
      <Panel pad={false}>
        <form className="flex flex-wrap gap-2 border-b border-line p-3" role="search">
          <input type="hidden" name="tab" value={tab.key} />
          <label htmlFor="oq" className="sr-only">Search orders</label>
          <input id="oq" name="q" defaultValue={q} placeholder="Order number, name, email or phone" className="field !w-auto flex-1 !py-2" />
          <select name="method" defaultValue={typeof sp.method === "string" ? sp.method : ""} className="field !w-auto !py-2" aria-label="Fulfillment">
            <option value="">Ship &amp; pickup</option>
            <option value="ship">Ship only</option>
            <option value="pickup">Pickup only</option>
          </select>
          <button className="btn btn-dark btn-sm">Search</button>
        </form>
        <Table head={["Order", "Date (ET)", "Customer", "Method", "Status", "Payment", "Total"]} empty={rows.length === 0 ? <Empty>No orders here.</Empty> : null}>
          {rows.map((o) => (
            <tr key={o.id} className="hover:bg-mist/50">
              <Td>
                <Link href={`/admin/orders/${o.id}`} className="font-bold text-iris-700">
                  {o.number}
                </Link>
              </Td>
              <Td className="text-muted">{dateET(o.createdAt, true)}</Td>
              <Td>
                <span className="block">{o.customerName ?? "—"}</span>
                <span className="text-xs text-muted">{o.email}</span>
              </Td>
              <Td>{o.fulfillmentMethod === "pickup" ? "Pickup" : "Ship"}</Td>
              <Td><Badge tone={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].label}</Badge></Td>
              <Td><Badge tone={PAYMENT_STATUS[o.paymentStatus].tone}>{PAYMENT_STATUS[o.paymentStatus].label}</Badge></Td>
              <Td className="text-right font-semibold">{money(o.totalCents)}</Td>
            </tr>
          ))}
        </Table>
        <Pager page={page} pages={Math.ceil(n / size)} href={href} />
      </Panel>
    </>
  );
}
