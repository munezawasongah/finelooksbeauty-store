"use client";

import { useActionState, useState } from "react";
import { createProduct, updateProduct, type ProductFormState } from "./actions";

type Cat = { id: string; name: string };
type P = {
  id?: string;
  title?: string;
  slug?: string;
  description?: string;
  brand?: string | null;
  categoryId?: string | null;
  status?: "draft" | "active" | "archived";
  badge?: string | null;
  featured?: boolean;
  optionNames?: string[];
  seoTitle?: string | null;
  seoDescription?: string | null;
  canonicalOverride?: string | null;
  noindex?: boolean;
};

export function ProductForm({ product, categories, mode }: { product: P; categories: Cat[]; mode: "create" | "edit" }) {
  const [state, action, pending] = useActionState<ProductFormState, FormData>(mode === "create" ? createProduct : updateProduct, null);
  const [seoTitle, setSeoTitle] = useState(product.seoTitle ?? "");
  const [seoDesc, setSeoDesc] = useState(product.seoDescription ?? "");
  const err = (k: string) => state?.fields?.[k];

  return (
    <form action={action} className="space-y-6">
      {product.id && <input type="hidden" name="id" value={product.id} />}
      <div className="grid gap-4 md:grid-cols-2">
        <F label="Product name" error={err("title")} className="md:col-span-2">
          <input name="title" defaultValue={product.title} required className="field" />
        </F>
        <F label="URL slug" hint="Leave blank to generate from the name. Changing it keeps the old link working (301)." error={err("slug")}>
          <input name="slug" defaultValue={product.slug} className="field font-mono text-sm" placeholder="body-wave-lace-front-24" />
        </F>
        <F label="Brand">
          <input name="brand" defaultValue={product.brand ?? ""} className="field" />
        </F>
        <F label="Category">
          <select name="categoryId" defaultValue={product.categoryId ?? ""} className="field">
            <option value="">No category</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </F>
        <F label="Status">
          <select name="status" defaultValue={product.status ?? "draft"} className="field">
            <option value="draft">Draft (hidden)</option>
            <option value="active">Active (on the website)</option>
            <option value="archived">Archived (redirects to category)</option>
          </select>
        </F>
        <F label="Badge">
          <select name="badge" defaultValue={product.badge ?? ""} className="field">
            <option value="">None</option>
            <option value="bestseller">Bestseller</option>
            <option value="new">New</option>
            <option value="sale">Sale</option>
            <option value="limited">Limited</option>
          </select>
        </F>
        <F label="Option names" hint="Up to 3, comma separated — e.g. Length, Color, Density. Each variant picks a value for each.">
          <input name="optionNames" defaultValue={(product.optionNames ?? []).join(", ")} className="field" placeholder="Length, Color" />
        </F>
        <label className="flex items-center gap-2 self-end pb-3 text-sm font-semibold">
          <input type="checkbox" name="featured" defaultChecked={product.featured} className="h-4 w-4 accent-iris-600" />
          Feature on the home page
        </label>
        <F label="Description" hint="Separate paragraphs with a blank line." className="md:col-span-2">
          <textarea name="description" defaultValue={product.description} rows={6} className="field" />
        </F>
      </div>

      {mode === "create" && (
        <div className="grid gap-4 rounded-2xl bg-mist p-4 md:grid-cols-3">
          <p className="text-sm font-semibold md:col-span-3">First variant (add more after saving)</p>
          <F label="SKU" error={err("sku")}><input name="sku" required className="field font-mono uppercase" /></F>
          <F label="Price (USD)" error={err("price")}><input name="price" inputMode="decimal" required className="field" placeholder="0.00" /></F>
          <F label="Barcode (UPC/EAN)"><input name="barcode" className="field font-mono" /></F>
        </div>
      )}

      <details className="rounded-2xl border border-line p-4" open={Boolean(product.seoTitle || product.seoDescription)}>
        <summary className="cursor-pointer text-sm font-bold">Search engine listing</summary>
        <div className="mt-4 grid gap-4">
          <F label={`SEO title (${seoTitle.length}/70)`} hint="Defaults to the product name." error={err("seoTitle")}>
            <input name="seoTitle" value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} maxLength={70} className="field" />
          </F>
          <F label={`Meta description (${seoDesc.length}/170)`} hint="Defaults to the start of the description and price." error={err("seoDescription")}>
            <textarea name="seoDescription" value={seoDesc} onChange={(e) => setSeoDesc(e.target.value)} maxLength={170} rows={2} className="field" />
          </F>
          <F label="Canonical URL override" hint="Only if this product duplicates another page.">
            <input name="canonicalOverride" defaultValue={product.canonicalOverride ?? ""} className="field font-mono text-sm" />
          </F>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="noindex" defaultChecked={product.noindex} className="h-4 w-4 accent-iris-600" />
            Hide from search engines (noindex)
          </label>
          <div className="rounded-xl bg-mist p-3 text-sm">
            <p className="text-xs text-muted">Preview</p>
            <p className="text-[#1a0dab]">{seoTitle || product.title || "Product name"} | Fine Looks Hair &amp; Beauty</p>
            <p className="text-xs text-muted">{seoDesc || (product.description ?? "").slice(0, 150)}</p>
          </div>
        </div>
      </details>

      <div className="flex items-center gap-3">
        <button disabled={pending} className="btn btn-primary">{pending ? "Saving…" : mode === "create" ? "Create product" : "Save product"}</button>
        {state && <p role="status" className={`text-sm font-semibold ${state.ok ? "text-success" : "text-danger"}`}>{state.message}</p>}
      </div>
    </form>
  );
}

function F({ label, hint, error, className = "", children }: { label: string; hint?: string; error?: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-muted">{hint}</span>}
      {error && <span className="mt-1 block text-xs font-semibold text-danger">{error}</span>}
    </label>
  );
}
