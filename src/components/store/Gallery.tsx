"use client";

import { useState } from "react";
import { ProductArt } from "./ProductArt";

export function Gallery({ images, title }: { images: { url: string; alt: string }[]; title: string }) {
  const [i, setI] = useState(0);
  const current = images[i] ?? null;
  return (
    <div className="flex flex-col-reverse gap-3 sm:flex-row">
      {images.length > 1 && (
        <ul className="no-scrollbar flex gap-3 overflow-x-auto sm:w-20 sm:flex-col" role="tablist" aria-label="Product photos">
          {images.map((img, idx) => (
            <li key={img.url} className="shrink-0">
              <button
                type="button"
                role="tab"
                aria-selected={idx === i}
                aria-label={`Photo ${idx + 1} of ${images.length}`}
                onClick={() => setI(idx)}
                className={`relative block h-20 w-16 overflow-hidden rounded-xl border-2 sm:h-24 sm:w-20 ${
                  idx === i ? "border-iris-600" : "border-transparent opacity-70 hover:opacity-100"
                }`}
              >
                <ProductArt src={img.url} alt="" title={title} sizes="80px" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="relative aspect-[4/5] flex-1 overflow-hidden rounded-[1.75rem] bg-mist">
        <ProductArt
          src={current?.url ?? null}
          alt={current?.alt ?? title}
          title={title}
          priority
          sizes="(min-width: 1024px) 50vw, 100vw"
        />
      </div>
    </div>
  );
}
