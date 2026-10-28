/**
 * Transactional email (section 3: order placed, payment outcome, dispatch /
 * ready-for-pickup, refund status) plus staff alerts. Provider-agnostic SMTP.
 * Without SMTP configured, emails are logged and skipped (dashboard shows it).
 */
import nodemailer, { type Transporter } from "nodemailer";
import { eq, inArray, isNull, and } from "drizzle-orm";
import { db } from "./db";
import { orderItems, orders, users } from "./db/schema";
import { env, isSmtpConfigured } from "./env";
import { getSettings } from "./settings";
import { money, dateET } from "@/lib/format";

let transport: Transporter | null = null;
function mailer() {
  if (!isSmtpConfigured()) return null;
  if (!transport) {
    const e = env();
    transport = nodemailer.createTransport({
      host: e.SMTP_HOST,
      port: e.SMTP_PORT,
      secure: e.SMTP_PORT === 465,
      auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASSWORD } : undefined,
    });
  }
  return transport;
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function layout(title: string, body: string, store: { name: string; phone: string; email: string; city: string; state: string }) {
  const base = env().APP_URL.replace(/\/$/, "");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(title)}</title></head>
<body style="margin:0;background:#f6f2fd;font-family:Arial,Helvetica,sans-serif;color:#1e1433">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:18px;overflow:hidden">
<tr><td style="background:#5238de;padding:28px 32px;text-align:left">
<img src="${base}/brand/icon-192.png" width="48" height="48" alt="" style="border-radius:50%;vertical-align:middle;background:#fff">
<span style="font-size:22px;font-weight:bold;color:#fff;vertical-align:middle;margin-left:10px">${esc(store.name)}</span>
</td></tr>
<tr><td style="padding:32px">${body}</td></tr>
<tr><td style="padding:24px 32px;background:#fbf9ff;font-size:12px;color:#6b6280;line-height:1.6">
${esc(store.name)} · ${esc(store.city)}, ${esc(store.state)} · ${esc(store.phone)} · <a href="mailto:${esc(store.email)}" style="color:#5238de">${esc(store.email)}</a><br>
This is a transactional email about your order.
</td></tr></table></td></tr></table></body></html>`;
}

async function orderBlock(orderId: string) {
  const order = await db().query.orders.findFirst({ where: eq(orders.id, orderId) });
  if (!order) throw new Error("order not found");
  const items = await db().select().from(orderItems).where(eq(orderItems.orderId, orderId));
  const rows = items
    .map(
      (i) => `<tr><td style="padding:8px 0;border-bottom:1px solid #eee">${esc(i.productTitle)}${
        i.variantLabel ? `<br><span style="color:#6b6280;font-size:12px">${esc(i.variantLabel)}</span>` : ""
      }</td><td style="padding:8px 0;border-bottom:1px solid #eee;text-align:center">${i.quantity}</td><td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right">${money(
        i.lineTotalCents,
      )}</td></tr>`,
    )
    .join("");
  const line = (label: string, v: number, bold = false) =>
    `<tr><td colspan="2" style="padding:4px 0;${bold ? "font-weight:bold" : "color:#4a4060"}">${label}</td><td style="padding:4px 0;text-align:right;${bold ? "font-weight:bold" : ""}">${money(v)}</td></tr>`;
  const html = `<table role="presentation" width="100%" style="font-size:14px;border-collapse:collapse">
<tr><th align="left" style="font-size:11px;color:#6b6280;text-transform:uppercase;padding-bottom:6px">Item</th><th style="font-size:11px;color:#6b6280">Qty</th><th align="right" style="font-size:11px;color:#6b6280">Total</th></tr>
${rows}
${line("Subtotal", order.subtotalCents)}
${order.discountCents ? line(`Discount${order.discountCode ? ` (${esc(order.discountCode)})` : ""}`, -order.discountCents) : ""}
${order.fulfillmentMethod === "ship" ? line(`Shipping${order.shippingLabel ? ` — ${esc(order.shippingLabel)}` : ""}`, order.shippingCents) : ""}
${line("Sales tax", order.taxCents)}
${line("Total", order.totalCents, true)}
</table>`;
  return { order, items, html };
}

export type EmailJob = { template: string; to: string; data: Record<string, unknown> };

