import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { MapPin, RotateCcw, ShieldCheck, Truck } from "lucide-react";
import { getProduct, relatedProducts } from "@/server/catalog";
import { getSettings } from "@/server/settings";
import { productHref } from "@/lib/urls";
import { abs, breadcrumbJsonLd } from "@/lib/seo";
import { Breadcrumbs } from "./PageHero";
import { JsonLd } from "./JsonLd";
import { ProductCard } from "./ProductCard";
import { Gallery } from "./Gallery";
import { VariantPicker } from "./VariantPicker";

export async function loadProductOrRedirect(slug: string, urlCategory: string | null) {
  const res = await getProduct(slug);
  if (!res) notFound();
  if (res.kind === "redirect") {
    const target = await getProduct(res.to);
    const cat = target?.kind === "ok" ? (target.category?.slug ?? null) : null;
    permanentRedirect(productHref(cat, res.to));
  }
  if (res.kind === "archived") {
    permanentRedirect(res.categorySlug ? `/${res.categorySlug}` : "/shop");
  }
  const canonicalCat = res.category?.slug ?? null;
  if (canonicalCat !== urlCategory) permanentRedirect(productHref(canonicalCat, slug));
  return res;
}

export async function ProductView({ slug, urlCategory }: { slug: string; urlCategory: string | null }) {
  const data = await loadProductOrRedirect(slug, urlCategory);
  const { product, category, images, variants } = data;
  const [{ store, commerce }, related] = await Promise.all([
    getSettings(["store", "commerce"]),
    relatedProducts(product.id, product.categoryId),
  ]);
  const url = productHref(category?.slug ?? null, product.slug);
  const prices = variants.map((v) => v.priceCents);
  const anyAvailable = variants.some((v) => v.available > 0);

  const productLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    description: product.description,
    sku: variants[0]?.sku,
    ...(product.brand ? { brand: { "@type": "Brand", name: product.brand } } : {}),
    ...(images.length ? { image: images.map((i) => abs(i.url)) } : {}),
    category: category?.name,
    offers:
      variants.length === 1
        ? {
            "@type": "Offer",
            url: abs(url),
            priceCurrency: "USD",
            price: (variants[0].priceCents / 100).toFixed(2),
            availability: variants[0].available > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
            itemCondition: "https://schema.org/NewCondition",
            seller: { "@type": "Organization", name: store.name },
          }
        : {
            "@type": "AggregateOffer",
            url: abs(url),
            priceCurrency: "USD",
            lowPrice: (Math.min(...prices) / 100).toFixed(2),
            highPrice: (Math.max(...prices) / 100).toFixed(2),
            offerCount: variants.length,
            availability: anyAvailable ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
          },
  };

  return (
    <>
      <div className="container-x pt-6 pb-20 sm:pt-8">
        <Breadcrumbs
          items={[
            { name: "Home", href: "/" },
            category ? { name: category.name, href: `/${category.slug}` } : { name: "Shop", href: "/shop" },
            { name: product.title },
          ]}
        />
        <div className="mt-6 grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
          <Gallery images={images.map((i) => ({ url: i.url, alt: i.alt }))} title={product.title} />
          <div className="lg:sticky lg:top-28 lg:self-start">
            {product.brand && (
              <p className="text-xs font-bold tracking-[0.16em] text-iris-600 uppercase">{product.brand}</p>
            )}
            <h1 className="mt-2 text-[2.3rem] leading-[1.05] font-light sm:text-5xl">{product.title}</h1>

            <VariantPicker
              optionNames={product.optionNames}
              variants={variants}
              maxQtyPerLine={commerce.maxQtyPerLine}
            />

            <ul className="mt-8 grid gap-3 rounded-[var(--radius-card)] border border-line bg-cream p-5 text-sm">
              <li className="flex items-start gap-3">
                <Truck size={18} className="mt-0.5 shrink-0 text-iris-600" aria-hidden />
                <span>
                  <strong className="font-bold">Ships anywhere in the U.S.</strong>{" "}
                  <Link href="/policies/shipping" className="text-iris-700 underline underline-offset-2">
                    Rates &amp; delivery times
                  </Link>
                </span>
              </li>
              {commerce.pickupEnabled && (
                <li className="flex items-start gap-3">
                  <MapPin size={18} className="mt-0.5 shrink-0 text-iris-600" aria-hidden />
                  <span>
                    <strong className="font-bold">Free pickup in {store.city}</strong> — choose pickup at checkout.
                  </span>
                </li>
              )}
              <li className="flex items-start gap-3">
                <RotateCcw size={18} className="mt-0.5 shrink-0 text-iris-600" aria-hidden />
                <span>
                  Unopened items can be returned within {commerce.returnsWindowDays} days.{" "}
                  <Link href="/policies/returns" className="text-iris-700 underline underline-offset-2">
                    Returns policy
                  </Link>
                </span>
              </li>
              <li className="flex items-start gap-3">
                <ShieldCheck size={18} className="mt-0.5 shrink-0 text-iris-600" aria-hidden />
                <span>Secure checkout by Stripe. We never see or store your card number.</span>
              </li>
            </ul>

            {product.description && (
              <div className="mt-8">
                <h2 className="font-sans text-xs font-bold tracking-[0.16em] uppercase">Details</h2>
                <div className="prose-store mt-3">
                  {product.description.split(/\n{2,}/).map((para, i) => (
                    <p key={i}>{para}</p>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <section aria-labelledby="related-heading" className="bg-cream py-16 sm:py-20">
          <div className="container-x">
            <h2 id="related-heading" className="mb-10 text-[2rem] font-light sm:text-4xl">
              You may also <em className="accent">love</em>
            </h2>
            <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-4 lg:gap-x-6">
              {related.map((p) => (
                <ProductCard key={p.id} p={p} />
              ))}
            </div>
          </div>
        </section>
      )}

      <JsonLd data={productLd} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          ...(category ? [{ name: category.name, path: `/${category.slug}` }] : [{ name: "Shop", path: "/shop" }]),
          { name: product.title, path: url },
        ])}
      />
    </>
  );
}

export async function productMetadata(slug: string) {
  const res = await getProduct(slug);
  if (!res || res.kind !== "ok") return {};
  const { product, category, images, variants } = res;
  const url = productHref(category?.slug ?? null, product.slug);
  const price = variants.length ? Math.min(...variants.map((v) => v.priceCents)) : 0;
  const description =
    product.seoDescription ||
    `${product.description.slice(0, 140).trim()}${product.description.length > 140 ? "…" : ""} From $${(price / 100).toFixed(2)}.`;
  return {
    title: product.seoTitle || product.title,
    description,
    alternates: { canonical: product.canonicalOverride || url },
    robots: product.noindex ? { index: false, follow: true } : undefined,
    openGraph: {
      type: "website" as const,
      title: product.title,
      description,
      url,
      images: images.length ? [{ url: images[0].url, alt: images[0].alt }] : [{ url: "/brand/icon-512.png" }],
    },
    other: {
      "product:price:amount": (price / 100).toFixed(2),
      "product:price:currency": "USD",
    },
  };
}
