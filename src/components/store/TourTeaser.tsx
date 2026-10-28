import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Box, MousePointerClick, Play, Route } from "lucide-react";

/** Landing-page invitation into the 3D store (/tour). Static: no data needed. */
export function TourTeaser() {
  const points = [
    { icon: Route, title: "Walk every aisle", text: "The wig wall, braiding hair, hair care, cosmetics and tools, laid out like our Garner store." },
    { icon: MousePointerClick, title: "Tap to take a closer look", text: "Spin any product in 3D, choose your options and see the price." },
    { icon: Play, title: "Or take the guided tour", text: "Sit back while we walk you through each section." },
  ];
  return (
    <section aria-labelledby="tour-heading" className="relative overflow-hidden bg-ink py-20 text-white sm:py-28">
      <div className="grain absolute inset-0 opacity-40" />
      <div className="pointer-events-none absolute -top-40 -left-40 h-[28rem] w-[28rem] rounded-full bg-iris-600/40 blur-3xl" />
      <div className="pointer-events-none absolute -right-32 -bottom-40 h-[26rem] w-[26rem] rounded-full bg-orchid-500/30 blur-3xl" />
      <div className="container-x relative grid items-center gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <div>
          <p className="eyebrow flex items-center gap-2 text-orchid-200">
            <span className="rounded-full bg-orchid-500 px-2 py-0.5 text-[0.62rem] tracking-[0.12em] text-white">New</span>
            Walk the store
          </p>
          <h2 id="tour-heading" className="mt-4 text-[2.3rem] leading-[1.03] font-light sm:text-6xl">
            Step inside, <em className="accent text-orchid-200">from anywhere.</em>
          </h2>
          <p className="mt-5 max-w-lg text-lg text-white/75">
            Our shop floor, in 3D. Browse the shelves the way you would in person, right from your phone or laptop.
          </p>
          <ul className="mt-8 space-y-5">
            {points.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-orchid-200 ring-1 ring-white/15">
                  <Icon size={19} aria-hidden />
                </span>
                <span>
                  <span className="block font-bold">{title}</span>
                  <span className="text-sm text-white/65">{text}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/tour" className="btn btn-orchid">
              <Box size={17} aria-hidden /> Walk the store in 3D
            </Link>
            <Link href="/shop" className="btn border border-white/30 text-white hover:bg-white hover:text-ink">
              Shop the list <ArrowRight size={16} aria-hidden />
            </Link>
          </div>
        </div>

        <Link
          href="/tour"
          aria-label="Open the 3D store"
          className="group relative block overflow-hidden rounded-[1.75rem] bg-[#1a1230] shadow-[0_40px_90px_-30px_rgba(184,74,246,0.55)] ring-1 ring-white/15"
        >
          <div className="flex items-center gap-1.5 border-b border-white/10 bg-white/5 px-4 py-3">
            <span className="h-2.5 w-2.5 rounded-full bg-white/25" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/25" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/25" />
            <span className="ml-3 truncate rounded-full bg-white/10 px-3 py-1 text-[0.7rem] font-semibold text-white/60">finelooks · walk the store</span>
          </div>
          <div className="relative aspect-[1600/761]">
            <Image
              src="/tour/preview.webp"
              alt="Inside the Fine Looks 3D store: the wig wall, aisle signs, checkout counter and stocked shelves"
              fill
              sizes="(min-width: 1024px) 55vw, 100vw"
              className="object-cover transition-transform duration-700 group-hover:scale-[1.03]"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-ink/60 via-transparent to-transparent" />
            <span className="absolute top-1/2 left-1/2 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-iris-700 shadow-2xl transition-transform group-hover:scale-110">
              <Play size={28} className="ml-1" fill="currentColor" aria-hidden />
            </span>
            <span className="absolute bottom-4 left-4 hidden items-center gap-3 rounded-2xl bg-white px-4 py-3 text-ink shadow-xl sm:flex">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-iris-50 text-iris-600">
                <MousePointerClick size={17} aria-hidden />
              </span>
              <span>
                <span className="block text-[0.62rem] font-bold tracking-[0.14em] text-iris-600 uppercase">Aisle 1 · The Wig Wall</span>
                <span className="block text-sm font-bold">Tap any wig to see it in 3D</span>
              </span>
            </span>
          </div>
        </Link>
      </div>
    </section>
  );
}
