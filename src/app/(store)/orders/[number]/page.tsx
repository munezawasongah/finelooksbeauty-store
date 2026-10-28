import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { loadOrderForViewer } from "@/server/orders/access";
import { OrderDetail } from "@/components/store/OrderDetail";

export const metadata: Metadata = { title: "Your order", robots: { index: false } };

export default function OrderPage(props: PageProps<"/orders/[number]">) {
  return (
    <div className="bg-cream">
      <div className="container-x pt-12 pb-24">
        <Suspense fallback={<div className="h-96 animate-pulse rounded-[var(--radius-card)] bg-white" />}>
          <Content {...props} />
        </Suspense>
      </div>
    </div>
  );
}

async function Content({ params, searchParams }: PageProps<"/orders/[number]">) {
  const { number } = await params;
  const sp = await searchParams;
  const data = await loadOrderForViewer(decodeURIComponent(number), typeof sp.t === "string" ? sp.t : null);
  if (!data) redirect(`/track?order=${encodeURIComponent(number)}`);
  return (
    <>
      <h1 className="mb-8 text-[2.4rem] leading-none font-light sm:text-5xl">
        Your <em className="accent">order.</em>
      </h1>
      <OrderDetail data={data} />
    </>
  );
}
