/**
 * Storefront catalog reads. Every function calls connection() first, so pages
 * render at request time with live stock and the build never needs the database.
 */
import { connection } from "next/server";
import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { db } from "./db";
import {
  categories,
  inventoryBalances,
  productImages,
  products,
  productVariants,
  slugRedirects,
} from "./db/schema";
import { availableToSell, defaultLocationId } from "./inventory";

export type ProductCard = {
  id: string;
  slug: string;
  title: string;
  brand: string | null;
  badge: string | null;
  categorySlug: string | null;
  categoryName: string | null;
  minPriceCents: number;
  maxPriceCents: number;
  compareAtCents: number | null;
  imageUrl: string | null;
  imageAlt: string | null;
  available: number;
  variantCount: number;
};

export type SortKey = "featured" | "newest" | "price-asc" | "price-desc" | "name";

export const SORTS: { key: SortKey; label: string }[] = [
  { key: "featured", label: "Featured" },
  { key: "newest", label: "Newest" },
  { key: "price-asc", label: "Price: low to high" },
  { key: "price-desc", label: "Price: high to low" },
  { key: "name", label: "Name: A–Z" },
];

export async function listCategories() {
  await connection();
  const rows = await db()
    .select({
      id: categories.id,
      slug: categories.slug,
      name: categories.name,
      description: categories.description,
      imageUrl: categories.imageUrl,
      parentId: categories.parentId,
      productCount: sql<number>`(select count(*)::int from ${products} p where p.category_id = ${categories.id} and p.status = 'active')`,
    })
    .from(categories)
    .where(eq(categories.active, true))
    .orderBy(asc(categories.sortOrder), asc(categories.name));
  return rows;
}

export async function getCategory(slug: string) {
  await connection();
  const cat = await db().query.categories.findFirst({ where: and(eq(categories.slug, slug), eq(categories.active, true)) });
  if (cat) return { category: cat, redirectTo: null };
  const redirect = await db().query.slugRedirects.findFirst({
    where: and(eq(slugRedirects.entity, "category"), eq(slugRedirects.fromSlug, slug)),
  });
  if (redirect) {
    const target = await db().query.categories.findFirst({ where: eq(categories.id, redirect.entityId) });
    if (target) return { category: null, redirectTo: target.slug };
  }
  return { category: null, redirectTo: null };
}

export type SearchInput = {
  q?: string;
  category?: string;
  brand?: string;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  sort?: SortKey;
  page?: number;
  pageSize?: number;
  featuredOnly?: boolean;
  badge?: string;
};

