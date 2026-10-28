import type { MetadataRoute } from "next";
import { sitemapEntries } from "@/server/catalog";
import { SITE_URL } from "@/lib/seo";
import { productHref } from "@/lib/urls";
import { db } from "@/server/db";
import { categories, products } from "@/server/db/schema";
import { and, eq } from "drizzle-orm";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { categories: cats } = await sitemapEntries();
  const prods = await db()
    .select({ slug: products.slug, updatedAt: products.updatedAt, cat: categories.slug })
    .from(products)
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .where(and(eq(products.status, "active"), eq(products.noindex, false)));
  const now = new Date();
  return [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/shop`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/visit`, changeFrequency: "monthly", priority: 0.7 },
    ...["privacy", "terms", "shipping", "returns"].map((p) => ({
      url: `${SITE_URL}/policies/${p}`,
      changeFrequency: "yearly" as const,
      priority: 0.2,
    })),
    { url: `${SITE_URL}/accessibility`, changeFrequency: "yearly", priority: 0.2 },
    ...cats.map((c) => ({ url: `${SITE_URL}/${c.slug}`, lastModified: c.updatedAt, changeFrequency: "daily" as const, priority: 0.8 })),
    ...prods.map((p) => ({
      url: `${SITE_URL}${productHref(p.cat, p.slug)}`,
      lastModified: p.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
