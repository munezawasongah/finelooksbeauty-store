import { eq, inArray } from "drizzle-orm";
import { db, type Tx } from "./db";
import { settings } from "./db/schema";
import { requestTime } from "./dynamic";
import type { DayHours } from "@/lib/hours";

export type StoreInfo = {
  name: string;
  legalName: string;
  tagline: string;
  phone: string;
  email: string;
  streetAddress: string;
  city: string;
  state: string;
  zip: string;
  directionsNote: string;
  /** Monday first; `summerClose` applies during daylight saving time. */
  hours: DayHours[];
  instagram: string;
  facebook: string;
  tiktok: string;
  youtube: string;
  googleBusinessUrl: string;
  mapEmbedQuery: string;
};

export type CommerceSettings = {
  /** Minutes a website checkout holds stock while the customer pays (Stripe minimum is 30). */
  reservationMinutes: number;
  /** Default safety stock withheld from online sale for every SKU (section 6.4). */
  defaultSafetyStock: number;
  /** Website availability is reduced to 0 for a SKU when its Clover sync is older than this. */
  staleSyncMinutes: number;
  /** Max units of one SKU per order, to stop hoarding of scarce stock. */
  maxQtyPerLine: number;
  pickupEnabled: boolean;
  pickupInstructions: string;
  announcement: string;
  returnsWindowDays: number;
};

export type HomeContent = {
  heroEyebrow: string;
  heroTitle: string;
  heroAccent: string;
  heroSubtitle: string;
  heroImageUrl: string | null;
  aboutTitle: string;
  aboutBody: string[];
  stats: { value: string; label: string }[];
  testimonials: { quote: string; name: string; source: string }[];
  faqs: { q: string; a: string }[];
};

export const DEFAULT_STORE: StoreInfo = {
  name: "Fine Looks Hair & Beauty",
  legalName: "Fine Looks Hair and Beauty Store",
  tagline: "From One Sister to Another",
  phone: "(919) 803-6420",
  email: "info@finelooksbeautystore.com",
  streetAddress: "106 Bratton Dr, Suite 5",
  city: "Garner",
  state: "NC",
  zip: "27529",
  directionsNote: "Off Highway 42, just behind Cook Out",
  /** From the shop door: Sun–Thu 9:30–7, Fri 9:30–4:30 (winter) / 9:30–7 (summer), Sat closed. */
  hours: [
    { day: "Monday", open: "09:30", close: "19:00" },
    { day: "Tuesday", open: "09:30", close: "19:00" },
    { day: "Wednesday", open: "09:30", close: "19:00" },
    { day: "Thursday", open: "09:30", close: "19:00" },
    { day: "Friday", open: "09:30", close: "16:30", summerClose: "19:00" },
    { day: "Saturday", open: null, close: null },
    { day: "Sunday", open: "09:30", close: "19:00" },
  ],
  instagram: "",
  facebook: "",
  tiktok: "",
  youtube: "",
  googleBusinessUrl: "",
  mapEmbedQuery: "Fine Looks Hair and Beauty Store, 106 Bratton Dr Suite 5, Garner, NC 27529",
};

export const DEFAULT_COMMERCE: CommerceSettings = {
  reservationMinutes: 35,
  defaultSafetyStock: 1,
  staleSyncMinutes: 30,
  maxQtyPerLine: 10,
  pickupEnabled: true,
  pickupInstructions:
    "We'll email you when your order is ready. Bring your order number and a photo ID to the counter.",
  announcement: "Free U.S. shipping on orders over $75 · Free in-store pickup in Garner, NC",
  returnsWindowDays: 14,
};

export const DEFAULT_HOME: HomeContent = {
  heroEyebrow: "Garner, North Carolina",
  heroTitle: "Hair & beauty,",
  heroAccent: "sister to sister.",
  heroSubtitle:
    "Wigs, bundles, braiding hair, hair care and beauty essentials, hand-picked by women who wear them. Shop online or visit us off Highway 42.",
  heroImageUrl: null,
  aboutTitle: "Your neighborhood beauty supply,",
  aboutBody: [
    "Fine Looks Hair & Beauty is a family-run beauty supply store in Garner, North Carolina. We stock the wigs, extensions, braiding hair, care products and tools our community asks for, and we take the time to help you find the right one.",
    "Shop online for delivery anywhere in the United States, or order ahead and pick up in store. Either way, you get the same products and the same advice you would get at our counter.",
  ],
  /** Empty = the homepage shows live figures computed from the catalog. */
  stats: [],
  testimonials: [],
  faqs: [
    {
      q: "Can I order online and pick up in the store?",
      a: "Yes. Choose in-store pickup at checkout. We'll email you as soon as your order is packed and ready at the counter in Garner.",
    },
    {
      q: "Where do you ship?",
      a: "We ship to all 50 U.S. states and DC with USPS, UPS or FedEx. You'll see the delivery estimate for each option before you pay.",
    },
    {
      q: "Is the stock on the website the same as in the store?",
      a: "Yes. The website and the in-store register share one inventory, so the quantity you see online is what we have available to sell.",
    },
    {
      q: "Can I return a wig or hair product?",
      a: "Unopened products in their original packaging can be returned within the returns window. For hygiene reasons, opened wigs, bundles and cosmetics can't be resold. See our returns policy for full details.",
    },
    {
      q: "How do I pay?",
      a: "Checkout is handled by Stripe, so your card details never touch our servers. We accept major cards and, where available, Apple Pay, Google Pay and Link.",
    },
  ],
};

