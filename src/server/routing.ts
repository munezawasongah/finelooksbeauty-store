/**
 * Resolves catalog URLs before rendering so search engines get real status codes:
 * 404 for unknown pages and 308 (permanent) redirects for renamed products and
 * categories (section 15.1). Used by src/proxy.ts. Results are cached briefly.
 */
import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { categories, products, slugRedirects } from "./db/schema";

export type Resolution = { kind: "ok" } | { kind: "redirect"; to: string } | { kind: "notfound" };

const cache = new Map<string, { at: number; r: Resolution }>();
const TTL = 30_000;

async function cached(key: string, fn: () => Promise<Resolution>) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.r;
  const r = await fn();
  if (cache.size > 5000) cache.clear();
  cache.set(key, { at: Date.now(), r });
  return r;
}

export function resolveCategory(slug: string) {
  return cached(`c:${slug}`, async () => {
    const c = await db().query.categories.findFirst({ where: eq(categories.slug, slug) });
    if (c?.active) return { kind: "ok" };
    if (!c) {
      const r = await db().query.slugRedirects.findFirst({ where: and(eq(slugRedirects.entity, "category"), eq(slugRedirects.fromSlug, slug)) });
      if (r) {
        const t = await db().query.categories.findFirst({ where: eq(categories.id, r.entityId) });
        if (t?.active) return { kind: "redirect", to: `/${t.slug}` };
      }
    }
    return { kind: "notfound" };
  });
}

export function resolveProduct(urlCategory: string | null, slug: string) {
  return cached(`p:${urlCategory}:${slug}`, async () => {
    let p = await db().query.products.findFirst({ where: eq(products.slug, slug) });
    if (!p) {
      const r = await db().query.slugRedirects.findFirst({ where: and(eq(slugRedirects.entity, "product"), eq(slugRedirects.fromSlug, slug)) });
      if (r) p = await db().query.products.findFirst({ where: eq(products.id, r.entityId) });
      if (!p) return { kind: "notfound" };
    }
    const cat = p.categoryId ? await db().query.categories.findFirst({ where: eq(categories.id, p.categoryId) }) : null;
    if (p.status === "draft") return { kind: "notfound" };
    if (p.status === "archived") return { kind: "redirect", to: cat?.active ? `/${cat.slug}` : "/shop" };
    const canonical = cat ? `/${cat.slug}/${p.slug}` : `/shop/${p.slug}`;
    const requested = urlCategory ? `/${urlCategory}/${slug}` : `/shop/${slug}`;
    return canonical === requested ? { kind: "ok" } : { kind: "redirect", to: canonical };
  });
}
