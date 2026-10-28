"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  DoorOpen,
  Footprints,
  Hand,
  HelpCircle,
  List,
  Map as MapIcon,
  Maximize2,
  Minimize2,
  Minus,
  MousePointerClick,
  Pause,
  Play,
  Plus,
  ShoppingBasket,
  Star,
  X,
} from "lucide-react";
import { PRODUCT_BY_ID, SECTIONS, TOUR_PRODUCTS, productsIn, usd, type SectionKey, type TourProduct } from "./catalog";
import { createTour, type TourHandle } from "./engine";
import { Joystick, Minimap, createPoseStore } from "./Controls";
import { ProductPreview } from "./ProductPreview";

type BasketLine = { key: string; id: string; options: string; qty: number };

const HELP_KEY = "fl_tour_help_seen";
const BASKET_KEY = "fl_tour_basket";

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeStorage(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode */
  }
}

export default function StoreTour() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<TourHandle | null>(null);
  const poses = useMemo(() => createPoseStore(), []);

  const [status, setStatus] = useState<"loading" | "ready" | "error">(() => (webglAvailable() ? "loading" : "error"));
  const [progress, setProgress] = useState({ v: 0, label: "Opening the doors" });
  const [layout, setLayout] = useState<TourHandle["layout"] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const [section, setSection] = useState<SectionKey | null>(null);
  const [auto, setAuto] = useState(false);
  // This component only ever renders in the browser (loaded with ssr: false).
  const [touch] = useState(() => window.matchMedia("(pointer: coarse)").matches);
  const [reducedMotion] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [showMap, setShowMap] = useState(() => window.innerWidth >= 768);
  const [help, setHelp] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [basketOpen, setBasketOpen] = useState(false);
  const [basket, setBasket] = useState<BasketLine[]>(() => readStorage<BasketLine[]>(BASKET_KEY, []));
  const [toast, setToast] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [canFullscreen] = useState(() => Boolean(document.fullscreenEnabled));

  /* ----------------------------- engine ---------------------------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !webglAvailable()) return;
    const isTouch = window.matchMedia("(pointer: coarse)").matches;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const nav = navigator as Navigator & { deviceMemory?: number };
    const low = (isTouch && window.innerWidth < 1024) || (nav.deviceMemory ?? 8) < 4 || (navigator.hardwareConcurrency ?? 8) <= 4;

    let cancelled = false;
    let handle: TourHandle | null = null;
    createTour(canvas, {
      products: TOUR_PRODUCTS,
      quality: low ? "low" : "high",
      reducedMotion: reduce,
      onProgress: (v, label) => !cancelled && setProgress({ v, label }),
      onSelect: (id) => setSelected(id),
      onHover: (h) => setHover(h),
      onPose: (p) => poses.set(p),
      onSection: (k) => setSection(k),
      onAutoTour: (on) => setAuto(on),
      onInteract: () => setHelp(false),
    })
      .then((h) => {
        if (cancelled) {
          h.dispose();
          return;
        }
        handle = h;
        handleRef.current = h;
        setLayout(h.layout);
        setStatus("ready");
        if (!readStorage<boolean>(HELP_KEY, false)) setHelp(true);
      })
      .catch((err) => {
        console.error("[tour] failed to start", err);
        if (!cancelled) setStatus("error");
      });

    const ro = new ResizeObserver(() => handleRef.current?.resize());
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => {
      cancelled = true;
      ro.disconnect();
      handle?.dispose();
      handleRef.current = null;
    };
  }, [poses]);

  useEffect(() => {
    const onFs = () => setFullscreen(document.fullscreenElement === wrapRef.current);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  /* ----------------------------- actions --------------------------- */
  const closeProduct = () => {
    setSelected(null);
    handleRef.current?.select(null);
  };
  const dismissHelp = () => {
    setHelp(false);
    writeStorage(HELP_KEY, true);
  };
  const goTo = (k: SectionKey | "entrance") => {
    setListOpen(false);
    handleRef.current?.goTo(k);
  };
  const openProduct = (id: string) => {
    setListOpen(false);
    setSelected(id);
    handleRef.current?.focusProduct(id);
  };
  const toggleAuto = () => {
    dismissHelp();
    setSelected(null);
    handleRef.current?.select(null);
    handleRef.current?.setAutoTour(!auto);
  };
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await wrapRef.current?.requestFullscreen();
    } catch {
      /* not allowed */
    }
  };
  const addToBasket = (p: TourProduct, options: string, qty: number) => {
    setBasket((b) => {
      const key = `${p.id}|${options}`;
      const existing = b.find((l) => l.key === key);
      const next = existing ? b.map((l) => (l.key === key ? { ...l, qty: Math.min(99, l.qty + qty) } : l)) : [...b, { key, id: p.id, options, qty }];
      writeStorage(BASKET_KEY, next);
      return next;
    });
    setToast(`${p.short} added to your basket`);
  };
  const updateLine = (key: string, qty: number) => {
    setBasket((b) => {
      const next = qty <= 0 ? b.filter((l) => l.key !== key) : b.map((l) => (l.key === key ? { ...l, qty } : l));
      writeStorage(BASKET_KEY, next);
      return next;
    });
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (selected) closeProduct();
      else if (basketOpen) setBasketOpen(false);
      else if (listOpen) setListOpen(false);
      else if (help) dismissHelp();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const makePreview = useCallback(() => (selected ? handleRef.current?.cloneProduct(selected) ?? null : null), [selected]);

  const basketCount = basket.reduce((n, l) => n + l.qty, 0);
  const basketTotal = basket.reduce((n, l) => n + (PRODUCT_BY_ID.get(l.id)?.priceCents ?? 0) * l.qty, 0);
  const current = section ? SECTIONS.find((s) => s.key === section) : null;
  const product = selected ? PRODUCT_BY_ID.get(selected) ?? null : null;
  const hovered = hover && !touch ? PRODUCT_BY_ID.get(hover.id) : null;

  return (
    <div
      ref={wrapRef}
      className="relative h-full w-full overflow-hidden bg-[#1a1230] text-white select-none"
      aria-label="3D walk-through of the Fine Looks store"
    >
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full touch-none outline-none" tabIndex={0} aria-hidden />

      {/* ------------------------------ HUD ------------------------------ */}
      {status === "ready" && (
        <div className="pointer-events-none absolute inset-0">
          {/* top bar */}
          <div className="flex items-start justify-between gap-3 p-3 sm:p-4">
            <div className="pointer-events-auto min-w-0 rounded-2xl border border-white/15 bg-ink/70 px-4 py-2.5 shadow-xl backdrop-blur-md">
              <p className="text-[0.6rem] font-bold tracking-[0.18em] text-orchid-200 uppercase">
                {auto ? "Guided tour · " : ""}
                {current ? current.aisle : "Front of store"}
              </p>
              <p className="truncate font-display text-lg leading-tight sm:text-xl">
                {current ? current.name : "Welcome in"}
              </p>
            </div>
            <div className="pointer-events-auto flex shrink-0 items-center gap-1.5">
              <HudButton label={auto ? "Pause guided tour" : "Guided tour"} onClick={toggleAuto} active={auto} wide>
                {auto ? <Pause size={17} aria-hidden /> : <Play size={17} aria-hidden />}
                <span className="hidden sm:inline">{auto ? "Pause tour" : "Guided tour"}</span>
              </HudButton>
              <HudButton label="Product list" onClick={() => setListOpen(true)}>
                <List size={18} aria-hidden />
              </HudButton>
              <HudButton label={showMap ? "Hide map" : "Show map"} onClick={() => setShowMap((v) => !v)} active={showMap}>
                <MapIcon size={18} aria-hidden />
              </HudButton>
              {canFullscreen && (
                <HudButton label={fullscreen ? "Exit full screen" : "Full screen"} onClick={toggleFullscreen} className="hidden sm:flex">
                  {fullscreen ? <Minimize2 size={18} aria-hidden /> : <Maximize2 size={18} aria-hidden />}
                </HudButton>
              )}
              <HudButton label="How to walk around" onClick={() => setHelp(true)} className="hidden sm:flex">
                <HelpCircle size={18} aria-hidden />
              </HudButton>
              <HudButton label={`Basket, ${basketCount} item${basketCount === 1 ? "" : "s"}`} onClick={() => setBasketOpen(true)} accent>
                <ShoppingBasket size={18} aria-hidden />
                {basketCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-orchid-500 px-1 text-[0.65rem] font-bold">
                    {basketCount}
                  </span>
                )}
              </HudButton>
            </div>
          </div>

          {/* bottom: joystick / sections / map */}
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-3 sm:p-4">
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              {touch && !selected && (
                <div>
                  <Joystick onChange={(f, t) => handleRef.current?.setMove(f, t)} />
                </div>
              )}
              <nav aria-label="Store sections" className="pointer-events-auto -mx-1 flex max-w-full gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]">
                <SectionChip onClick={() => goTo("entrance")} active={!section}>
                  <DoorOpen size={14} aria-hidden /> Entrance
                </SectionChip>
                {SECTIONS.map((s) => (
                  <SectionChip key={s.key} onClick={() => goTo(s.key)} active={section === s.key}>
                    {s.label}
                  </SectionChip>
                ))}
              </nav>
            </div>
            {showMap && layout && (
              <div className={selected ? "hidden lg:block" : ""}>
                <Minimap
                  layout={layout}
                  poses={poses}
                  active={section}
                  onTeleport={(x, z) => handleRef.current?.teleport(x, z)}
                  onSection={(k) => goTo(k)}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* hover tooltip */}
      {hovered && hover && !selected && (
        <div
          className="pointer-events-none fixed z-30 -translate-x-1/2 -translate-y-[calc(100%+14px)] rounded-xl bg-white px-3 py-2 text-ink shadow-2xl"
          style={{ left: hover.x, top: hover.y }}
          role="tooltip"
        >
          <p className="text-[0.62rem] font-bold tracking-[0.12em] text-iris-600 uppercase">{hovered.brand}</p>
          <p className="max-w-[14rem] truncate text-sm font-bold">{hovered.name}</p>
          <p className="font-display text-base text-iris-700">{usd(hovered.priceCents)} <span className="ml-1 text-xs font-semibold text-muted">· click to view</span></p>
        </div>
      )}

      {/* toast */}
      {toast && (
        <div role="status" className="pointer-events-none absolute top-20 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-bold text-ink shadow-2xl sm:top-24">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-success text-white">
            <Check size={14} aria-hidden />
          </span>
          {toast}
        </div>
      )}

      {/* --------------------------- product panel ------------------------ */}
      {product && (
        <ProductPanel
          key={product.id}
          product={product}
          makePreview={makePreview}
          reducedMotion={reducedMotion}
          onClose={closeProduct}
          onAdd={addToBasket}
        />
      )}

      {/* ---------------------------- list sheet -------------------------- */}
      {listOpen && (
        <Sheet title="Everything in the store" onClose={() => setListOpen(false)}>
          <div className="space-y-6">
            {SECTIONS.filter((s) => s.key !== "featured").map((s) => (
              <section key={s.key} aria-labelledby={`sec-${s.key}`}>
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <h3 id={`sec-${s.key}`} className="font-display text-xl text-ink">
                    {s.name}
                  </h3>
                  <button type="button" onClick={() => goTo(s.key)} className="text-xs font-bold text-iris-600 hover:underline">
                    Walk there <ArrowRight size={12} className="inline" aria-hidden />
                  </button>
                </div>
                <ul className="divide-y divide-line rounded-2xl border border-line">
                  {productsIn(s.key).map((p) => (
                    <li key={p.id}>
                      <button type="button" onClick={() => openProduct(p.id)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-mist">
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-bold text-ink">{p.name}</span>
                          <span className="text-xs text-muted">{p.brand}</span>
                        </span>
                        <span className="shrink-0 font-display text-base text-iris-700">{usd(p.priceCents)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </Sheet>
      )}

      {/* ----------------------------- basket ----------------------------- */}
      {basketOpen && (
        <Sheet title="Your basket" onClose={() => setBasketOpen(false)} side="right">
          {basket.length === 0 ? (
            <div className="py-10 text-center">
              <ShoppingBasket size={40} className="mx-auto text-iris-300" aria-hidden />
              <p className="mt-3 font-display text-2xl text-ink">Your basket is empty</p>
              <p className="mt-1 text-sm text-muted">Tap any product on the shelves to take a closer look.</p>
            </div>
          ) : (
            <>
              <ul className="divide-y divide-line">
                {basket.map((l) => {
                  const p = PRODUCT_BY_ID.get(l.id);
                  if (!p) return null;
                  return (
                    <li key={l.key} className="flex items-start justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-ink">{p.name}</p>
                        {l.options && <p className="text-xs text-muted">{l.options}</p>}
                        <div className="mt-2 inline-flex items-center rounded-full border border-line">
                          <button type="button" aria-label="One less" onClick={() => updateLine(l.key, l.qty - 1)} className="flex h-8 w-8 items-center justify-center text-ink">
                            <Minus size={14} aria-hidden />
                          </button>
                          <span className="w-6 text-center text-sm font-bold text-ink">{l.qty}</span>
                          <button type="button" aria-label="One more" onClick={() => updateLine(l.key, l.qty + 1)} className="flex h-8 w-8 items-center justify-center text-ink">
                            <Plus size={14} aria-hidden />
                          </button>
                        </div>
                      </div>
                      <p className="shrink-0 font-display text-lg text-iris-700">{usd(p.priceCents * l.qty)}</p>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-4 flex items-baseline justify-between border-t border-line pt-4">
                <span className="text-sm font-bold text-ink">Subtotal</span>
                <span className="font-display text-2xl text-ink">{usd(basketTotal)}</span>
              </div>
              <p className="mt-4 rounded-2xl bg-mist p-4 text-sm text-ink-soft">
                You&apos;re browsing our preview store with sample products. Checkout from the 3D store opens when the full catalogue is connected; until then you can shop everything online.
              </p>
              <Link href="/shop" className="btn btn-primary mt-4 w-full">
                Shop online now <ArrowRight size={16} aria-hidden />
              </Link>
            </>
          )}
        </Sheet>
      )}

      {/* ------------------------------ help ------------------------------ */}
      {help && status === "ready" && (
        <div className="absolute inset-0 z-40 flex items-end justify-center bg-ink/40 p-3 backdrop-blur-[2px] sm:items-center">
          <div role="dialog" aria-modal="true" aria-labelledby="help-title" className="w-full max-w-lg rounded-[1.75rem] bg-white p-6 text-ink shadow-2xl sm:p-8">
            <p className="eyebrow">Walk the store</p>
            <h2 id="help-title" className="mt-2 font-display text-3xl leading-tight font-light">
              Welcome in, <em className="accent">sister.</em>
            </h2>
            <ul className="mt-5 space-y-3 text-sm">
              {touch ? (
                <>
                  <HelpRow icon={<Footprints size={18} />} title="Walk" text="Use the joystick, or tap the floor where you want to go." />
                  <HelpRow icon={<Hand size={18} />} title="Look around" text="Drag anywhere on the screen." />
                  <HelpRow icon={<MousePointerClick size={18} />} title="Shop" text="Tap any product for a closer look and price." />
                </>
              ) : (
                <>
                  <HelpRow icon={<Footprints size={18} />} title="Walk" text="W A S D or arrow keys, the mouse wheel, or click the floor." />
                  <HelpRow icon={<Hand size={18} />} title="Look around" text="Click and drag. Hold Shift to walk faster." />
                  <HelpRow icon={<MousePointerClick size={18} />} title="Shop" text="Click any product for a 3D close-up, price and options." />
                </>
              )}
              <HelpRow icon={<MapIcon size={18} />} title="Jump around" text="Use the aisle buttons or tap the map to go straight to a section." />
            </ul>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <button type="button" onClick={dismissHelp} className="btn btn-primary flex-1">
                Start walking
              </button>
              <button
                type="button"
                onClick={() => {
                  dismissHelp();
                  handleRef.current?.setAutoTour(true);
                }}
                className="btn btn-outline flex-1"
              >
                <Play size={15} aria-hidden /> Take the guided tour
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ----------------------------- loading ---------------------------- */}
      {status === "loading" && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[radial-gradient(120%_90%_at_50%_0%,#3a22b8_0%,#1e1433_65%)] px-6 text-center">
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-white shadow-[0_0_60px_rgba(184,74,246,0.55)]">
            <Image src="/brand/emblem.png" alt="" width={60} height={60} priority />
          </span>
          <p className="mt-5 text-4xl text-orchid-200" style={{ fontFamily: "var(--font-script)" }}>
            Fine Looks
          </p>
          <p className="mt-1 text-xs font-bold tracking-[0.24em] text-white/60 uppercase">Walk the store</p>
          <div className="mt-8 h-1.5 w-64 overflow-hidden rounded-full bg-white/15" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress.v * 100)} aria-label="Loading the store">
            <div className="h-full rounded-full bg-gradient-to-r from-iris-400 to-orchid-400 transition-[width] duration-300" style={{ width: `${Math.max(4, progress.v * 100)}%` }} />
          </div>
          <p className="mt-3 text-sm text-white/70">{progress.label}…</p>
        </div>
      )}

      {status === "error" && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-ink px-6 text-center">
          <p className="eyebrow text-orchid-200">Walk the store</p>
          <h2 className="mt-3 max-w-md font-display text-3xl font-light">
            Your browser can&apos;t open the <em className="accent text-orchid-200">3D store.</em>
          </h2>
          <p className="mt-3 max-w-md text-sm text-white/70">
            It needs WebGL, which is turned off or unavailable on this device. Everything is still a tap away in the online shop.
          </p>
          <Link href="/shop" className="btn btn-orchid mt-6">
            Shop online <ArrowRight size={16} aria-hidden />
          </Link>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Product panel                                                       */
/* ------------------------------------------------------------------ */

function ProductPanel({
  product: p,
  makePreview,
  reducedMotion,
  onClose,
  onAdd,
}: {
  product: TourProduct;
  makePreview: () => import("three").Group | null;
  reducedMotion: boolean;
  onClose: () => void;
  onAdd: (p: TourProduct, options: string, qty: number) => void;
}) {
  const [choice, setChoice] = useState<Record<string, string>>(() => Object.fromEntries((p.options ?? []).map((o) => [o.name, o.values[0]])));
  const [qty, setQty] = useState(1);
  const section = SECTIONS.find((s) => s.key === p.section)!;
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
  }, []);
  const optionText = (p.options ?? []).map((o) => `${o.name}: ${choice[o.name]}`).join(" · ");

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-labelledby="tour-product-title"
      className="absolute inset-x-0 bottom-0 z-30 flex max-h-[78%] flex-col overflow-hidden rounded-t-[1.75rem] bg-white text-ink shadow-[0_-20px_60px_-20px_rgba(0,0,0,0.5)] sm:inset-x-auto sm:top-3 sm:right-3 sm:bottom-3 sm:max-h-none sm:w-[24rem] sm:rounded-[1.75rem]"
    >
      <div className="relative h-52 shrink-0 bg-[radial-gradient(90%_90%_at_50%_30%,#ffffff_0%,#f3eefe_55%,#e7dcfb_100%)] sm:h-64">
        <ProductPreview make={makePreview} reducedMotion={reducedMotion} />
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-ink shadow-md hover:bg-white"
        >
          <X size={18} aria-hidden />
        </button>
        {p.badge && <span className="chip absolute top-4 left-4 bg-ink text-white">{p.badge}</span>}
        <span className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-white/80 px-3 py-1 text-[0.65rem] font-bold tracking-[0.1em] text-ink-soft uppercase">
          Drag to spin
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-5 sm:p-6">
        <p className="text-[0.68rem] font-bold tracking-[0.16em] text-iris-600 uppercase">
          {p.brand} · {section.label}
        </p>
        <h2 id="tour-product-title" className="mt-1 font-display text-2xl leading-tight">
          {p.name}
        </h2>
        <div className="mt-2 flex items-center gap-2 text-sm">
          <span className="flex text-orchid-500" aria-hidden>
            {Array.from({ length: 5 }, (_, i) => (
              <Star key={i} size={14} fill={i < Math.round(p.rating) ? "currentColor" : "none"} />
            ))}
          </span>
          <span className="font-semibold text-ink-soft">
            {p.rating.toFixed(1)} <span className="text-muted">({p.reviews})</span>
          </span>
        </div>
        <p className="mt-3 flex items-baseline gap-2">
          <span className="font-display text-3xl text-iris-700">{usd(p.priceCents)}</span>
          {p.compareAtCents && <span className="text-sm text-muted line-through">{usd(p.compareAtCents)}</span>}
        </p>

        {(p.options ?? []).map((o) => (
          <fieldset key={o.name} className="mt-4">
            <legend className="mb-2 text-xs font-bold text-ink-soft">
              {o.name}: <span className="text-ink">{choice[o.name]}</span>
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {o.values.map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={choice[o.name] === v}
                  onClick={() => setChoice((c) => ({ ...c, [o.name]: v }))}
                  className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                    choice[o.name] === v ? "border-iris-600 bg-iris-600 text-white" : "border-line text-ink hover:border-iris-300"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </fieldset>
        ))}

        <div className="mt-5 flex items-center gap-2">
          <div className="inline-flex items-center rounded-full border border-line">
            <button type="button" aria-label="One less" onClick={() => setQty((q) => Math.max(1, q - 1))} className="flex h-11 w-10 items-center justify-center">
              <Minus size={15} aria-hidden />
            </button>
            <span className="w-7 text-center font-bold" aria-live="polite">
              {qty}
            </span>
            <button type="button" aria-label="One more" onClick={() => setQty((q) => Math.min(99, q + 1))} className="flex h-11 w-10 items-center justify-center">
              <Plus size={15} aria-hidden />
            </button>
          </div>
          <button type="button" onClick={() => onAdd(p, optionText, qty)} className="btn btn-primary flex-1">
            <ShoppingBasket size={16} aria-hidden /> Add to basket
          </button>
        </div>

        <p className="mt-5 text-sm leading-relaxed text-ink-soft">{p.description}</p>

        <Link href={section.shopHref} className="mt-5 flex items-center justify-between rounded-2xl border border-line px-4 py-3 text-sm font-bold text-ink hover:border-iris-300">
          Shop {section.name.toLowerCase()} online <ArrowRight size={16} aria-hidden />
        </Link>
        <p className="mt-4 text-xs text-muted">Sample product shown for the store preview.</p>
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/* Small pieces                                                        */
/* ------------------------------------------------------------------ */

function HudButton({
  children,
  label,
  onClick,
  active,
  accent,
  wide,
  className = "",
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  accent?: boolean;
  wide?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={`relative flex h-11 items-center justify-center gap-2 rounded-full border text-sm font-bold shadow-xl backdrop-blur-md transition-colors ${
        wide ? "px-3.5 sm:px-4" : "w-11"
      } ${
        accent
          ? "border-orchid-400 bg-orchid-500 text-white hover:bg-orchid-600"
          : active
            ? "border-white bg-white text-ink"
            : "border-white/15 bg-ink/70 text-white hover:bg-ink/90"
      } ${className}`}
    >
      {children}
    </button>
  );
}

function SectionChip({ children, onClick, active }: { children: React.ReactNode; onClick: () => void; active: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "location" : undefined}
      className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-bold whitespace-nowrap shadow-lg backdrop-blur-md transition-colors ${
        active ? "border-white bg-white text-ink" : "border-white/15 bg-ink/70 text-white hover:bg-ink/90"
      }`}
    >
      {children}
    </button>
  );
}

function Sheet({ title, children, onClose, side = "left" }: { title: string; children: React.ReactNode; onClose: () => void; side?: "left" | "right" }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div className="absolute inset-0 z-40 flex bg-ink/40 backdrop-blur-[2px]" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={`mt-auto flex max-h-[85%] w-full flex-col overflow-hidden rounded-t-[1.75rem] bg-white text-ink shadow-2xl sm:mt-0 sm:max-h-none sm:w-[26rem] sm:rounded-none ${
          side === "right" ? "sm:ml-auto" : ""
        }`}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="font-display text-2xl">{title}</h2>
          <button ref={ref} type="button" onClick={onClose} aria-label="Close" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-mist">
            <X size={18} aria-hidden />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

function HelpRow({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-iris-50 text-iris-600">{icon}</span>
      <span>
        <span className="block font-bold">{title}</span>
        <span className="text-ink-soft">{text}</span>
      </span>
    </li>
  );
}

function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}
