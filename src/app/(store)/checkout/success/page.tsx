import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { loadOrderForViewer } from "@/server/orders/access";
import { OrderDetail } from "@/components/store/OrderDetail";
import { AutoRefresh } from "@/components/store/AutoRefresh";

export const metadata: Metadata = { title: "Thank you", robots: { index: false } };

export default function SuccessPage({ searchParams }: PageProps<"/checkout/success">) {
  return (
    <div className="bg-cream">
      <div className="container-x pt-12 pb-24">
        <Suspense fallback={<div className="h-96 animate-pulse rounded-[var(--radius-card)] bg-white" />}>
          <Content searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/checkout/success">["searchParams"] }) {
  const sp = await searchParams;
  const number = typeof sp.order === "string" ? sp.order : "";
  const token = typeof sp.t === "string" ? sp.t : "";
  const data = number ? await loadOrderForViewer(number, token) : null;
  if (!data) notFound();
  const confirmed = data.order.paymentStatus === "paid";
  return (
    <>
      <div className="mb-10 max-w-2xl">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-iris-600 text-white">
          <CheckCircle2 size={28} aria-hidden />
        </span>
        <h1 className="mt-5 text-[2.6rem] leading-[1.02] font-light sm:text-6xl">
          Thank you{data.order.customerName ? `, ${data.order.customerName.split(" ")[0]}` : ""}
          <em className="accent">.</em>
        </h1>
        <p className="mt-4 text-lg text-ink-soft" aria-live="polite">
          {confirmed
            ? `Your payment is confirmed. We've emailed a receipt to ${data.order.email}.`
            : "We're confirming your payment with Stripe. This usually takes a few seconds — this page will update on its own."}
        </p>
        <p className="mt-2 text-sm text-muted">
          Bookmark this page to check your order any time.{" "}
          <Link href="/shop" className="font-bold text-iris-700">
            Continue shopping →
          </Link>
        </p>
      </div>
      {!confirmed && data.order.status === "pending_payment" && <AutoRefresh everyMs={3000} maxTries={40} />}
      <OrderDetail data={data} />
    </>
  );
}
