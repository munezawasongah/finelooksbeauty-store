import type { Metadata } from "next";
import { Suspense } from "react";
import { Listing, ListingSkeleton, parseListingParams } from "@/components/store/Listing";
import { PageHero } from "@/components/store/PageHero";

export const metadata: Metadata = {
  title: "Shop all hair & beauty",
  description:
    "Shop wigs, bundles, braiding hair, hair care, cosmetics and beauty tools from Fine Looks Hair & Beauty in Garner, NC.",
  alternates: { canonical: "/shop" },
};

export default function ShopPage({ searchParams }: PageProps<"/shop">) {
  return (
    <>
      <Suspense
        fallback={<PageHero eyebrow="The shop" title="Everything" accent="we carry." crumbs={[{ name: "Home", href: "/" }, { name: "Shop" }]} />}
      >
        <ShopHero searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<ListingSkeleton />}>
        <ShopListing searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function ShopHero({ searchParams }: { searchParams: PageProps<"/shop">["searchParams"] }) {
  const p = parseListingParams(await searchParams);
  return p.q ? (
    <PageHero
      eyebrow="Search"
      title="Results for"
      accent={`“${p.q}”`}
      crumbs={[{ name: "Home", href: "/" }, { name: "Shop", href: "/shop" }, { name: "Search" }]}
    />
  ) : (
    <PageHero
      eyebrow="The shop"
      title="Everything"
      accent="we carry."
      description="Wigs, bundles, braiding hair, hair care, cosmetics and tools. Stock shown is live from our store."
      crumbs={[{ name: "Home", href: "/" }, { name: "Shop" }]}
    />
  );
}

async function ShopListing({ searchParams }: { searchParams: PageProps<"/shop">["searchParams"] }) {
  const params = parseListingParams(await searchParams);
  return <Listing basePath="/shop" params={params} />;
}
