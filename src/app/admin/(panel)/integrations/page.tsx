import Link from "next/link";
import { Suspense } from "react";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { requireStaff } from "@/server/auth/session";
import { db } from "@/server/db";
import { cloverItemMappings, integrationEvents, productVariants, products, reconciliationRuns } from "@/server/db/schema";
import { env, isCloverConfigured, isStripeConfigured, isSmtpConfigured, isS3Configured } from "@/server/env";
import { stripeMode } from "@/server/payments/stripe";
import { integrationHealth } from "@/server/reports";
import { dateET, money } from "@/lib/format";
import { Badge, Empty, PageHeader, Panel, Table, Td } from "@/components/admin/ui";
import { disconnectClover, retryEvents, unlink } from "./actions";
import { ActionButton, ApproveForm, CreateFromCloverButton } from "./forms";

export const metadata = { title: "Integrations" };

const MAP_TABS = [
  { key: "pending", label: "To review" },
  { key: "unmapped", label: "Not linked" },
  { key: "error", label: "Errors" },
  { key: "ok", label: "Linked" },
] as const;

export default function IntegrationsPage(props: PageProps<"/admin/integrations">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-white" />}>
      <Content {...props} />
    </Suspense>
  );
}

async function Content({ searchParams }: PageProps<"/admin/integrations">) {
  await requireStaff("integrations.manage");
  const sp = await searchParams;
  const tab = MAP_TABS.find((t) => t.key === sp.map)?.key ?? "pending";
  const base = env().APP_URL.replace(/\/$/, "");
  const [health, maps, runs, events] = await Promise.all([
    integrationHealth(),
    db()
      .select({ m: cloverItemMappings, sku: productVariants.sku, title: products.title })
      .from(cloverItemMappings)
      .leftJoin(productVariants, eq(productVariants.id, cloverItemMappings.variantId))
      .leftJoin(products, eq(products.id, productVariants.productId))
      .where(eq(cloverItemMappings.syncStatus, tab))
      .orderBy(cloverItemMappings.cloverName)
      .limit(200),
    db().select().from(reconciliationRuns).orderBy(desc(reconciliationRuns.startedAt)).limit(5),
    db()
      .select()
      .from(integrationEvents)
      .where(inArray(integrationEvents.status, ["failed", "pending", "processing"]))
      .orderBy(desc(integrationEvents.receivedAt))
      .limit(50),
  ]);
  const clover = health.clover;
  const counts = (await db()
    .select({ s: cloverItemMappings.syncStatus, n: sql<number>`count(*)::int` })
    .from(cloverItemMappings)
    .groupBy(cloverItemMappings.syncStatus)) as { s: string; n: number }[];

  return (
    <>
      <PageHeader title="Integrations" description="Stripe takes payments; Clover keeps in-store and online stock in step." />
      {sp.clover === "connected" && <p className="mb-4 rounded-xl bg-green-50 px-4 py-3 text-sm font-semibold text-success">Clover connected. Items are being imported for review below.</p>}
      {(sp.clover === "failed" || sp.clover === "invalid") && <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-danger">Clover connection didn&apos;t complete. Try again.</p>}

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Stripe payments">
          <dl className="space-y-2 text-sm">
            <Row label="Status">{isStripeConfigured() ? <Badge tone="green">configured · {stripeMode()} mode</Badge> : <Badge tone="amber">not configured</Badge>}</Row>
            <Row label="Webhook URL"><code className="break-all text-xs">{base}/api/webhooks/stripe</code></Row>
            <Row label="Events to send"><span className="text-xs">checkout.session.completed, checkout.session.async_payment_succeeded, checkout.session.async_payment_failed, checkout.session.expired, charge.refunded, refund.created, refund.updated, refund.failed, charge.dispute.created</span></Row>
            <Row label="Automatic tax">{env().STRIPE_AUTOMATIC_TAX === "true" ? "On (Stripe Tax)" : "Off"}</Row>
            <Row label="Last event">{health.lastStripeEventAt ? dateET(health.lastStripeEventAt, true) : "—"}</Row>
          </dl>
        </Panel>

        <Panel title="Clover POS">
          <dl className="space-y-2 text-sm">
            <Row label="App credentials">{isCloverConfigured() ? <Badge tone="green">set · {env().CLOVER_ENVIRONMENT}</Badge> : <Badge tone="amber">not set</Badge>}</Row>
            <Row label="Merchant">{clover ? <>{clover.merchantId} <Badge tone={clover.status === "connected" ? "green" : "red"}>{clover.status}</Badge></> : "Not connected"}</Row>
            {clover?.lastError && <Row label="Last error"><span className="text-danger">{clover.lastError}</span></Row>}
            <Row label="Webhook URL"><code className="break-all text-xs">{base}/api/webhooks/clover</code></Row>
            <Row label="Last reconcile">{clover?.lastReconcileAt ? dateET(clover.lastReconcileAt, true) : "—"}</Row>
            <Row label="Writes to Clover">{health.outboundPending} pending · <span className={health.outboundFailed ? "font-bold text-danger" : ""}>{health.outboundFailed} failed</span></Row>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            {isCloverConfigured() && (
              <a href="/admin/clover/connect" className="btn btn-primary btn-sm">{clover?.status === "connected" ? "Reconnect" : "Connect Clover"}</a>
            )}
            {clover?.status === "connected" && (
              <>
                <ActionButton kind="import" label="Import items" />
                <ActionButton kind="reconcile" label="Reconcile now" />
                {health.outboundFailed > 0 && <ActionButton kind="retry" label="Retry failed writes" />}
                <form action={disconnectClover}>
                  <input type="hidden" name="merchantId" value={clover.merchantId} />
                  <button className="btn btn-ghost btn-sm text-danger">Disconnect</button>
                </form>
              </>
            )}
          </div>
        </Panel>
      </div>

      <Panel title="Other services" className="mt-6">
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          <li>Email (SMTP): {isSmtpConfigured() ? <Badge tone="green">configured</Badge> : <Badge tone="amber">not configured — emails are logged only</Badge>}</li>
          <li>Image storage (S3): {isS3Configured() ? <Badge tone="green">configured</Badge> : <Badge tone="amber">not configured — required for uploads in production</Badge>}</li>
        </ul>
      </Panel>

      <Panel title="Clover item links" className="mt-6" pad={false}>
        <div className="no-scrollbar flex gap-1 overflow-x-auto border-b border-line p-3">
          {MAP_TABS.map((t) => (
            <Link key={t.key} href={`/admin/integrations?map=${t.key}`} className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold ${t.key === tab ? "bg-ink text-white" : "text-ink-soft hover:bg-mist"}`}>
              {t.label} ({counts.find((c) => c.s === t.key)?.n ?? 0})
            </Link>
          ))}
        </div>
        <Table head={["Clover item", "Clover SKU / code", "Price", "Clover stock", "Website SKU", ""]} empty={maps.length === 0 ? <Empty>Nothing in this list.</Empty> : null}>
          {maps.map(({ m, sku, title }) => (
            <tr key={m.id}>
              <Td>
                <span className="font-semibold">{m.cloverName}</span>
                {m.syncError && <span className="block text-xs text-danger">{m.syncError}</span>}
              </Td>
              <Td className="font-mono text-xs">{m.cloverSku ?? "—"} / {m.cloverCode ?? "—"}</Td>
              <Td>{m.cloverPriceCents != null ? money(m.cloverPriceCents) : "—"}</Td>
              <Td>{m.stockTracked ? m.cloverStock ?? "—" : <span className="text-xs text-muted">not tracked</span>}</Td>
              <Td>{sku ? <><span className="font-mono text-xs">{sku}</span><span className="block text-xs text-muted">{title}</span></> : "—"}</Td>
              <Td>
                {tab === "ok" ? (
                  <form action={unlink}>
                    <input type="hidden" name="mappingId" value={m.id} />
                    <button className="text-xs font-bold text-danger">Unlink</button>
                  </form>
                ) : (
                  <div className="flex flex-col gap-2">
                    <ApproveForm mappingId={m.id} suggestedSku={sku ?? ""} />
                    {!sku && <CreateFromCloverButton mappingId={m.id} />}
                  </div>
                )}
              </Td>
            </tr>
          ))}
        </Table>
        <p className="border-t border-line px-4 py-3 text-xs text-muted">
          Linking sets the website&apos;s on-hand count from Clover once (logged as an initial import). From then on, in-store sales update the website and online sales update Clover.
        </p>
      </Panel>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Recent reconciliations" pad={false}>
          <ul className="divide-y divide-line text-sm">
            {runs.map((r) => (
              <li key={r.id} className="px-5 py-3">
                <span className="font-semibold">{dateET(r.startedAt, true)}</span> · {r.triggeredBy} ·{" "}
                <Badge tone={r.status === "completed" ? "green" : r.status === "failed" ? "red" : "amber"}>{r.status}</Badge>
                <span className="block text-xs text-muted">
                  {r.checked} checked, {r.discrepancies.length} corrected{r.error ? ` · ${r.error}` : ""}
                </span>
                {r.discrepancies.length > 0 && (
                  <details className="mt-1 text-xs">
                    <summary className="cursor-pointer text-iris-700">Show differences</summary>
                    <ul className="mt-1 space-y-0.5">
                      {r.discrepancies.slice(0, 50).map((d, i) => (
                        <li key={i}>{d.sku ?? d.cloverItemId}: website {d.local ?? "—"} vs Clover {d.clover ?? "—"} — {d.action}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            ))}
            {runs.length === 0 && <li className="px-5 py-6 text-muted">No reconciliations yet. They run every 10 minutes once Clover is connected.</li>}
          </ul>
        </Panel>
        <Panel title="Webhook events needing attention" pad={false}>
          <form action={retryEvents}>
            <ul className="divide-y divide-line text-sm">
              {events.map((e) => (
                <li key={e.id} className="flex items-start gap-3 px-5 py-3">
                  <input type="checkbox" name="eventId" value={e.id} aria-label="Select event" className="mt-1 h-4 w-4 accent-iris-600" />
                  <span>
                    <span className="font-semibold">{e.provider}</span> · {e.eventType} · <Badge tone={e.status === "failed" ? "red" : "amber"}>{e.status}</Badge>
                    <span className="block text-xs text-muted">
                      {dateET(e.receivedAt, true)} · {e.attemptCount} attempts{e.errorSummary ? ` · ${e.errorSummary}` : ""}
                    </span>
                  </span>
                </li>
              ))}
              {events.length === 0 && <li className="px-5 py-6 text-muted">All events processed.</li>}
            </ul>
            {events.length > 0 && (
              <div className="border-t border-line p-3">
                <button className="btn btn-outline btn-sm">Retry selected</button>
              </div>
            )}
          </form>
        </Panel>
      </div>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] gap-2">
      <dt className="text-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
