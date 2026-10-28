import Link from "next/link";
import { Suspense } from "react";
import { desc, isNull } from "drizzle-orm";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { requireStaff } from "@/server/auth/session";
import { db } from "@/server/db";
import { alerts, orders } from "@/server/db/schema";
import { dashboardSummary, integrationHealth, lowStockList, salesByDay, topProducts } from "@/server/reports";
import { dateET, money, variantLabel } from "@/lib/format";
import { isStripeConfigured, isCloverConfigured, isSmtpConfigured, isS3Configured } from "@/server/env";
import { stripeMode } from "@/server/payments/stripe";
import { Badge, ORDER_STATUS, PageHeader, Panel, Stat } from "@/components/admin/ui";
import { BarChart } from "@/components/admin/BarChart";

export const metadata = { title: "Overview" };

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-white" />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const ctx = await requireStaff("dashboard.view");
  const [summary, days, top, low, health, recent, openAlerts] = await Promise.all([
    dashboardSummary(),
    salesByDay(30),
    topProducts(30),
    lowStockList(8),
    integrationHealth(),
    db().select().from(orders).orderBy(desc(orders.createdAt)).limit(8),
    db().select().from(alerts).where(isNull(alerts.resolvedAt)).orderBy(desc(alerts.createdAt)).limit(5),
  ]);

  const setup = [
    { ok: isStripeConfigured(), label: `Stripe payments${isStripeConfigured() ? ` (${stripeMode()} mode)` : ""}` },
    { ok: isCloverConfigured() && Boolean(health.clover && health.clover.status === "connected"), label: "Clover POS connected" },
    { ok: isSmtpConfigured(), label: "Email sending" },
    { ok: isS3Configured(), label: "Image storage" },
  ];

  return (
    <>
      <PageHeader title={`Hello, ${ctx.user.name.split(" ")[0]}`} description={`Today is ${dateET(new Date())}. Figures use Eastern Time.`} />

      {setup.some((s) => !s.ok) && (
        <Panel title="Finish setting up" className="mb-6">
          <ul className="grid gap-2 sm:grid-cols-2">
            {setup.map((s) => (
              <li key={s.label} className="flex items-center gap-2 text-sm">
                <span className={`h-2.5 w-2.5 rounded-full ${s.ok ? "bg-success" : "bg-warning"}`} />
                {s.label} {s.ok ? <Badge tone="green">ready</Badge> : <Badge tone="amber">not configured</Badge>}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Sales today" value={money(summary.sales_today)} hint={`${summary.orders_today} orders`} />
        <Stat label="Last 30 days" value={money(summary.sales_30d)} hint={`${summary.orders_30d} orders`} />
        <Stat label="To fulfill" value={summary.to_fulfill} hint={`${summary.awaiting_pickup} awaiting pickup`} />
        <Stat label="Need review" value={summary.exceptions} tone={summary.exceptions ? "alert" : "default"} hint={`${summary.pending_payment} checkouts in progress`} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Panel title="Sales, last 30 days (net of refunds)">
          <BarChart data={days.map((d) => ({ label: d.label, value: d.cents }))} format={money} />
        </Panel>
        <Panel title="Alerts" actions={<Link href="/admin/alerts" className="text-xs font-bold text-iris-700">All alerts</Link>}>
          {openAlerts.length === 0 ? (
            <p className="text-sm text-muted">No open alerts. All quiet.</p>
          ) : (
            <ul className="space-y-3">
              {openAlerts.map((a) => (
                <li key={a.id} className="flex gap-3 text-sm">
                  <AlertTriangle size={16} className={`mt-0.5 shrink-0 ${a.severity === "critical" ? "text-danger" : a.severity === "warning" ? "text-warning" : "text-iris-500"}`} aria-hidden />
                  <span>
                    {a.message}
                    <span className="block text-xs text-muted">{dateET(a.createdAt, true)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Panel title="Recent orders" pad={false} actions={<Link href="/admin/orders" className="text-xs font-bold text-iris-700">All orders</Link>}>
          <ul className="divide-y divide-line">
            {recent.map((o) => (
              <li key={o.id}>
                <Link href={`/admin/orders/${o.id}`} className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-mist/60">
                  <span>
                    <span className="font-semibold">{o.number}</span>
                    <span className="block text-xs text-muted">
                      {o.customerName ?? o.email ?? "—"} · {o.fulfillmentMethod === "pickup" ? "Pickup" : "Ship"}
                    </span>
                  </span>
                  <Badge tone={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].label}</Badge>
                  <span className="w-20 text-right font-semibold">{money(o.totalCents)}</span>
                </Link>
              </li>
            ))}
            {recent.length === 0 && <li className="px-5 py-6 text-sm text-muted">No orders yet.</li>}
          </ul>
        </Panel>
        <div className="grid gap-6">
          <Panel title="Low stock" pad={false} actions={<Link href="/admin/inventory?filter=low" className="text-xs font-bold text-iris-700">Inventory</Link>}>
            <ul className="divide-y divide-line">
              {low.map((l) => (
                <li key={l.variantId} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{l.title}</span>
                    <span className="text-xs text-muted">{l.sku} {variantLabel(l.options) && `· ${variantLabel(l.options)}`}</span>
                  </span>
                  <Badge tone={l.onHand - l.reserved <= 0 ? "red" : "amber"}>{l.onHand - l.reserved} left</Badge>
                </li>
              ))}
              {low.length === 0 && <li className="px-5 py-6 text-sm text-muted">Nothing is running low.</li>}
            </ul>
          </Panel>
          <Panel title="Best sellers, 30 days" pad={false}>
            <ul className="divide-y divide-line">
              {top.map((t) => (
                <li key={t.title} className="flex justify-between px-5 py-2.5 text-sm">
                  <span className="truncate">{t.title}</span>
                  <span className="text-muted">{t.units} sold · {money(t.cents)}</span>
                </li>
              ))}
              {top.length === 0 && <li className="px-5 py-6 text-sm text-muted">Sales will show here.</li>}
            </ul>
          </Panel>
        </div>
      </div>

      <Panel title="Integration health" className="mt-6" actions={<Link href="/admin/integrations" className="inline-flex items-center gap-1 text-xs font-bold text-iris-700">Details <ArrowRight size={12} /></Link>}>
        <dl className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
          <div><dt className="text-muted">Clover last sync</dt><dd className="font-semibold">{health.clover?.lastSyncAt ? dateET(health.clover.lastSyncAt, true) : "—"}</dd></div>
          <div><dt className="text-muted">Unmapped / to review</dt><dd className="font-semibold">{health.unmapped} / {health.pendingReview}</dd></div>
          <div><dt className="text-muted">Clover writes pending / failed</dt><dd className="font-semibold">{health.outboundPending} / <span className={health.outboundFailed ? "text-danger" : ""}>{health.outboundFailed}</span></dd></div>
          <div><dt className="text-muted">Webhook events pending / failed</dt><dd className="font-semibold">{health.eventsPending} / <span className={health.eventsFailed ? "text-danger" : ""}>{health.eventsFailed}</span></dd></div>
        </dl>
      </Panel>
    </>
  );
}
