import { Suspense } from "react";
import { asc } from "drizzle-orm";
import { requireStaff } from "@/server/auth/session";
import { db } from "@/server/db";
import { categories } from "@/server/db/schema";
import { PageHeader, Panel } from "@/components/admin/ui";
import { ProductForm } from "../ProductForm";

export const metadata = { title: "New product" };

export default function NewProductPage() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-white" />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  await requireStaff("products.edit");
  const cats = await db().select({ id: categories.id, name: categories.name }).from(categories).orderBy(asc(categories.sortOrder));
  return (
    <>
      <PageHeader back={{ href: "/admin/products", label: "Products" }} title="New product" description="Starts as a draft. Add photos and variants, then set it to Active." />
      <Panel>
        <ProductForm mode="create" product={{ status: "draft" }} categories={cats} />
      </Panel>
    </>
  );
}
