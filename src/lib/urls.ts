export function productHref(categorySlug: string | null | undefined, productSlug: string) {
  return categorySlug ? `/${categorySlug}/${productSlug}` : `/shop/${productSlug}`;
}

export function categoryHref(slug: string) {
  return `/${slug}`;
}

/** Top-level paths that can never be category slugs. */
export const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "shop",
  "search",
  "cart",
  "checkout",
  "account",
  "orders",
  "track",
  "visit",
  "policies",
  "accessibility",
  "media",
  "brand",
  "sitemap.xml",
  "robots.txt",
  "manifest.webmanifest",
  "icon.png",
  "apple-icon.png",
  "opengraph-image",
]);
