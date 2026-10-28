"use client";

import { useActionState } from "react";
import { saveCategory } from "./actions";

type C = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parentId: string | null;
  sortOrder: number;
  active: boolean;
  imageUrl: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  noindex: boolean;
};

export function CategoryForm({ category, parents }: { category?: C; parents: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(saveCategory, null);
  return (
    <form action={action} className="grid gap-3 md:grid-cols-4">
      <input type="hidden" name="id" value={category?.id ?? ""} />
      <label className="block md:col-span-2">
        <span className="label">Name</span>
        <input name="name" defaultValue={category?.name} required className="field" />
      </label>
      <label className="block">
        <span className="label">URL</span>
        <input name="slug" defaultValue={category?.slug} placeholder="auto" className="field font-mono text-sm" />
      </label>
      <label className="block">
        <span className="label">Order</span>
        <input name="sortOrder" type="number" min={0} defaultValue={category?.sortOrder ?? 0} className="field" />
      </label>
      <label className="block md:col-span-2">
        <span className="label">Description (shown at the top of the page)</span>
        <input name="description" defaultValue={category?.description ?? ""} className="field" />
      </label>
      <label className="block">
        <span className="label">Parent</span>
        <select name="parentId" defaultValue={category?.parentId ?? ""} className="field">
          <option value="">— top level —</option>
          {parents.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="label">Tile image</span>
        <input name="image" type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="block w-full text-xs" />
      </label>
      <label className="block md:col-span-2">
        <span className="label">SEO title</span>
        <input name="seoTitle" defaultValue={category?.seoTitle ?? ""} maxLength={70} className="field" />
      </label>
      <label className="block md:col-span-2">
        <span className="label">SEO description</span>
        <input name="seoDescription" defaultValue={category?.seoDescription ?? ""} maxLength={170} className="field" />
      </label>
      <div className="flex flex-wrap items-center gap-4 md:col-span-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={category?.active ?? true} className="h-4 w-4 accent-iris-600" /> Visible
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="noindex" defaultChecked={category?.noindex} className="h-4 w-4 accent-iris-600" /> Hide from search engines
        </label>
        <button disabled={pending} className="btn btn-primary btn-sm">{pending ? "Saving…" : category ? "Save" : "Add category"}</button>
        {state && <span role="status" className={`text-sm font-semibold ${state.ok ? "text-success" : "text-danger"}`}>{state.message}</span>}
      </div>
    </form>
  );
}
