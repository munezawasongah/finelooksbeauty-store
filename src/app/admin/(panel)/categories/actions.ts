"use server";

import { refresh } from "next/cache";
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { assertStaff } from "@/server/auth/session";
import { db } from "@/server/db";
import { categories, products, slugRedirects } from "@/server/db/schema";
import { audit } from "@/server/audit";
import { slugify } from "@/lib/format";
import { RESERVED_SLUGS } from "@/lib/urls";
import { storeImage, UploadError } from "@/server/storage";

export type CatState = { ok: boolean; message: string } | null;

const schema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  name: z.string().trim().min(2).max(60),
  slug: z.string().trim().max(60).optional(),
  description: z.string().max(500).optional(),
  parentId: z.string().uuid().optional().or(z.literal("")),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  active: z.literal("on").optional(),
  seoTitle: z.string().max(70).optional(),
  seoDescription: z.string().max(170).optional(),
  noindex: z.literal("on").optional(),
});

export async function saveCategory(_: CatState, form: FormData): Promise<CatState> {
  const ctx = await assertStaff("products.edit");
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: "Enter a name (2–60 characters)." };
  const d = parsed.data;
  const slug = slugify(d.slug || d.name);
  if (!slug || RESERVED_SLUGS.has(slug)) return { ok: false, message: `"${slug}" can't be used as a category URL.` };
  const clash = await db().query.categories.findFirst({ where: and(eq(categories.slug, slug), d.id ? ne(categories.id, d.id) : undefined) });
  if (clash) return { ok: false, message: "Another category already uses that URL." };
  if (d.parentId && d.parentId === d.id) return { ok: false, message: "A category can't be its own parent." };

  let imageUrl: string | undefined;
  const file = form.get("image");
  if (file instanceof File && file.size > 0) {
    try {
      imageUrl = (await storeImage(file, "categories")).url;
    } catch (err) {
      return { ok: false, message: err instanceof UploadError ? err.message : "Image upload failed." };
    }
  }

  const values = {
    name: d.name,
    slug,
    description: d.description || null,
    parentId: d.parentId || null,
    sortOrder: d.sortOrder,
    active: d.active === "on",
    seoTitle: d.seoTitle || null,
    seoDescription: d.seoDescription || null,
    noindex: d.noindex === "on",
    ...(imageUrl ? { imageUrl } : {}),
    updatedAt: new Date(),
  };
  if (d.id) {
    const before = await db().query.categories.findFirst({ where: eq(categories.id, d.id) });
    if (!before) return { ok: false, message: "Category not found." };
    await db().transaction(async (tx) => {
      if (before.slug !== slug) {
        await tx
          .insert(slugRedirects)
          .values({ entity: "category", fromSlug: before.slug, entityId: d.id! })
          .onConflictDoUpdate({ target: [slugRedirects.entity, slugRedirects.fromSlug], set: { entityId: d.id! } });
        await tx.delete(slugRedirects).where(and(eq(slugRedirects.entity, "category"), eq(slugRedirects.fromSlug, slug)));
      }
      await tx.update(categories).set(values).where(eq(categories.id, d.id!));
      await audit(ctx.actor, "category.update", "category", d.id!, { before: { name: before.name, slug: before.slug }, after: { name: d.name, slug } }, tx);
    });
  } else {
    const [c] = await db().insert(categories).values(values).returning();
    await audit(ctx.actor, "category.create", "category", c.id, { name: c.name, slug });
  }
  refresh();
  return { ok: true, message: "Saved." };
}

export async function deleteCategory(form: FormData) {
  const ctx = await assertStaff("products.edit");
  const id = String(form.get("id") ?? "");
  const [{ n }] = await db().select({ n: sql<number>`count(*)::int` }).from(products).where(eq(products.categoryId, id));
  if (n > 0) {
    await db().update(categories).set({ active: false }).where(eq(categories.id, id));
  } else {
    await db().delete(categories).where(eq(categories.id, id));
  }
  await audit(ctx.actor, n > 0 ? "category.deactivate" : "category.delete", "category", id, { products: n });
  refresh();
}
