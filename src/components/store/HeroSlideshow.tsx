"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";

export type Slide = { src: string; alt: string; caption: string };

const SHOW_MS = 5000;

/**
 * Hero photo slideshow: each photo cross-fades into the next with a slow zoom.
 * Pauses on hover/focus, when the tab is hidden, or with the pause button; with
 * "reduce motion" turned on it doesn't advance by itself (arrows and dots still work).
 */
export function HeroSlideshow({ slides }: { slides: Slide[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hover, setHover] = useState(false);
  const [reduce, setReduce] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [cycle, setCycle] = useState(0);
  const touchX = useRef<number | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduce(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    const vis = () => setHidden(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", vis);
    return () => {
      mq.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", vis);
    };
  }, []);

  const go = useCallback(
    (to: number) => {
      setIndex((to + slides.length) % slides.length);
      setCycle((c) => c + 1);
    },
    [slides.length],
  );

  const running = !paused && !hover && !reduce && !hidden && slides.length > 1;
  useEffect(() => {
    if (!running) return;
    const t = setTimeout(() => go(index + 1), SHOW_MS);
    return () => clearTimeout(t);
  }, [running, index, cycle, go]);

  if (!slides.length) return null;
  const current = slides[index];

  return (
    <div
      className="absolute inset-0"
      role="region"
      aria-roledescription="carousel"
      aria-label="Photos from our Garner store"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX.current == null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        touchX.current = null;
        if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1));
      }}
    >
      {slides.map((s, i) => {
        const active = i === index;
        // render the current, previous and next photo; the rest stay unmounted until needed
        const near = active || i === (index + 1) % slides.length || i === (index - 1 + slides.length) % slides.length;
        if (!near) return null;
        return (
          <div
            key={s.src}
            className={`absolute inset-0 overflow-hidden transition-opacity duration-[1400ms] ease-out ${active ? "opacity-100" : "opacity-0"}`}
            aria-hidden={!active}
          >
            <div
              key={active ? `on-${cycle}` : "off"}
              className="absolute inset-0 will-change-transform"
              style={
                active && !reduce
                  ? { animation: `${i % 2 ? "kenburns-b" : "kenburns-a"} ${SHOW_MS + 1600}ms ease-out both` }
                  : undefined
              }
            >
              <Image
                src={s.src}
                alt={s.alt}
                fill
                priority={i === 0}
                sizes="(min-width: 1024px) 40vw, 90vw"
                className="object-cover"
              />
            </div>
          </div>
        );
      })}

      {/* legibility gradients for the chips on top and the caption below */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-ink/45 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-ink/75 via-ink/30 to-transparent" />

      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-5 sm:p-6">
        <p className="min-w-0 text-white" aria-live={running ? "off" : "polite"}>
          <span className="block text-[0.62rem] font-bold tracking-[0.18em] text-orchid-200 uppercase">
            Inside our store · {index + 1}/{slides.length}
          </span>
          <span key={current.src} className="block animate-fade-up truncate font-display text-xl sm:text-2xl">
            {current.caption}
          </span>
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => go(index - 1)}
            aria-label="Previous photo"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur transition-colors hover:bg-white/35"
          >
            <ChevronLeft size={17} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            aria-label={paused ? "Play slideshow" : "Pause slideshow"}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur transition-colors hover:bg-white/35"
          >
            {paused ? <Play size={15} aria-hidden /> : <Pause size={15} aria-hidden />}
          </button>
          <button
            type="button"
            onClick={() => go(index + 1)}
            aria-label="Next photo"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur transition-colors hover:bg-white/35"
          >
            <ChevronRight size={17} aria-hidden />
          </button>
        </div>
      </div>

      {/* progress bars, one per photo */}
      <div className="absolute inset-x-5 bottom-[5.6rem] flex gap-1 sm:inset-x-6">
        {slides.map((s, i) => (
          <button
            key={s.src}
            type="button"
            onClick={() => go(i)}
            aria-label={`Show photo ${i + 1}: ${s.caption}`}
            aria-current={i === index}
            className="group relative h-4 flex-1"
          >
            <span className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 overflow-hidden rounded-full bg-white/30 group-hover:bg-white/50">
              <span
                key={i === index ? `p-${cycle}-${running}` : "idle"}
                className="absolute inset-0 origin-left rounded-full bg-white"
                style={
                  i < index
                    ? { transform: "scaleX(1)" }
                    : i === index
                      ? running
                        ? { animation: `slide-progress ${SHOW_MS}ms linear both` }
                        : { transform: "scaleX(1)" }
                      : { transform: "scaleX(0)" }
                }
              />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
