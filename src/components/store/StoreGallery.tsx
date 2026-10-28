"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Expand, X } from "lucide-react";
import type { StorePhoto } from "@/lib/store-photos";

/**
 * Photo grid of the real store with a full-screen viewer
 * (arrow keys, swipe, Esc to close; focus returns to the photo that opened it).
 */
export function StoreGallery({ photos }: { photos: StorePhoto[] }) {
  const [index, setIndex] = useState<number | null>(null);
  const openers = useRef<(HTMLButtonElement | null)[]>([]);
  const closeRef = useRef<HTMLButtonElement>(null);
  const touchX = useRef<number | null>(null);

  const close = useCallback(() => {
    setIndex((i) => {
      if (i != null) requestAnimationFrame(() => openers.current[i]?.focus());
      return null;
    });
  }, []);
  const step = useCallback((d: number) => setIndex((i) => (i == null ? i : (i + d + photos.length) % photos.length)), [photos.length]);

  useEffect(() => {
    if (index == null) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [index, close, step]);

  const current = index == null ? null : photos[index];

  return (
    <>
      <ul className="grid grid-flow-dense auto-rows-[9.5rem] grid-cols-2 gap-3 sm:auto-rows-[11rem] sm:gap-4 lg:grid-cols-4 lg:auto-rows-[12.5rem]">
        {photos.map((p, i) => {
          const big = p.tile === "big";
          const tall = p.tile === "tall";
          return (
            <li key={p.src} className={`${big ? "col-span-2 row-span-2" : tall ? "row-span-2" : ""}`}>
              <button
                ref={(el) => {
                  openers.current[i] = el;
                }}
                type="button"
                onClick={() => setIndex(i)}
                className="group relative block h-full w-full overflow-hidden rounded-[var(--radius-card)] bg-mist text-left focus-visible:outline-offset-4"
                aria-label={`View photo: ${p.caption}`}
              >
                <Image
                  src={p.src}
                  alt={p.alt}
                  fill
                  sizes={big ? "(min-width: 1024px) 50vw, 100vw" : "(min-width: 1024px) 25vw, 50vw"}
                  className="object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                />
                <span className="absolute inset-0 bg-gradient-to-t from-ink/70 via-ink/0 to-ink/0 opacity-90" />
                <span className="absolute right-3 bottom-3 left-3 flex items-end justify-between gap-2">
                  <span className="text-sm font-bold text-white drop-shadow sm:text-base">{p.caption}</span>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/90 text-ink opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                    <Expand size={14} aria-hidden />
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {current && index != null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Photo ${index + 1} of ${photos.length}: ${current.caption}`}
          className="fixed inset-0 z-[70] flex flex-col bg-ink/95 backdrop-blur-sm"
          onClick={close}
          onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
          onTouchEnd={(e) => {
            if (touchX.current == null) return;
            const dx = e.changedTouches[0].clientX - touchX.current;
            touchX.current = null;
            if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
          }}
        >
          <div className="flex items-center justify-between px-4 py-3 text-white sm:px-6" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-semibold">
              <span className="text-white/60">
                {index + 1} / {photos.length}
              </span>{" "}
              · {current.caption}
            </p>
            <button ref={closeRef} type="button" onClick={close} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10">
              <X size={22} aria-hidden />
            </button>
          </div>
          <div className="relative flex-1">
            <Image src={current.src} alt={current.alt} fill sizes="100vw" className="object-contain p-2 sm:p-8" priority />
            <button
              type="button"
              aria-label="Previous photo"
              onClick={(e) => {
                e.stopPropagation();
                step(-1);
              }}
              className="absolute top-1/2 left-2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-ink shadow-xl hover:bg-white sm:left-6"
            >
              <ChevronLeft size={22} aria-hidden />
            </button>
            <button
              type="button"
              aria-label="Next photo"
              onClick={(e) => {
                e.stopPropagation();
                step(1);
              }}
              className="absolute top-1/2 right-2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-ink shadow-xl hover:bg-white sm:right-6"
            >
              <ChevronRight size={22} aria-hidden />
            </button>
          </div>
          <p className="px-6 pt-2 pb-5 text-center text-sm text-white/70" onClick={(e) => e.stopPropagation()}>
            {current.alt}
          </p>
        </div>
      )}
    </>
  );
}
