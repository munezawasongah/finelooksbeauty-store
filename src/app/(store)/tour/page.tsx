import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { TourLoader } from "@/components/tour/TourLoader";

export const metadata: Metadata = {
  title: "Walk the store in 3D",
  description:
    "Take a 3D walk through Fine Looks Hair & Beauty in Garner, NC. Browse the wig wall, bundles, braiding hair, hair care, cosmetics and tools aisle by aisle.",
  alternates: { canonical: "/tour" },
};

export default function TourPage() {
  return (
    <>
      <h1 className="sr-only">Walk the Fine Looks store in 3D</h1>
      <section aria-label="3D store" className="h-[calc(100svh-6.8rem)] min-h-[32rem] lg:h-[calc(100svh-7.3rem)]">
        <TourLoader />
      </section>
      <section className="border-t border-line bg-cream">
        <div className="container-x flex flex-col items-start justify-between gap-4 py-8 sm:flex-row sm:items-center">
          <div>
            <p className="eyebrow">Prefer a list?</p>
            <p className="mt-1 font-display text-2xl text-ink">
              Every product is also in the <em className="accent">online shop.</em>
            </p>
          </div>
          <Link href="/shop" className="btn btn-primary">
            Shop all products <ArrowRight size={16} aria-hidden />
          </Link>
        </div>
      </section>
    </>
  );
}
