import { Suspense } from "react";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { ExternalLink } from "lucide-react";
import { requireStaff } from "@/server/auth/session";
import { can, type Role } from "@/server/auth/permissions";
import { db } from "@/server/db";
import { categories, cloverItemMappings, inventoryBalances, productImages, products, productVariants } from "@/server/db/schema";
import { availableToSell, defaultLocationId } from "@/server/inventory";
import { productHref } from "@/lib/urls";
import { Badge, PageHeader, Panel } from "@/components/admin/ui";
import { ProductForm } from "../ProductForm";
import { VariantsEditor } from "../VariantsEditor";
import { ImagesEditor } from "../ImagesEditor";

export const metadata = { title: "Edit product" };

export default function EditProductPage(props: PageProps<"/admin/products/[id]">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-white" />}>
      <Content {...props} />
    </Suspense>
  );
}

async function Content({ params, searchParams }: PageProps<"/admin/products/[id]">) {
  const ctx = await requireStaff("products.view");
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const product = await db().query.products.findFirst({ where: eq(products.id, id) });
  if (!product) notFound();
  const loc = await defaultLocationId();
  const [cats, imgs, vars, maps] = await Promise.all([
    db().select({ id: categories.id, name: categories.name, slug: categories.slug }).from(categories).orderBy(asc(categories.sortOrder)),
    db().select().from(productImages).where(eq(productImages.productId, id)).orderBy(asc(productImages.sortOrder)),
    db()
      .select({ v: productVariants, b: inventoryBalances })
      .from(productVariants)
      .leftJoin(inventoryBalances, and(eq(inventoryBalances.variantId, productVariants.id), eq(inventoryBalances.locationId, loc)))
      .where(eq(productVariants.productId, id))
      .orderBy(asc(productVariants.sortOrder), asc(productVariants.createdAt)),
    db().select().from(cloverItemMappings),
  ]);
  const role = ctx.user.role as Role;
  const editable = can(role, "products.edit");
  const cat = cats.find((c) => c.id === product.categoryId);

  return (
    <>
      <PageHeader
        back={{ href: "/admin/products", label: "Products" }}
        title={product.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={product.status === "active" ? "green" : product.status === "draft" ? "amber" : "neutral"}>{product.status}</Badge>
            {product.status === "active" && (
              <a href={productHref(cat?.slug, product.slug)} target="_blank" className="inline-flex items-center gap-1 text-iris-700">
                View on site <ExternalLink size={12} />
              </a>
            )}
          </span>
        }
      />
      {sp.created && <p className="mb-4 rounded-xl bg-green-50 px-4 py-3 text-sm font-semibold text-success">Product created. Add photos and more variants below.</p>}
      <div className="space-y-6">
        {editable && (
          <Panel title="Details">
            <ProductForm mode="edit" product={product} categories={cats} />
          </Panel>
        )}
        <Panel title="Photos">
          {editable ? (
            <ImagesEditor productId={id} title={product.title} images={imgs.map((i) => ({ id: i.id, url: i.url, alt: i.alt }))} />
          ) : (
            <p className="text-sm text-muted">{imgs.length} photos</p>
          )}
        </Panel>
        <Panel title="Variants, prices & stock">
          {editable ? (
            <VariantsEditor
              productId={id}
              optionNames={product.optionNames}
              canPrice={can(role, "prices.edit")}
              variants={vars.map(({ v, b }) => ({
                id: v.id,
                sku: v.sku,
                barcode: v.barcode,
                options: v.options,
                priceCents: v.priceCents,
                compareAtCents: v.compareAtCents,
                lowStockThreshold: v.lowStockThreshold,
                taxCode: v.taxCode,
                active: v.active,
                onHand: b?.onHand ?? 0,
                available: b ? availableToSell(b) : 0,
                clover: maps.find((m) => m.variantId === v.id)?.cloverName ?? null,
              }))}
            />
          ) : (
            <ul className="text-sm">
              {vars.map(({ v, b }) => (
                <li key={v.id}>{v.sku} · {b?.onHand ?? 0} on hand</li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
