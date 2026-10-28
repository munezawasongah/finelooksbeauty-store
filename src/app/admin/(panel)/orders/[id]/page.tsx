import { Suspense } from "react";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { requireStaff } from "@/server/auth/session";
import { db } from "@/server/db";
import { orderEvents, orderItems, orders, payments, refunds, users } from "@/server/db/schema";
import { dateET, formatPhoneUS, money } from "@/lib/format";
import { can, type Role } from "@/server/auth/permissions";
import { NEXT_STATUSES } from "@/server/orders/lifecycle";
import { stripeMode } from "@/server/payments/stripe";
import { isStripeConfigured } from "@/server/env";
import { Badge, ORDER_STATUS, PAYMENT_STATUS, PageHeader, Panel } from "@/components/admin/ui";
import { NoteForm, RefundForm, StatusForm } from "./forms";

export const metadata = { title: "Order" };

export default function OrderDetailPage(props: PageProps<"/admin/orders/[id]">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-white" />}>
      <Content {...props} />
    </Suspense>
  );
}

async function Content({ params }: PageProps<"/admin/orders/[id]">) {
  const ctx = await requireStaff("orders.view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const order = await db().query.orders.findFirst({ where: eq(orders.id, id) });
  if (!order) notFound();
  const [items, events, pays, refs, staff] = await Promise.all([
    db().select().from(orderItems).where(eq(orderItems.orderId, id)),
    db().select().from(orderEvents).where(eq(orderEvents.orderId, id)).orderBy(asc(orderEvents.createdAt)),
    db().select().from(payments).where(eq(payments.orderId, id)),
    db().select().from(refunds).where(eq(refunds.orderId, id)).orderBy(asc(refunds.createdAt)),
    db().select({ id: users.id, name: users.name }).from(users),
  ]);
  const who = (uid: string | null) => (uid ? staff.find((s) => s.id === uid)?.name ?? "Staff" : "System");
  const role = ctx.user.role as Role;
  const next = NEXT_STATUSES[order.status] ?? [];
  const refundable = order.totalCents - order.refundedCents;
  const stripeLink =
    order.stripePaymentIntentId && isStripeConfigured()
      ? `https://dashboard.stripe.com/${stripeMode() === "test" ? "test/" : ""}payments/${order.stripePaymentIntentId}`
      : null;

  return (
    <>
      <PageHeader
        back={{ href: "/admin/orders", label: "Orders" }}
        title={order.number}
        description={`Placed ${dateET(order.createdAt, true)}${order.paidAt ? ` · Paid ${dateET(order.paidAt, true)}` : ""}`}
        actions={
          <>
            <Badge tone={ORDER_STATUS[order.status].tone}>{ORDER_STATUS[order.status].label}</Badge>
            <Badge tone={PAYMENT_STATUS[order.paymentStatus].tone}>{PAYMENT_STATUS[order.paymentStatus].label}</Badge>
          </>
        }
      />

      {order.exceptionReason && (
        <p className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-danger">{order.exceptionReason}</p>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <Panel title={`Items (${items.reduce((s, i) => s + i.quantity, 0)})`} pad={false}>
            <ul className="divide-y divide-line">
              {items.map((i) => (
                <li key={i.id} className="flex items-center gap-4 px-5 py-3 text-sm">
                  <span className="flex-1">
                    <span className="block font-semibold">{i.productTitle}</span>
                    <span className="text-xs text-muted">
                      SKU {i.sku}
                      {i.variantLabel ? ` · ${i.variantLabel}` : ""}
                      {i.restockedQuantity ? ` · ${i.restockedQuantity} restocked` : ""}
                    </span>
                  </span>
                  <span className="text-muted">
                    {i.quantity} × {money(i.unitPriceCents)}
                  </span>
                  <span className="w-20 text-right font-semibold">{money(i.lineTotalCents)}</span>
                </li>
              ))}
            </ul>
            <dl className="space-y-1.5 border-t border-line px-5 py-4 text-sm">
              <Row label="Subtotal" value={money(order.subtotalCents)} />
              {order.discountCents > 0 && <Row label={`Discount (${order.discountCode})`} value={`−${money(order.discountCents)}`} />}
              {order.fulfillmentMethod === "ship" && <Row label={`Shipping${order.shippingLabel ? ` — ${order.shippingLabel}` : ""}`} value={money(order.shippingCents)} />}
              <Row label="Sales tax" value={money(order.taxCents)} />
              <Row label="Total charged" value={money(order.totalCents)} bold />
              {order.refundedCents > 0 && <Row label="Refunded" value={`−${money(order.refundedCents)}`} />}
            </dl>
          </Panel>

          {can(role, "orders.fulfill") && next.length > 0 && (
            <Panel title="Fulfillment">
              <StatusForm orderId={order.id} options={next} method={order.fulfillmentMethod} carrier={order.carrier} tracking={order.trackingNumber} canCancel={can(role, "orders.cancel")} />
            </Panel>
          )}

          {can(role, "refunds.create") && order.stripePaymentIntentId && refundable > 0 && (
            <Panel title="Refund">
              <RefundForm
                orderId={order.id}
                refundable={refundable}
                items={items.map((i) => ({ id: i.id, title: i.productTitle, label: i.variantLabel, max: i.quantity - i.restockedQuantity }))}
              />
            </Panel>
          )}

          <Panel title="Timeline">
            <ol className="space-y-3 border-l-2 border-line pl-5">
              {events.map((e) => (
                <li key={e.id} className="relative text-sm">
                  <span className={`absolute -left-[1.6rem] top-1.5 h-2.5 w-2.5 rounded-full ${e.type === "note" ? "bg-orchid-400" : "bg-iris-500"}`} />
                  <p>
                    <span className="font-semibold">{e.note ?? e.type.replace(/_/g, " ")}</span>
                    {e.toStatus && e.type !== "note" && <span className="text-muted"> → {ORDER_STATUS[e.toStatus]?.label ?? e.toStatus}</span>}
                  </p>
                  <p className="text-xs text-muted">
                    {dateET(e.createdAt, true)} · {who(e.actorUserId)}
                  </p>
                </li>
              ))}
            </ol>
            <div className="mt-5">
              <NoteForm orderId={order.id} />
            </div>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Customer">
            <p className="font-semibold">{order.customerName ?? "—"}</p>
            {order.email && (
              <a className="block text-sm text-iris-700" href={`mailto:${order.email}`}>
                {order.email}
              </a>
            )}
            {order.phone && (
              <a className="block text-sm text-iris-700" href={`tel:+1${order.phone.replace(/\D/g, "")}`}>
                {formatPhoneUS(order.phone)}
              </a>
            )}
            <p className="mt-2 text-xs text-muted">
              {order.customerId ? "Has an account" : "Guest checkout"} · Marketing {order.marketingOptIn ? "opted in" : "not opted in"}
            </p>
          </Panel>
          <Panel title={order.fulfillmentMethod === "pickup" ? "In-store pickup" : "Ship to"}>
            {order.fulfillmentMethod === "pickup" ? (
              <p className="text-sm text-ink-soft">Customer collects at the Garner store. Check photo ID.</p>
            ) : order.shippingAddress ? (
              <address className="text-sm not-italic">
                {order.shippingAddress.name}
                <br />
                {order.shippingAddress.line1}
                {order.shippingAddress.line2 && <><br />{order.shippingAddress.line2}</>}
                <br />
                {order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.zip}
              </address>
            ) : (
              <p className="text-sm text-muted">Address arrives with payment confirmation.</p>
            )}
            {order.trackingNumber && (
              <p className="mt-3 text-sm">
                <span className="font-semibold">{order.carrier}</span> {order.trackingNumber}
              </p>
            )}
          </Panel>
          <Panel title="Payment">
            {pays.length === 0 ? (
              <p className="text-sm text-muted">No payment recorded yet.</p>
            ) : (
              pays.map((p) => (
                <p key={p.id} className="text-sm">
                  {money(p.amountCents)} · {p.status} · {p.paymentMethodType ?? "card"}
                  <span className="block text-xs text-muted">{dateET(p.createdAt, true)}</span>
                </p>
              ))
            )}
            {refs.length > 0 && (
              <ul className="mt-3 space-y-1.5 border-t border-line pt-3 text-sm">
                {refs.map((r) => (
                  <li key={r.id}>
                    Refund {money(r.amountCents)} · <Badge tone={r.status === "succeeded" ? "green" : r.status === "pending" ? "amber" : "red"}>{r.status}</Badge>
                    <span className="block text-xs text-muted">{r.reason} · {who(r.actorUserId)} · {dateET(r.createdAt, true)}</span>
                  </li>
                ))}
              </ul>
            )}
            {stripeLink && (
              <a href={stripeLink} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-xs font-bold text-iris-700">
                Open in Stripe →
              </a>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-bold" : ""}`}>
      <dt className={bold ? "" : "text-ink-soft"}>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
