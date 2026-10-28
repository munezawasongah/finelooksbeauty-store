import { Suspense } from "react";
import { asc, sql } from "drizzle-orm";
import { requireStaff } from "@/server/auth/session";
import { db } from "@/server/db";
import { categories, products } from "@/server/db/schema";
import { PageHeader, Panel } from "@/components/admin/ui";
import { CategoryForm } from "./CategoryForm";
import { deleteCategory } from "./actions";

export const metadata = { title: "Categories" };

export default function CategoriesPage() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-white" />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  await requireStaff("products.edit");
  const rows = await db()
    .select({ c: categories, n: sql<number>`(select count(*)::int from ${products} p where p.category_id = ${categories.id})` })
    .from(categories)
    .orderBy(asc(categories.sortOrder), asc(categories.name));
  const parents = rows.map(({ c }) => ({ id: c.id, name: c.name }));
  return (
    <>
      <PageHeader title="Categories" description="Top-level categories appear in the main menu in this order. Changing a URL keeps the old one working." />
      <div className="space-y-4">
        {rows.map(({ c, n }) => (
          <Panel key={c.id} title={`${c.name} · /${c.slug} · ${n} products${c.active ? "" : " · hidden"}`}>
            <CategoryForm category={c} parents={parents.filter((p) => p.id !== c.id)} />
            <form action={deleteCategory} className="mt-3">
              <input type="hidden" name="id" value={c.id} />
              <button className="text-xs font-semibold text-danger underline">{n > 0 ? "Hide category" : "Delete category"}</button>
            </form>
          </Panel>
        ))}
        <Panel title="Add a category">
          <CategoryForm parents={parents} />
        </Panel>
      </div>
    </>
  );
}