export async function sendEmail(job: EmailJob) {
  const { store, commerce } = await getSettings(["store", "commerce"]);
  const base = env().APP_URL.replace(/\/$/, "");
  let subject = "";
  let body = "";
  let to = job.to;

  if (job.to === "__staff__") {
    const staff = await db()
      .select({ email: users.email })
      .from(users)
      .where(and(inArray(users.role, ["owner", "manager"]), isNull(users.disabledAt)));
    to = [...new Set([...(env().ALERT_EMAIL ? [env().ALERT_EMAIL!] : []), ...staff.map((s) => s.email)])].join(",");
    if (!to) return { skipped: "no staff recipients" };
  }

  switch (job.template) {
    case "order_confirmation": {
      const { order, html } = await orderBlock(String(job.data.orderId));
      subject = `Order ${order.number} confirmed`;
      body = `<h1 style="font-size:24px;margin:0 0 8px">Thank you${order.customerName ? `, ${esc(order.customerName.split(" ")[0])}` : ""}!</h1>
<p style="color:#4a4060;line-height:1.6">We've received your payment for order <strong>${esc(order.number)}</strong> placed ${dateET(order.paidAt ?? order.createdAt, true)}.
${
  order.fulfillmentMethod === "pickup"
    ? `We'll email you again when it's ready for pickup at our ${esc(store.city)} store. ${esc(commerce.pickupInstructions)}`
    : "We'll email you tracking details as soon as it ships."
}</p>${
        order.status === "exception"
          ? `<p style="background:#fff4e5;padding:12px;border-radius:10px;color:#a35a00">Our team is reviewing one detail on this order and will contact you shortly.</p>`
          : ""
      }${html}
<p style="margin-top:24px"><a href="${base}/track?order=${encodeURIComponent(order.number)}" style="background:#5238de;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:bold">Track your order</a></p>`;
      break;
    }
    case "order_shipped": {
      const { order, html } = await orderBlock(String(job.data.orderId));
      subject = `Order ${order.number} has shipped`;
      body = `<h1 style="font-size:24px;margin:0 0 8px">It's on the way!</h1>
<p style="color:#4a4060;line-height:1.6">Order <strong>${esc(order.number)}</strong> shipped${order.carrier ? ` with ${esc(order.carrier)}` : ""}.${
        order.trackingNumber ? ` Tracking number: <strong>${esc(order.trackingNumber)}</strong>.` : ""
      }</p>${html}`;
      break;
    }
    case "order_ready_for_pickup": {
      const { order, html } = await orderBlock(String(job.data.orderId));
      subject = `Order ${order.number} is ready for pickup`;
      body = `<h1 style="font-size:24px;margin:0 0 8px">Ready when you are</h1>
<p style="color:#4a4060;line-height:1.6">Order <strong>${esc(order.number)}</strong> is packed and waiting at our ${esc(store.city)} store${
        store.directionsNote ? ` (${esc(store.directionsNote)})` : ""
      }. ${esc(commerce.pickupInstructions)}</p>${html}`;
      break;
    }
    case "refund_issued": {
      const { order } = await orderBlock(String(job.data.orderId));
      subject = `Refund for order ${order.number}`;
      body = `<h1 style="font-size:24px;margin:0 0 8px">Your refund is on its way</h1>
<p style="color:#4a4060;line-height:1.6">We've refunded <strong>${money(Number(job.data.amountCents))}</strong> for order ${esc(order.number)} to your original payment method. Banks usually take 5–10 business days to show it.</p>`;
      break;
    }
    case "staff_new_order": {
      const { order, html } = await orderBlock(String(job.data.orderId));
      subject = `New ${order.fulfillmentMethod === "pickup" ? "pickup" : "shipping"} order ${order.number} — ${money(order.totalCents)}`;
      body = `<h1 style="font-size:22px;margin:0 0 8px">New order ${esc(order.number)}</h1>${
        order.status === "exception" ? `<p style="color:#b42318;font-weight:bold">Needs review: ${esc(order.exceptionReason)}</p>` : ""
      }${html}<p><a href="${base}/admin/orders/${order.id}" style="color:#5238de;font-weight:bold">Open in dashboard</a></p>`;
      break;
    }
    case "staff_alert": {
      subject = `[Fine Looks] ${String(job.data.severity).toUpperCase()}: ${String(job.data.message).slice(0, 80)}`;
      body = `<h1 style="font-size:20px">${esc(job.data.message)}</h1><p><a href="${base}/admin" style="color:#5238de">Open the dashboard</a></p>`;
      break;
    }
    case "staff_new_device": {
      subject = `[Fine Looks] New device signed in to the admin dashboard`;
      body = `<p>${esc(job.data.email)} signed in from a new device.</p><p>IP: ${esc(job.data.ip)}<br>Browser: ${esc(
        job.data.userAgent,
      )}<br>Time: ${dateET(new Date(), true)}</p><p>If this wasn't expected, disable the account in Staff and rotate passwords.</p>`;
      break;
    }
    case "staff_invite":
    case "password_reset": {
      const link = String(job.data.link);
      subject = job.template === "staff_invite" ? "You're invited to the Fine Looks dashboard" : "Reset your Fine Looks password";
      body = `<h1 style="font-size:22px">${job.template === "staff_invite" ? "Welcome to the team" : "Reset your password"}</h1>
<p style="color:#4a4060">Use the button below within ${job.template === "staff_invite" ? "72 hours" : "60 minutes"}. If you didn't expect this email, ignore it.</p>
<p><a href="${esc(link)}" style="background:#5238de;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:bold">${
        job.template === "staff_invite" ? "Set up my account" : "Choose a new password"
      }</a></p>`;
      break;
    }
    default:
      throw new Error(`Unknown email template ${job.template}`);
  }

  const m = mailer();
  if (!m) {
    console.log(`[email] SMTP not configured; would send "${subject}" to ${to}`);
    return { skipped: "smtp not configured" };
  }
  await m.sendMail({ from: env().EMAIL_FROM, to, subject, html: layout(subject, body, store) });
  return { sent: true };
}
