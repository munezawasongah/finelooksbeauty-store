/**
 * Base data every environment needs. Idempotent: safe to run on every deploy.
 * Creates the default stock location, starter categories and shipping methods
 * only if they don't exist yet; it never overwrites edits made in the dashboard.
 */
import { sql } from "drizzle-orm";
import { db, pool } from "../src/server/db";
import { categories, locations, shippingMethods } from "../src/server/db/schema";

const CATEGORIES = [
  {
    slug: "wigs",
    name: "Wigs",
    description: "Lace front, full lace, headband and glueless wigs in human and synthetic hair.",
  },
  {
    slug: "bundles-extensions",
    name: "Bundles & Extensions",
    description: "Weave bundles, closures, frontals, clip-ins and ponytails.",
  },
  {
    slug: "braiding-hair",
    name: "Braiding Hair",
    description: "Pre-stretched, kanekalon and crochet braiding hair in every shade.",
  },
  {
    slug: "hair-care",
    name: "Hair Care",
    description: "Shampoos, conditioners, edge control, oils, gels and styling products.",
  },
  {
    slug: "cosmetics",
    name: "Cosmetics",
    description: "Makeup, lashes, nails and skin care essentials.",
  },
  {
    slug: "beauty-tools",
    name: "Beauty Tools",
    description: "Wig caps, combs, brushes, bonnets, irons and dryers.",
  },
];

async function main() {
  const [{ n: locCount }] = (await db().execute(sql`select count(*)::int as n from locations`)).rows as { n: number }[];
  if (locCount === 0) {
    await db().insert(locations).values({ code: "garner", name: "Garner, NC store", isDefault: true });
    console.log("Created default location.");
  }

  const [{ n: catCount }] = (await db().execute(sql`select count(*)::int as n from categories`)).rows as { n: number }[];
  if (catCount === 0) {
    await db()
      .insert(categories)
      .values(CATEGORIES.map((c, i) => ({ ...c, sortOrder: i })));
    console.log(`Created ${CATEGORIES.length} categories.`);
  }

  const [{ n: shipCount }] = (await db().execute(sql`select count(*)::int as n from shipping_methods`)).rows as {
    n: number;
  }[];
  if (shipCount === 0) {
    // Starter rates — the store confirms its real rates in Settings → Shipping (document section 18).
    await db().insert(shippingMethods).values([
      { name: "USPS Ground Advantage", carrier: "USPS", amountCents: 795, freeOverCents: 7500, minDays: 3, maxDays: 5, sortOrder: 0 },
      { name: "UPS Ground", carrier: "UPS", amountCents: 1195, freeOverCents: null, minDays: 2, maxDays: 5, sortOrder: 1 },
      { name: "FedEx 2Day", carrier: "FedEx", amountCents: 2495, freeOverCents: null, minDays: 2, maxDays: 2, sortOrder: 2 },
    ]);
    console.log("Created starter shipping methods.");
  }
}

main()
  .then(() => pool().end())
  .catch(async (err) => {
    console.error("Seed failed:", err);
    await pool().end();
    process.exit(1);
  });
