import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound, permanentRedirect } from "next/navigation";
import { Listing, ListingSkeleton, parseListingParams } from "@/components/store/Listing";
import { PageHero } from "@/components/store/PageHero";
import { JsonLd } from "@/components/store/JsonLd";
import { getCategory } from "@/server/catalog";
import { breadcrumbJsonLd } from "@/lib/seo";

export async function generateMetadata({ params, searchParams }: PageProps<"/[category]">): Promise<Metadata> {
  const { category } = await params;
  const sp = await searchParams;
  const res = await getCategory(category);
  if (!res.category) return {};
  const c = res.category;
  const filtered = Object.keys(sp).some((k) => k !== "page");
  return {
    title: c.seoTitle || `${c.name} | Shop online or pick up in Garner, NC`,
    description:
      c.seoDescription ||
      c.description ||
      `Shop ${c.name.toLowerCase()} at Fine Looks Hair & Beauty. U.S. shipping and free in-store pickup in Garner, NC.`,
    alternates: { canonical: `/${c.slug}` },
    robots: c.noindex || filtered ? { index: false, follow: true } : undefined,
    openGraph: { title: c.name, url: `/${c.slug}`, images: c.imageUrl ? [c.imageUrl] : undefined },
  };
}

/** Blocking route: the category is resolved before streaming so 404s and 301s return real status codes. */
export const instant = false;

export default async function CategoryPage({ params, searchParams }: PageProps<"/[category]">) {
  const { category } = await params;
  const res = await getCategory(category);
  if (res.redirectTo) permanentRedirect(`/${res.redirectTo}`);
  if (!res.category) notFound();
  const c = res.category;
  return (
    <>
      <PageHero
        eyebrow="Shop by category"
        title={c.name}
        description={c.description}
        crumbs={[{ name: "Home", href: "/" }, { name: "Shop", href: "/shop" }, { name: c.name }]}
      />
      <Suspense fallback={<ListingSkeleton />}>
        <CategoryListing slug={c.slug} searchParams={searchParams} />
      </Suspense>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Shop", path: "/shop" },
          { name: c.name, path: `/${c.slug}` },
        ])}
      />
    </>
  );
}

async function CategoryListing({ slug, searchParams }: { slug: string; searchParams: PageProps<"/[category]">["searchParams"] }) {
  const listing = parseListingParams(await searchParams);
  return <Listing basePath={`/${slug}`} params={listing} categorySlug={slug} />;
}
