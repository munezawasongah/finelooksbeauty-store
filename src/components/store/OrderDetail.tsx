import { CheckCircle2, Clock, MapPin, Package, Truck, XCircle, AlertTriangle } from "lucide-react";
import { dateET, money } from "@/lib/format";
import { ProductArt } from "./ProductArt";
import type { loadOrderForViewer } from "@/server/orders/access";

type Data = NonNullable<Awaited<ReturnType<typeof loadOrderForViewer>>>;

const STATUS: Record<string, { label: string; tone: string; icon: React.ReactNode }> = {
  pending_payment: { label: "Awaiting payment", tone: "bg-mist text-iris-800", icon: <Clock size={16} aria-hidden /> },
  paid: { label: "Order confirmed", tone: "bg-iris-50 text-iris-800", icon: <CheckCircle2 size={16} aria-hidden /> },
  processing: { label: "Being prepared", tone: "bg-iris-50 text-iris-800", icon: <Package size={16} aria-hidden /> },
  ready_for_pickup: { label: "Ready for pickup", tone: "bg-green-50 text-success", icon: <MapPin size={16} aria-hidden /> },
  shipped: { label: "Shipped", tone: "bg-green-50 text-success", icon: <Truck size={16} aria-hidden /> },
  delivered: { label: "Completed", tone: "bg-green-50 text-success", icon: <CheckCircle2 size={16} aria-hidden /> },
  cancelled: { label: "Cancelled", tone: "bg-red-50 text-danger", icon: <XCircle size={16} aria-hidden /> },
  exception: { label: "Being reviewed", tone: "bg-amber-50 text-warning", icon: <AlertTriangle size={16} aria-hidden /> },
};

export function OrderDetail({ data }: { data: Data }) {
  const { order, items, events } = data;
  const s = STATUS[order.status] ?? STATUS.paid;
  const steps =
    order.fulfillmentMethod === "pickup"
      ? [
          { key: "paid", label: "Confirmed" },
          { key: "processing", label: "Preparing" },
          { key: "ready_for_pickup", label: "Ready for pickup" },
          { key: "delivered", label: "Picked up" },
        ]
      : [
          { key: "paid", label: "Confirmed" },
          { key: "processing", label: "Preparing" },
          { key: "shipped", label: "Shipped" },
          { key: "delivered", label: "Delivered" },
        ];
  const order_ = ["pending_payment", "paid", "processing", "ready_for_pickup", "shipped", "delivered"];
  const reached = (k: string) => order_.indexOf(order.status) >= order_.indexOf(k) && !["cancelled", "exception"].includes(order.status);

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-6">
        <div className="card p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold tracking-[0.14em] text-muted uppercase">Order</p>
              <p className="font-display text-3xl">{order.number}</p>
              <p className="text-sm text-muted">Placed {dateET(order.createdAt, true)}</p>
            </div>
            <span className={`chip ${s.tone} !text-xs normal-case`}>
              {s.icon} {s.label}
            </span>
          </div>
          {!["cancelled", "exception", "pending_payment"].includes(order.status) && (
            <ol className="mt-8 grid grid-cols-4 gap-2" aria-label="Order progress">
              {steps.map((st) => (
                <li key={st.key} className="text-center">
                  <span className={`mx-auto block h-1.5 rounded-full ${reached(st.key) ? "bg-iris-600" : "bg-line"}`} />
                  <span className={`mt-2 block text-[0.7rem] font-semibold ${reached(st.key) ? "text-ink" : "text-muted"}`}>
                    {st.label}
                  </span>
                </li>
              ))}
            </ol>
          )}
          {order.status === "exception" && (
            <p className="mt-6 rounded-2xl bg-amber-50 p-4 text-sm text-warning">
              Our team is reviewing one detail on this order and will contact you shortly.
            </p>
          )}
          {order.trackingNumber && (
            <p className="mt-6 text-sm">
              <span className="font-bold">{order.carrier ?? "Tracking"}:</span> {order.trackingNumber}
            </p>
          )}
        </div>

        <div className="card p-6 sm:p-8">
          <h2 className="font-display text-2xl">Items</h2>
          <ul className="mt-4 divide-y divide-line">
            {items.map((i) => (
              <li key={i.id} className="flex gap-4 py-4">
                <div className="relative h-20 w-16 shrink-0 overflow-hidden rounded-xl bg-mist">
                  <ProductArt src={i.imageUrl} alt={i.productTitle} title={i.productTitle} sizes="64px" />
                </div>
                <div className="flex-1 text-sm">
                  <p className="font-semibold">{i.productTitle}</p>
                  {i.variantLabel && <p className="text-muted">{i.variantLabel}</p>}
                  <p className="text-muted">Qty {i.quantity}</p>
                </div>
                <p className="text-sm font-semibold">{money(i.lineTotalCents)}</p>
              </li>
            ))}
          </ul>
        </div>

        {events.length > 0 && (
          <div className="card p-6 sm:p-8">
            <h2 className="font-display text-2xl">History</h2>
            <ol className="mt-4 space-y-3 border-l-2 border-line pl-5">
              {events.map((e) => (
                <li key={e.id} className="relative text-sm">
                  <span className="absolute -left-[1.6rem] top-1.5 h-2.5 w-2.5 rounded-full bg-iris-500" />
                  <p className="font-semibold">{e.note ?? e.type.replace(/_/g, " ")}</p>
                  <p className="text-xs text-muted">{dateET(e.createdAt, true)}</p>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>

      <aside className="space-y-6">
        <div className="card p-6">
          <h2 className="font-display text-xl">Summary</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <Row label="Subtotal" value={money(order.subtotalCents)} />
            {order.discountCents > 0 && <Row label={`Discount${order.discountCode ? ` (${order.discountCode})` : ""}`} value={`−${money(order.discountCents)}`} />}
            {order.fulfillmentMethod === "ship" && <Row label="Shipping" value={money(order.shippingCents)} />}
            <Row label="Sales tax" value={money(order.taxCents)} />
            <div className="flex justify-between border-t border-line pt-3 text-base font-bold">
              <dt>Total</dt>
              <dd>{money(order.totalCents)}</dd>
            </div>
            {order.refundedCents > 0 && <Row label="Refunded" value={`−${money(order.refundedCents)}`} />}
          </dl>
        </div>
        <div className="card p-6 text-sm">
          <h2 className="font-display text-xl">{order.fulfillmentMethod === "pickup" ? "Pickup" : "Shipping to"}</h2>
          {order.fulfillmentMethod === "pickup" ? (
            <p className="mt-3 text-ink-soft">In-store pickup, Garner, NC. We&apos;ll email you when it&apos;s ready.</p>
          ) : order.shippingAddress ? (
            <address className="mt-3 not-italic text-ink-soft">
              {order.shippingAddress.name}
              <br />
              {order.shippingAddress.line1}
              {order.shippingAddress.line2 && (
                <>
                  <br />
                  {order.shippingAddress.line2}
                </>
              )}
              <br />
              {order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.zip}
              {order.shippingLabel && <span className="mt-2 block text-xs text-muted">{order.shippingLabel}</span>}
            </address>
          ) : (
            <p className="mt-3 text-muted">Address confirmed at payment.</p>
          )}
        </div>
      </aside>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-ink-soft">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
