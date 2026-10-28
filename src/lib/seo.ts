import type { StoreInfo } from "@/server/settings";
import { hoursFor } from "./hours";

export const SITE_URL = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

export function abs(path: string) {
  if (/^https?:\/\//.test(path)) return path;
  return `${SITE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

const DAY_MAP: Record<string, string> = {
  Monday: "Mo",
  Tuesday: "Tu",
  Wednesday: "We",
  Thursday: "Th",
  Friday: "Fr",
  Saturday: "Sa",
  Sunday: "Su",
};

export function localBusinessJsonLd(store: StoreInfo) {
  const sameAs = [store.facebook, store.instagram, store.youtube, store.tiktok, store.googleBusinessUrl].filter(Boolean);
  return {
    "@context": "https://schema.org",
    "@type": "Store",
    "@id": `${SITE_URL}/#store`,
    name: store.name,
    legalName: store.legalName,
    slogan: store.tagline,
    url: SITE_URL,
    logo: abs("/brand/icon-512.png"),
    image: abs("/brand/icon-512.png"),
    telephone: `+1-${store.phone.replace(/\D/g, "").replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3")}`,
    email: store.email,
    address: {
      "@type": "PostalAddress",
      ...(store.streetAddress ? { streetAddress: store.streetAddress } : {}),
      addressLocality: store.city,
      addressRegion: store.state,
      ...(store.zip ? { postalCode: store.zip } : {}),
      addressCountry: "US",
    },
    ...(store.hours.some((h) => h.open && h.close)
      ? {
          // the hours in force this season (Friday closes later in summer)
          openingHours: hoursFor(store.hours)
            .filter((h) => h.open && h.close)
            .map((h) => `${DAY_MAP[h.day] ?? h.day} ${h.open}-${h.close}`),
        }
      : {}),
    ...(sameAs.length ? { sameAs } : {}),
    currenciesAccepted: "USD",
    paymentAccepted: "Credit Card, Debit Card",
  };
}

export function organizationJsonLd(store: StoreInfo) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${SITE_URL}/#org`,
    name: store.name,
    url: SITE_URL,
    logo: abs("/brand/icon-512.png"),
    contactPoint: {
      "@type": "ContactPoint",
      telephone: `+1-${store.phone.replace(/\D/g, "")}`,
      contactType: "customer service",
      areaServed: "US",
      availableLanguage: "English",
    },
  };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: abs(it.path),
    })),
  };
}
