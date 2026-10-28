"use client";

import { useActionState } from "react";
import Image from "next/image";
import { updateImage, uploadImages } from "./actions";

export function ImagesEditor({ productId, images, title }: { productId: string; images: { id: string; url: string; alt: string }[]; title: string }) {
  const [state, action, pending] = useActionState(uploadImages, null);
  return (
    <div className="space-y-5">
      {images.length > 0 && (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((img, i) => (
            <li key={img.id} className="overflow-hidden rounded-xl border border-line">
              <div className="relative aspect-[4/5] bg-mist">
                <Image src={img.url} alt={img.alt} fill sizes="200px" className="object-cover" />
                {i === 0 && <span className="absolute left-2 top-2 rounded-full bg-ink px-2 py-0.5 text-[0.65rem] font-bold text-white">Main</span>}
              </div>
              <form action={updateImage} className="space-y-2 p-2">
                <input type="hidden" name="imageId" value={img.id} />
                <label className="sr-only" htmlFor={`alt-${img.id}`}>Alt text</label>
                <input id={`alt-${img.id}`} name="alt" defaultValue={img.alt} className="field !py-1.5 text-xs" />
                <div className="flex flex-wrap gap-1">
                  <button name="intent" value="save" className="btn btn-ghost btn-sm !px-2 !py-1 text-xs">Save alt</button>
                  {i > 0 && <button name="intent" value="first" className="btn btn-ghost btn-sm !px-2 !py-1 text-xs">Make main</button>}
                  <button name="intent" value="delete" className="btn btn-ghost btn-sm !px-2 !py-1 text-xs text-danger">Delete</button>
                </div>
              </form>
            </li>
          ))}
        </ul>
      )}
      <form action={action} className="grid gap-3 rounded-2xl border border-dashed border-iris-200 bg-iris-50/40 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <input type="hidden" name="productId" value={productId} />
        <label className="block">
          <span className="label">Images (JPG, PNG, WebP, AVIF · 10 MB max each)</span>
          <input name="images" type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple required className="block w-full text-sm" />
        </label>
        <label className="block">
          <span className="label">Alt text (describe the photo)</span>
          <input name="alt" defaultValue={title} required className="field" />
        </label>
        <button disabled={pending} className="btn btn-primary btn-sm">{pending ? "Uploading…" : "Upload"}</button>
        {state && <p role="status" className={`text-sm font-semibold sm:col-span-3 ${state.ok ? "text-success" : "text-danger"}`}>{state.message}</p>}
      </form>
      <p className="text-xs text-muted">Images are resized and converted to WebP automatically. The first image is used on product cards and in search results.</p>
    </div>
  );
}
