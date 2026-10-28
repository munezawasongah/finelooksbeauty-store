import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHero } from "@/components/store/PageHero";
import { TrackForm } from "./TrackForm";

export const metadata: Metadata = {
  title: "Track your order",
  description: "Check the status of your Fine Looks Hair & Beauty order.",
};

export default function TrackPage({ searchParams }: PageProps<"/track">) {
  return (
    <>
      <PageHero eyebrow="Order status" title="Track your" accent="order." description="Enter your order number and the email you used at checkout." />
      <div className="container-x pb-24">
        <div className="card max-w-xl p-6 sm:p-8">
          <Suspense fallback={<TrackForm defaultOrder="" />}>
            <Prefilled searchParams={searchParams} />
          </Suspense>
        </div>
      </div>
    </>
  );
}

async function Prefilled({ searchParams }: { searchParams: PageProps<"/track">["searchParams"] }) {
  const sp = await searchParams;
  return <TrackForm defaultOrder={typeof sp.order === "string" ? sp.order : ""} />;
}
