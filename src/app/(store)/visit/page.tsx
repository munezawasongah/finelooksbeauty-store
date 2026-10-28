import type { Metadata } from "next";
import { Suspense } from "react";
import { Clock, Mail, MapPin, Navigation, Phone } from "lucide-react";
import { PageHero } from "@/components/store/PageHero";
import { JsonLd } from "@/components/store/JsonLd";
import { getSettings, type StoreInfo } from "@/server/settings";
import { localBusinessJsonLd, organizationJsonLd } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Visit our beauty supply store in Garner, NC",
  description:
    "Find Fine Looks Hair & Beauty in Garner, North Carolina, off Highway 42 just behind Cook Out. Opening hours, phone, directions and in-store pickup.",
  alternates: { canonical: "/visit" },
};

export default function VisitPage() {
  return (
    <>
      <PageHero
        eyebrow="Visit the store"
        title="Come see us in"
        accent="Garner."
        description="Shop the full range in person, pick up an online order, or get help choosing the right look."
        crumbs={[{ name: "Home", href: "/" }, { name: "Visit us" }]}
      />
      <Suspense fallback={<div className="container-x h-96 animate-pulse rounded-[var(--radius-card)] bg-mist" />}>
        <Content />
      </Suspense>
    </>
  );
}

function to12h(t: string | null) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, "0")}` : ""} ${suffix}`;
}

async function Content() {
  const { store } = await getSettings(["store"]);
  const address = [store.streetAddress, `${store.city}, ${store.state} ${store.zip}`.trim()].filter(Boolean).join(", ");
  const mapsQuery = encodeURIComponent(store.streetAddress ? `${store.name}, ${address}` : store.mapEmbedQuery);
  const tel = store.phone.replace(/\D/g, "");
  return (
    <div className="container-x grid gap-8 pb-24 lg:grid-cols-[1fr_1.2fr]">
      <div className="space-y-5">
        <InfoCard icon={<MapPin size={20} aria-hidden />} title="Address">
          <address className="not-italic">
            {store.streetAddress && (
              <>
                {store.streetAddress}
                <br />
              </>
            )}
            {store.city}, {store.state} {store.zip}
          </address>
          {store.directionsNote && <p className="mt-1 text-muted">{store.directionsNote}</p>}
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${mapsQuery}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary btn-sm mt-4"
          >
            <Navigation size={15} aria-hidden /> Get directions
          </a>
        </InfoCard>
        <InfoCard icon={<Clock size={20} aria-hidden />} title="Opening hours">
          <Hours store={store} />
        </InfoCard>
        <InfoCard icon={<Phone size={20} aria-hidden />} title="Call or email">
          <p>
            <a href={`tel:+1${tel}`} className="font-bold text-iris-700">
              {store.phone}
            </a>
          </p>
          <p className="mt-1 flex items-center gap-2 break-all">
            <Mail size={15} className="shrink-0 text-muted" aria-hidden />
            <a href={`mailto:${store.email}`} className="text-iris-700">
              {store.email}
            </a>
          </p>
        </InfoCard>
      </div>
      <div className="relative min-h-[24rem] overflow-hidden rounded-[var(--radius-card)] border border-line bg-mist">
        <iframe
          title={`Map showing ${store.name}`}
          src={`https://www.google.com/maps?q=${mapsQuery}&output=embed`}
          className="absolute inset-0 h-full w-full"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
      <JsonLd data={localBusinessJsonLd(store)} />
      <JsonLd data={organizationJsonLd(store)} />
    </div>
  );
}

function Hours({ store }: { store: StoreInfo }) {
  if (!store.hours.length) {
    return <p className="text-ink-soft">Call the store for today&apos;s hours.</p>;
  }
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5">
      {store.hours.map((h) => (
        <div key={h.day} className="contents">
          <dt className="font-semibold">{h.day}</dt>
          <dd className="text-ink-soft">{h.open && h.close ? `${to12h(h.open)} – ${to12h(h.close)}` : "Closed"}</dd>
        </div>
      ))}
    </dl>
  );
}

function InfoCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="card flex gap-4 p-6">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-mist text-iris-600">{icon}</span>
      <div className="text-sm">
        <h2 className="mb-2 font-display text-xl">{title}</h2>
        {children}
      </div>
    </section>
  );
}