export type PolicyPages = {
  privacy: string;
  terms: string;
  shipping: string;
  returns: string;
  accessibility: string;
  updatedOn: string;
};

/**
 * Starter policy text. Written as plain text: blank lines separate paragraphs,
 * lines starting "## " are headings and lines starting "- " are bullets.
 * The store's attorney should review these before launch (document section 12.3).
 */
export const DEFAULT_POLICIES: PolicyPages = {
  updatedOn: "",
  privacy: `This policy explains what personal information Fine Looks Hair and Beauty Store ("we") collects when you use this website, why, and the choices you have.

## What we collect
- Contact details you give us at checkout or when creating an account: name, email address, phone number (optional).
- Delivery details: the shipping address you enter on the payment page.
- Order details: what you bought, when, and how it was fulfilled.
- Basic technical information needed to run the site securely, such as IP address and browser type.

## Payments
Payments are processed by Stripe. Your card number is entered on Stripe's secure page and never reaches or is stored on our servers. We receive only the payment status and the last details needed to match a payment to your order.

## How we use it
- To process, deliver and support your orders, including order emails.
- To prevent fraud and keep the site secure.
- To send marketing emails, only if you opted in. Every marketing email has an unsubscribe link.

## Sharing
We share information only with service providers who help us run the store (payment processing, email delivery, shipping carriers, hosting) and only as needed for those services, or when required by law. We do not sell your personal information.

## Keeping and deleting your information
We keep order records as long as required for tax and accounting. You can delete your account from the account page; this removes your contact details from your profile. Contact us to ask what we hold about you or to request a correction.

## Children
This site is not directed to children under 13 and we do not knowingly collect their personal information.

## Contact
Questions about privacy? Email or call the store using the details at the bottom of every page.`,
  terms: `These terms apply to purchases made on this website from Fine Looks Hair and Beauty Store, Garner, North Carolina.

## Prices and payment
All prices are in U.S. dollars. Sales tax is calculated at checkout based on the delivery address (or the store address for in-store pickup). Payment is taken when you place your order.

## Availability
Stock is shared between the website and our store. While we hold your items during checkout, an item can occasionally sell in store at the same moment. If we cannot fill any part of your order, we will contact you and refund that part in full.

## Shipping and pickup
See our Shipping & Pickup page for delivery options, timing and pickup instructions.

## Returns
See our Returns page.

## Product information
We describe products as accurately as we can. Colors may look different on different screens.

## Contact
Contact the store with any question about an order.`,
  shipping: `## Shipping
We ship to addresses in all 50 U.S. states and Washington, DC. Shipping options and prices are shown at checkout, along with the estimated delivery time for each carrier. Orders are usually packed within 1–2 business days.

If we can't ship within the time we promised, we will email you with a new date and the option to cancel for a full refund.

## In-store pickup
Choose in-store pickup at checkout. We'll email you as soon as your order is ready. Bring your order number and a photo ID to the counter. Unclaimed pickup orders are held for 14 days.`,
  returns: `## Returns
Unopened products in their original, sealed packaging can be returned within the returns window shown on product pages for a refund to the original payment method.

For hygiene reasons, wigs, bundles, closures, frontals, braiding hair, cosmetics and tools that have been opened, tried on, cut, colored or used cannot be returned, unless they arrived damaged or faulty.

## Damaged or wrong items
If something arrives damaged or isn't what you ordered, contact us within 7 days of delivery with your order number and a photo and we'll make it right.

## How to start a return
Call or email the store with your order number. Returned items are inspected before a refund is issued; refunds usually appear within 5–10 business days.`,
  accessibility: `We want everyone to be able to shop with us. This website is designed to meet the Web Content Accessibility Guidelines (WCAG) 2.1, Level AA: it can be used with a keyboard, works with screen readers, keeps readable color contrast and labels every form field.

If any part of the site is hard to use, please call or email the store. We'll help you place your order directly and fix the problem.`,
};

const DEFAULTS = {
  store: DEFAULT_STORE,
  commerce: DEFAULT_COMMERCE,
  home: DEFAULT_HOME,
  policies: DEFAULT_POLICIES,
} as const;

type SettingsMap = { store: StoreInfo; commerce: CommerceSettings; home: HomeContent; policies: PolicyPages };
export type SettingKey = keyof SettingsMap;

export async function getSetting<K extends SettingKey>(key: K, tx?: Tx): Promise<SettingsMap[K]> {
  if (!tx) await requestTime();
  const row = await (tx ?? db()).query.settings.findFirst({ where: eq(settings.key, key) });
  return { ...DEFAULTS[key], ...((row?.value as object) ?? {}) } as SettingsMap[K];
}

export async function getSettings<K extends SettingKey>(keys: K[]): Promise<Pick<SettingsMap, K>> {
  await requestTime();
  const rows = await db().select().from(settings).where(inArray(settings.key, keys));
  const out = {} as Pick<SettingsMap, K>;
  for (const k of keys) {
    const row = rows.find((r) => r.key === k);
    (out as Record<string, unknown>)[k] = { ...DEFAULTS[k], ...((row?.value as object) ?? {}) };
  }
  return out;
}

export async function saveSetting<K extends SettingKey>(key: K, value: SettingsMap[K], tx?: Tx) {
  await (tx ?? db())
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
}
