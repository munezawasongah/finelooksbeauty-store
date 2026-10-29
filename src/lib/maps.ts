import type { StoreInfo } from "@/server/settings";

/**
 * Google Maps links for the store.
 *
 * The embedded map is searched by the street address only (no business name, no suite):
 * Google geocodes a plain address to an exact point and drops a red pin on it, while a
 * business name it doesn't list leaves the map with no pin at all.
 */
export function storeMap(store: Pick<StoreInfo, "streetAddress" | "city" | "state" | "zip" | "mapEmbedQuery">) {
  const cityLine = `${store.city}, ${store.state} ${store.zip}`.trim();
  // "106 Bratton Dr, Suite 5" -> "106 Bratton Dr" (suite/unit numbers stop Google placing the pin)
  const street = store.streetAddress
    .replace(/\s*,?\s*(suite|ste\.?|unit|#)\s*[\w-]+\s*$/i, "")
    .trim();
  const pinQuery = street ? `${street}, ${cityLine}` : store.mapEmbedQuery;
  const pin = encodeURIComponent(pinQuery);
  return {
    embedSrc: `https://maps.google.com/maps?q=${pin}&t=m&z=17&ie=UTF8&iwloc=B&output=embed`,
    directionsHref: `https://www.google.com/maps/dir/?api=1&destination=${pin}`,
  };
}
