import type { Metadata } from "next";
import { Suspense } from "react";
import { Clock, Mail, MapPin, Navigation, Phone } from "lucide-react";
import { PageHero } from "@/components/store/PageHero";
import { JsonLd } from "@/components/store/JsonLd";
import { getSettings } from "@/server/settings";
import { storeMap } from "@/lib/maps";
import { HoursTable, OpenNow } from "@/components/store/StoreHours";
import { StoreGallery } from "@/components/store/StoreGallery";
import { STORE_PHOTOS } from "@/lib/store-photos";
import { localBusinessJsonLd, organizationJsonLd } from "@/lib/seo";
import { socialLinks } from "@/lib/social";
import { SocialIcon, SocialLinks } from "@/components/store/SocialLinks";

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

async function Content() {
  const { store } = await getSettings(["store"]);
  const map = storeMap(store);
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
            href={map.directionsHref}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary btn-sm mt-4"
          >
            <Navigation size={15} aria-hidden /> Get directions
          </a>
        </InfoCard>
        <InfoCard icon={<Clock size={20} aria-hidden />} title="Opening hours">
          <div className="mb-3">
            <OpenNow hours={store.hours} />
          </div>
          <HoursTable hours={store.hours} />
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
        {socialLinks(store).length > 0 && (
          <section className="card p-6">
            <div className="mb-4 flex items-center gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-mist text-iris-600">
                <SocialIcon name="instagram" size={20} />
              </span>
              <div>
                <h2 className="font-display text-xl">Follow us</h2>
                <p className="text-sm text-ink-soft">New arrivals, installs and offers, first.</p>
              </div>
            </div>
            <SocialLinks links={socialLinks(store)} variant="list" storeName={store.name} />
          </section>
        )}
      </div>
      <div className="relative min-h-[24rem] overflow-hidden rounded-[var(--radius-card)] border border-line bg-mist">
        <iframe
          title={`Map showing ${store.name}`}
          src={map.embedSrc}
          className="absolute inset-0 h-full w-full"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
      <section aria-labelledby="inside-heading" className="pt-8 lg:col-span-2">
        <p className="eyebrow mb-2">Inside the store</p>
        <h2 id="inside-heading" className="mb-6 font-display text-3xl font-light sm:text-4xl">
          A look <em className="accent">around.</em>
        </h2>
        <StoreGallery photos={STORE_PHOTOS} />
      </section>
      <JsonLd data={localBusinessJsonLd(store)} />
      <JsonLd data={organizationJsonLd(store)} />
    </div>
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