export async function searchProducts(input: SearchInput) {
  await connection();
  const loc = await defaultLocationId();
  const pageSize = Math.min(Math.max(input.pageSize ?? 24, 1), 60);
  const page = Math.max(input.page ?? 1, 1);

  const where: SQL[] = [eq(products.status, "active")];
  const q = input.q?.trim().slice(0, 100);
  if (q) {
    where.push(sql`(
      ${products}.search_tsv @@ websearch_to_tsquery('english', ${q})
      or ${products.title} ilike ${"%" + q + "%"}
      or exists (select 1 from ${productVariants} sv where sv.product_id = ${products.id}
                 and (upper(sv.sku) = upper(${q}) or sv.barcode = ${q}))
    )`);
  }
  if (input.category) {
    where.push(sql`${products.categoryId} in (
      select c.id from ${categories} c
      where c.slug = ${input.category}
         or c.parent_id = (select id from ${categories} where slug = ${input.category})
    )`);
  }
  if (input.brand) where.push(eq(products.brand, input.brand));
  if (input.featuredOnly) where.push(eq(products.featured, true));
  if (input.badge) where.push(sql`${products.badge} = ${input.badge}`);

  const priceAgg = sql<number>`(select min(v.price_cents) from ${productVariants} v where v.product_id = ${products.id} and v.active)`;
  const maxPriceAgg = sql<number>`(select max(v.price_cents) from ${productVariants} v where v.product_id = ${products.id} and v.active)`;
  const compareAgg = sql<number | null>`(select max(v.compare_at_cents) from ${productVariants} v where v.product_id = ${products.id} and v.active)`;
  const availAgg = sql<number>`coalesce((
      select sum(case when b.checkout_paused then 0 else greatest(b.on_hand - b.reserved - b.safety_stock, 0) end)
      from ${inventoryBalances} b join ${productVariants} v on v.id = b.variant_id
      where v.product_id = ${products.id} and v.active and b.location_id = ${loc}
    ), 0)::int`;

  if (input.minPrice != null) where.push(sql`${maxPriceAgg} >= ${Math.round(input.minPrice * 100)}`);
  if (input.maxPrice != null) where.push(sql`${priceAgg} <= ${Math.round(input.maxPrice * 100)}`);
  if (input.inStock) where.push(sql`${availAgg} > 0`);
  where.push(sql`exists (select 1 from ${productVariants} v where v.product_id = ${products.id} and v.active)`);

  const order: SQL[] = (() => {
    switch (input.sort) {
      case "newest":
        return [desc(products.createdAt)];
      case "price-asc":
        return [sql`${priceAgg} asc`];
      case "price-desc":
        return [sql`${priceAgg} desc`];
      case "name":
        return [asc(products.title)];
      default:
        return q
          ? [sql`ts_rank(${products}.search_tsv, websearch_to_tsquery('english', ${q})) desc`, desc(products.featured)]
          : [desc(products.featured), sql`${availAgg} > 0 desc`, desc(products.createdAt)];
    }
  })();

  const whereSql = and(...where);
  const [rows, [{ total }]] = await Promise.all([
    db()
      .select({
        id: products.id,
        slug: products.slug,
        title: products.title,
        brand: products.brand,
        badge: products.badge,
        categorySlug: categories.slug,
        categoryName: categories.name,
        minPriceCents: priceAgg,
        maxPriceCents: maxPriceAgg,
        compareAtCents: compareAgg,
        imageUrl: sql<string | null>`(select i.url from ${productImages} i where i.product_id = ${products.id} order by i.sort_order, i.created_at limit 1)`,
        imageAlt: sql<string | null>`(select i.alt from ${productImages} i where i.product_id = ${products.id} order by i.sort_order, i.created_at limit 1)`,
        available: availAgg,
        variantCount: sql<number>`(select count(*)::int from ${productVariants} v where v.product_id = ${products.id} and v.active)`,
      })
      .from(products)
      .leftJoin(categories, eq(categories.id, products.categoryId))
      .where(whereSql)
      .orderBy(...order, asc(products.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db().select({ total: sql<number>`count(*)::int` }).from(products).where(whereSql),
  ]);

  return { items: rows as ProductCard[], total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function listBrands(categorySlug?: string) {
  await connection();
  const rows = await db()
    .selectDistinct({ brand: products.brand })
    .from(products)
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .where(
      and(
        eq(products.status, "active"),
        sql`${products.brand} is not null and ${products.brand} <> ''`,
        categorySlug ? eq(categories.slug, categorySlug) : undefined,
      ),
    )
    .orderBy(asc(products.brand));
  return rows.map((r) => r.brand!) as string[];
}

export async function getProduct(slug: string) {
  await connection();
  const product = await db().query.products.findFirst({ where: eq(products.slug, slug) });
  if (!product) {
    const r = await db().query.slugRedirects.findFirst({
      where: and(eq(slugRedirects.entity, "product"), eq(slugRedirects.fromSlug, slug)),
    });
    if (r) {
      const target = await db().query.products.findFirst({ where: eq(products.id, r.entityId) });
      if (target) return { kind: "redirect" as const, to: target.slug };
    }
    return null;
  }
  if (product.status === "draft") return null;
  if (product.status === "archived") {
    // Permanently removed products redirect to their category (section 15.1).
    const cat = product.categoryId
      ? await db().query.categories.findFirst({ where: eq(categories.id, product.categoryId) })
      : null;
    return { kind: "archived" as const, categorySlug: cat?.slug ?? "" };
  }

  const loc = await defaultLocationId();
  const [variants, images, category] = await Promise.all([
    db()
      .select({ v: productVariants, b: inventoryBalances })
      .from(productVariants)
      .leftJoin(
        inventoryBalances,
        and(eq(inventoryBalances.variantId, productVariants.id), eq(inventoryBalances.locationId, loc)),
      )
      .where(and(eq(productVariants.productId, product.id), eq(productVariants.active, true)))
      .orderBy(asc(productVariants.sortOrder), asc(productVariants.priceCents)),
    db().select().from(productImages).where(eq(productImages.productId, product.id)).orderBy(asc(productImages.sortOrder)),
    product.categoryId ? db().query.categories.findFirst({ where: eq(categories.id, product.categoryId) }) : null,
  ]);
  return {
    kind: "ok" as const,
    product,
    category: category ?? null,
    images,
    variants: variants.map(({ v, b }) => ({
      id: v.id,
      sku: v.sku,
      options: v.options,
      priceCents: v.priceCents,
      compareAtCents: v.compareAtCents,
      available: b ? availableToSell(b) : 0,
      lowStockThreshold: v.lowStockThreshold,
    })),
  };
}

export async function relatedProducts(productId: string, categoryId: string | null, limit = 4) {
  await connection();
  if (!categoryId) return [];
  const cat = await db().query.categories.findFirst({ where: eq(categories.id, categoryId) });
  if (!cat) return [];
  const res = await searchProducts({ category: cat.slug, pageSize: limit + 1 });
  return res.items.filter((p) => p.id !== productId).slice(0, limit);
}

export async function catalogStats() {
  await connection();
  const [row] = await db()
    .select({
      products: sql<number>`(select count(*)::int from ${products} where status = 'active')`,
      categories: sql<number>`(select count(*)::int from ${categories} where active)`,
      brands: sql<number>`(select count(distinct brand)::int from ${products} where status = 'active' and brand is not null)`,
    })
    .from(sql`(select 1) x`);
  return row;
}

export async function sitemapEntries() {
  await connection();
  const [ps, cs] = await Promise.all([
    db()
      .select({ slug: products.slug, updatedAt: products.updatedAt })
      .from(products)
      .where(and(eq(products.status, "active"), eq(products.noindex, false))),
    db()
      .select({ slug: categories.slug, updatedAt: categories.updatedAt })
      .from(categories)
      .where(and(eq(categories.active, true), eq(categories.noindex, false))),
  ]);
  return { products: ps, categories: cs };
}

export async function productsByIds(ids: string[]) {
  if (!ids.length) return [];
  return db().select().from(products).where(inArray(products.id, ids));
}
