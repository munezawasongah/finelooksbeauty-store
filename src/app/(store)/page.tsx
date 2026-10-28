import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Clock,
  MapPin,
  Package,
  ShieldCheck,
  Sparkles,
  Store,
  Truck,
  MessageCircleHeart,
  Plus,
} from "lucide-react";
import { ProductCard, ProductGridSkeleton } from "@/components/store/ProductCard";
import { SectionHeading } from "@/components/store/SectionHeading";
import { catalogStats, listCategories, searchProducts } from "@/server/catalog";
import { DEFAULT_HOME, DEFAULT_STORE, getSettings, type HomeContent, type StoreInfo } from "@/server/settings";
import { JsonLd } from "@/components/store/JsonLd";
import { localBusinessJsonLd } from "@/lib/seo";

export default function HomePage() {
  return (
    <>
      <Suspense fallback={<Hero home={DEFAULT_HOME} store={DEFAULT_STORE} />}>
        <HeroData />
      </Suspense>
      <TrustStrip />
      <section aria-labelledby="cat-heading" className="container-x py-20 sm:py-28">
        <SectionHeading
          id="cat-heading"
          eyebrow="The collection"
          title="Every look,"
          accent="one store."
          href="/shop"
          hrefLabel="Shop all"
        />
        <Suspense fallback={<CategorySkeleton />}>
          <Categories />
        </Suspense>
      </section>

      <section aria-labelledby="best-heading" className="bg-cream py-20 sm:py-28">
        <div className="container-x">
          <SectionHeading
            id="best-heading"
            eyebrow="Customer favorites"
            title="Loved by"
            accent="our sisters."
            href="/shop?sort=featured"
            hrefLabel="See all products"
          />
          <Suspense fallback={<ProductGridSkeleton />}>
            <ProductRail featuredOnly />
          </Suspense>
        </div>
      </section>

      <Suspense fallback={<About home={DEFAULT_HOME} store={DEFAULT_STORE} />}>
        <AboutData />
      </Suspense>

      <Suspense fallback={<StatsBand stats={null} />}>
        <StatsData />
      </Suspense>

      <WaysToShop />

      <section aria-labelledby="new-heading" className="container-x py-20 sm:py-28">
        <SectionHeading
          id="new-heading"
          eyebrow="Just landed"
          title="New on"
          accent="the shelf."
          href="/shop?sort=newest"
          hrefLabel="Shop new arrivals"
        />
        <Suspense fallback={<ProductGridSkeleton />}>
          <ProductRail sort="newest" />
        </Suspense>
      </section>

      <Suspense fallback={null}>
        <TestimonialsData />
      </Suspense>

      <Suspense fallback={<Faq faqs={DEFAULT_HOME.faqs} />}>
        <FaqData />
      </Suspense>

      <Suspense fallback={null}>
        <VisitBandData />
      </Suspense>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Hero                                                                */
/* ------------------------------------------------------------------ */

async function HeroData() {
  const { home, store } = await getSettings(["home", "store"]);
  return <Hero home={home} store={store} />;
}

function Hero({ home, store }: { home: HomeContent; store: StoreInfo }) {
  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute -left-40 top-10 h-[30rem] w-[30rem] rounded-full bg-orchid-100 blur-3xl" />
      <div className="pointer-events-none absolute right-0 top-0 h-[36rem] w-[36rem] rounded-full bg-iris-50 blur-3xl" />
      <div className="container-x relative grid items-center gap-12 py-12 sm:py-16 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:py-24">
        <div className="animate-fade-up">
          <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-line bg-white/80 px-4 py-1.5 text-xs font-bold tracking-[0.12em] text-iris-700 uppercase shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-orchid-500" />
            {home.heroEyebrow}
          </p>
          <h1 className="text-[3.1rem] leading-[0.98] font-light text-ink sm:text-7xl lg:text-[5.4rem]">
            {home.heroTitle}
            <br />
            <em className="accent">{home.heroAccent}</em>
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-relaxed text-ink-soft">{home.heroSubtitle}</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/shop" className="btn btn-primary">
              Shop the collection <ArrowRight size={17} aria-hidden />
            </Link>
            <Link href="/visit" className="btn btn-outline">
              <MapPin size={17} aria-hidden /> Visit the store
            </Link>
          </div>
          <p className="mt-8 font-script text-2xl text-iris-600" style={{ fontFamily: "var(--font-script)" }}>
            — {store.tagline}
          </p>
        </div>

        <div className="relative mx-auto w-full max-w-xl animate-fade-up [animation-delay:120ms]">
          {home.heroImageUrl ? (
            <div className="relative aspect-[4/5] overflow-hidden rounded-[2rem] shadow-[var(--shadow-lift)]">
              <Image
                src={home.heroImageUrl}
                alt="Fine Looks Hair & Beauty products"
                fill
                priority
                sizes="(min-width: 1024px) 40vw, 90vw"
                className="object-cover"
              />
            </div>
          ) : (
            <BrandComposition />
          )}
          <div className="absolute -left-4 bottom-10 hidden rounded-2xl border border-line bg-white/95 p-4 shadow-[var(--shadow-lift)] backdrop-blur sm:block lg:-left-10">
            <p className="flex items-center gap-2 text-xs font-bold tracking-[0.12em] text-iris-600 uppercase">
              <Store size={14} aria-hidden /> Order online
            </p>
            <p className="mt-1 font-display text-xl">Pick up in Garner</p>
            <p className="text-xs text-muted">{store.directionsNote || `${store.city}, ${store.state}`}</p>
          </div>
          <div className="absolute -right-3 top-8 hidden rounded-2xl bg-ink px-4 py-3 text-white shadow-xl sm:block lg:-right-8">
            <p className="text-[0.65rem] font-bold tracking-[0.16em] text-orchid-300 uppercase">Ships to</p>
            <p className="font-display text-2xl">All 50 states</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function BrandComposition() {
  return (
    <div className="relative aspect-[4/5] overflow-hidden rounded-[2rem] bg-gradient-to-br from-iris-600 via-iris-500 to-orchid-500 shadow-[var(--shadow-lift)]">
      <div className="grain absolute inset-0 opacity-60" />
      <div className="absolute -right-20 -top-20 h-80 w-80 rounded-full border-[28px] border-white/10" />
      <div className="absolute -bottom-24 -left-16 h-96 w-96 rounded-full bg-orchid-300/30 blur-2xl" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative flex aspect-square w-[66%] items-center justify-center rounded-full bg-white shadow-2xl ring-[14px] ring-white/15">
          <Image src="/brand/emblem.png" alt="" width={360} height={360} priority className="h-[82%] w-[82%]" />
        </div>
      </div>
      <div className="absolute inset-x-6 top-6 flex max-w-[70%] flex-wrap gap-2">
        {["Wigs", "Bundles", "Braiding hair", "Hair care", "Beauty"].map((t) => (
          <span key={t} className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur">
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

function TrustStrip() {
  const items = [
    { icon: Truck, title: "U.S. shipping", text: "USPS, UPS & FedEx" },
    { icon: Store, title: "Free store pickup", text: "Order ahead, collect in Garner" },
    { icon: ShieldCheck, title: "Secure checkout", text: "Payments by Stripe" },
    { icon: Package, title: "Live stock", text: "Shared with our register" },
  ];
  return (
    <section aria-label="Why shop with us" className="border-y border-line bg-white">
      <ul className="container-x grid grid-cols-2 gap-y-6 py-7 lg:grid-cols-4">
        {items.map(({ icon: Icon, title, text }) => (
          <li key={title} className="flex items-center gap-3 px-2">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-mist text-iris-600">
              <Icon size={20} aria-hidden />
            </span>
            <span>
              <span className="block text-sm font-bold">{title}</span>
              <span className="block text-xs text-muted">{text}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Categories                                                          */
/* ------------------------------------------------------------------ */

const CAT_STYLES = [
  "from-iris-600 to-iris-800 text-white",
  "from-orchid-400 to-orchid-600 text-white",
  "from-mist to-iris-100 text-ink",
  "from-orchid-100 to-orchid-200 text-ink",
  "from-ink to-iris-900 text-white",
  "from-iris-100 to-orchid-100 text-ink",
];

async function Categories() {
  const cats = (await listCategories()).filter((c) => !c.parentId).slice(0, 6);
  if (!cats.length) {
    return <p className="text-muted">Categories will appear here once the catalog is set up.</p>;
  }
  return (
    <ul className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3">
      {cats.map((c, i) => (
        <li key={c.id}>
          <Link
            href={`/${c.slug}`}
            className={`group relative flex h-full min-h-44 flex-col justify-between overflow-hidden rounded-[var(--radius-card)] bg-gradient-to-br p-5 transition-shadow hover:shadow-[var(--shadow-lift)] sm:min-h-56 sm:p-7 ${
              CAT_STYLES[i % CAT_STYLES.length]
            }`}
          >
            {c.imageUrl && (
              <Image
                src={c.imageUrl}
                alt=""
                fill
                sizes="(min-width: 1024px) 33vw, 50vw"
                className="object-cover opacity-90 transition-transform duration-700 group-hover:scale-105"
              />
            )}
            {c.imageUrl && <div className="absolute inset-0 bg-gradient-to-t from-ink/70 via-ink/10 to-transparent" />}
            <span className="relative flex items-start justify-between">
              <span className="font-display text-sm italic opacity-70">{String(i + 1).padStart(2, "0")}</span>
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 backdrop-blur transition-transform duration-300 group-hover:rotate-45">
                <ArrowUpRight size={18} aria-hidden />
              </span>
            </span>
            <span className={`relative ${c.imageUrl ? "text-white" : ""}`}>
              <span className="block font-display text-2xl leading-tight sm:text-4xl">{c.name}</span>
              <span className="mt-1 block text-xs font-semibold opacity-75">
                {c.productCount} {c.productCount === 1 ? "product" : "products"}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function CategorySkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="min-h-44 animate-pulse rounded-[var(--radius-card)] bg-mist sm:min-h-56" />
      ))}
    </div>
  );
}

async function ProductRail({ featuredOnly, sort }: { featuredOnly?: boolean; sort?: "newest" }) {
  let { items } = await searchProducts({ featuredOnly, sort, pageSize: 8 });
  if (featuredOnly && items.length < 4) items = (await searchProducts({ pageSize: 8 })).items;
  if (!items.length) return <p className="text-muted">Products will appear here soon.</p>;
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 lg:grid-cols-4 lg:gap-x-6">
      {items.map((p, i) => (
        <ProductCard key={p.id} p={p} priority={i < 2} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* About + numbered values                                             */
/* ------------------------------------------------------------------ */

async function AboutData() {
  const { home, store } = await getSettings(["home", "store"]);
  return <About home={home} store={store} />;
}

function About({ home, store }: { home: HomeContent; store: StoreInfo }) {
  const values = [
    {
      title: "Shop how you like",
      text: "Browse online, ship anywhere in the U.S., or reserve online and pick up at the counter.",
    },
    {
      title: "One honest stock count",
      text: "The website and our in-store register share one inventory, so what you see is what we have.",
    },
    {
      title: "Real advice",
      text: "Not sure about a length, density or texture? Call or visit and we'll help you choose.",
    },
  ];
  return (
    <section aria-labelledby="about-heading" className="container-x py-20 sm:py-28">
      <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:gap-20">
        <div>
          <p className="eyebrow mb-3">About us</p>
          <h2 id="about-heading" className="text-[2.1rem] leading-[1.05] font-light sm:text-5xl">
            {home.aboutTitle} <em className="accent">{store.city}, {store.state}.</em>
          </h2>
          <div className="mt-6 space-y-4 text-[1.02rem] leading-relaxed text-ink-soft">
            {home.aboutBody.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          <Link href="/visit" className="btn btn-dark mt-8">
            <MapPin size={17} aria-hidden /> Plan your visit
          </Link>
        </div>
        <ol className="grid gap-4 self-end">
          {values.map((v, i) => (
            <li
              key={v.title}
              className="group flex gap-6 rounded-[var(--radius-card)] border border-line bg-white p-6 transition-shadow hover:shadow-[var(--shadow-soft)] sm:p-8"
            >
              <span className="font-display text-4xl font-light text-orchid-400 italic">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span>
                <span className="block font-display text-2xl">{v.title}</span>
                <span className="mt-1.5 block text-sm leading-relaxed text-muted">{v.text}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Stats                                                               */
/* ------------------------------------------------------------------ */

async function StatsData() {
  const [{ home }, live] = await Promise.all([getSettings(["home"]), catalogStats()]);
  const stats = home.stats.length
    ? home.stats
    : [
        { value: live.products.toLocaleString("en-US"), label: "Products online" },
        { value: String(live.categories), label: "Categories" },
        { value: String(Math.max(live.brands, 1)), label: "Brands we carry" },
        { value: "50 + DC", label: "States we ship to" },
      ];
  return <StatsBand stats={stats} />;
}

function StatsBand({ stats }: { stats: { value: string; label: string }[] | null }) {
  return (
    <section aria-labelledby="stats-heading" className="relative overflow-hidden bg-iris-700 py-20 text-white sm:py-24">
      <div className="grain absolute inset-0 opacity-50" />
      <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-orchid-500/40 blur-3xl" />
      <div className="container-x relative">
        <p className="eyebrow mb-3 text-orchid-200">By the numbers</p>
        <h2 id="stats-heading" className="max-w-2xl text-[2.1rem] leading-[1.05] font-light sm:text-5xl">
          A full beauty supply, <em className="accent text-orchid-200">online.</em>
        </h2>
        <dl className="mt-12 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-card)] bg-white/15 lg:grid-cols-4">
          {(stats ?? Array.from({ length: 4 }, () => ({ value: "—", label: "" }))).map((s, i) => (
            <div key={i} className="bg-iris-700 p-6 sm:p-8">
              <dt className="text-xs font-bold tracking-[0.14em] text-orchid-200 uppercase">
                {String(i + 1).padStart(2, "0")} · {s.label}
              </dt>
              <dd className="mt-3 font-display text-4xl font-light sm:text-6xl">{s.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Ways to shop                                                        */
/* ------------------------------------------------------------------ */

function WaysToShop() {
  const ways = [
    {
      icon: Truck,
      title: "Delivered to your door",
      text: "Choose USPS, UPS or FedEx at checkout and see the delivery estimate before you pay.",
      href: "/policies/shipping",
      cta: "Shipping details",
    },
    {
      icon: Clock,
      title: "Order ahead, pick up today",
      text: "Pay online and we'll set your order aside. We email you the moment it's ready at the counter.",
      href: "/policies/shipping#pickup",
      cta: "How pickup works",
    },
    {
      icon: MessageCircleHeart,
      title: "Ask a sister",
      text: "Questions about a wig cap size, bundle length or product? Call the store and we'll walk you through it.",
      href: "/visit",
      cta: "Contact the store",
    },
  ];
  return (
    <section aria-labelledby="ways-heading" className="container-x py-20 sm:py-28">
      <SectionHeading id="ways-heading" eyebrow="Our services" title="Three ways we" accent="take care" after="of you." />
      <ul className="grid gap-5 md:grid-cols-3">
        {ways.map(({ icon: Icon, title, text, href, cta }, i) => (
          <li
            key={title}
            className="group relative flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-cream p-7 transition-all hover:-translate-y-1 hover:border-iris-200 hover:bg-white hover:shadow-[var(--shadow-lift)] sm:p-8"
          >
            <span className="font-display text-sm text-muted italic">{String(i + 1).padStart(2, "0")}</span>
            <span className="mt-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-iris-600 shadow-sm group-hover:bg-iris-600 group-hover:text-white">
              <Icon size={24} aria-hidden />
            </span>
            <h3 className="mt-6 font-display text-2xl">{title}</h3>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">{text}</p>
            <Link href={href} className="mt-6 inline-flex items-center gap-1.5 text-sm font-bold text-iris-700">
              {cta} <ArrowRight size={15} aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Testimonials (only real ones, added by the store)                   */
/* ------------------------------------------------------------------ */

async function TestimonialsData() {
  const { home } = await getSettings(["home"]);
  if (!home.testimonials.length) return null;
  const loop = [...home.testimonials, ...home.testimonials];
  return (
    <section aria-labelledby="t-heading" className="overflow-hidden bg-cream py-20 sm:py-28">
      <div className="container-x">
        <SectionHeading id="t-heading" eyebrow="Testimonies" title="Stories from" accent="our sisters." />
      </div>
      <div className="relative">
        <ul className="flex w-max animate-marquee gap-5 hover:[animation-play-state:paused]">
          {loop.map((t, i) => (
            <li
              key={i}
              aria-hidden={i >= home.testimonials.length}
              className="w-[20rem] shrink-0 rounded-[var(--radius-card)] border border-line bg-white p-7 sm:w-[24rem]"
            >
              <Sparkles size={18} className="text-orchid-500" aria-hidden />
              <blockquote className="mt-4 font-display text-xl leading-snug">“{t.quote}”</blockquote>
              <p className="mt-5 text-sm font-bold">{t.name}</p>
              <p className="text-xs text-muted">{t.source}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* FAQ                                                                 */
/* ------------------------------------------------------------------ */

async function FaqData() {
  const { home } = await getSettings(["home"]);
  return <Faq faqs={home.faqs} />;
}

function Faq({ faqs }: { faqs: HomeContent["faqs"] }) {
  if (!faqs.length) return null;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
  return (
    <section aria-labelledby="faq-heading" className="container-x py-20 sm:py-28">
      <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
        <div>
          <p className="eyebrow mb-3">Questions</p>
          <h2 id="faq-heading" className="text-[2.1rem] leading-[1.05] font-light sm:text-5xl">
            Everything <em className="accent">else.</em>
          </h2>
          <p className="mt-5 max-w-sm text-ink-soft">
            Can&apos;t find your answer? Call the store or stop by. We&apos;re happy to help.
          </p>
        </div>
        <div className="divide-y divide-line border-y border-line">
          {faqs.map((f) => (
            <details key={f.q} className="group py-2">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-4 text-left font-display text-xl sm:text-2xl [&::-webkit-details-marker]:hidden">
                {f.q}
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line transition-transform duration-300 group-open:rotate-45 group-open:border-orchid-400 group-open:bg-orchid-50">
                  <Plus size={18} aria-hidden />
                </span>
              </summary>
              <p className="max-w-2xl pb-5 leading-relaxed text-ink-soft">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
      <JsonLd data={jsonLd} />
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Visit band                                                          */
/* ------------------------------------------------------------------ */

async function VisitBandData() {
  const { store } = await getSettings(["store"]);
  const tel = store.phone.replace(/\D/g, "");
  return (
    <section className="container-x pb-20 sm:pb-28">
      <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-orchid-500 via-orchid-600 to-iris-700 px-6 py-14 text-white sm:px-12 sm:py-16">
        <div className="grain absolute inset-0 opacity-40" />
        <Image
          src="/brand/emblem.png"
          alt=""
          width={420}
          height={420}
          className="pointer-events-none absolute -right-16 -bottom-20 opacity-15 brightness-0 invert"
        />
        <div className="relative max-w-2xl">
          <p className="eyebrow text-orchid-100">Visit the store</p>
          <h2 className="mt-3 text-[2.1rem] leading-[1.05] font-light sm:text-5xl">
            Come see us in <em className="italic">{store.city}.</em>
          </h2>
          <p className="mt-4 text-white/85">
            {store.streetAddress ? `${store.streetAddress}, ` : ""}
            {store.city}, {store.state} {store.zip}
            {store.directionsNote ? ` · ${store.directionsNote}` : ""}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/visit" className="btn bg-white text-iris-700 hover:bg-orchid-50">
              <MapPin size={17} aria-hidden /> Hours &amp; directions
            </Link>
            <a href={`tel:+1${tel}`} className="btn border-[1.5px] border-white/60 text-white hover:bg-white/10">
              Call {store.phone}
            </a>
          </div>
        </div>
      </div>
      <JsonLd data={localBusinessJsonLd(store)} />
    </section>
  );
}
