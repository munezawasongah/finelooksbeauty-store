/**
 * Demo catalog for staging only, so the storefront can be reviewed before the
 * real Clover import. Every demo product is tagged brand "Demo" and can be
 * removed with:  npm run seed:demo -- --remove
 * Refuses to run when NODE_ENV=production unless ALLOW_DEMO_SEED=1.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, pool } from "../src/server/db";
import { categories, inventoryBalances, locations, products, productVariants, stockMovements } from "../src/server/db/schema";

type DemoProduct = {
  category: string;
  title: string;
  badge?: "bestseller" | "new" | "sale" | "limited";
  featured?: boolean;
  description: string;
  optionNames: string[];
  variants: { options: Record<string, string>; price: number; compareAt?: number; stock: number }[];
};

const DEMO: DemoProduct[] = [
  {
    category: "wigs",
    title: "Body Wave 13x4 Lace Front Wig",
    badge: "bestseller",
    featured: true,
    description:
      "Soft, bouncy body wave on a breathable 13x4 HD lace front with pre-plucked hairline and adjustable straps. 180% density.",
    optionNames: ["Length", "Color"],
    variants: [
      { options: { Length: '18"', Color: "Natural Black" }, price: 159.99, stock: 6 },
      { options: { Length: '22"', Color: "Natural Black" }, price: 189.99, stock: 4 },
      { options: { Length: '24"', Color: "Natural Black" }, price: 209.99, stock: 10 },
      { options: { Length: '24"', Color: "1B/30 Ombré" }, price: 219.99, stock: 2 },
    ],
  },
  {
    category: "wigs",
    title: "Glueless Bob Wig with Bangs",
    badge: "new",
    featured: true,
    description: "Wear-and-go glueless bob with soft bangs. Pre-cut lace, elastic band and three combs.",
    optionNames: ["Color"],
    variants: [
      { options: { Color: "Jet Black" }, price: 69.99, stock: 8 },
      { options: { Color: "Honey Blonde" }, price: 74.99, stock: 3 },
    ],
  },
  {
    category: "wigs",
    title: "Kinky Straight Headband Wig",
    featured: true,
    description: "Blow-out kinky straight texture on a no-lace headband base. Beginner friendly, ready in minutes.",
    optionNames: ["Length"],
    variants: [
      { options: { Length: '16"' }, price: 89.99, compareAt: 109.99, stock: 5 },
      { options: { Length: '20"' }, price: 109.99, compareAt: 129.99, stock: 0 },
    ],
  },
  {
    category: "bundles-extensions",
    title: "Brazilian Straight Bundle",
    badge: "bestseller",
    featured: true,
    description: "Double-weft virgin human hair bundle. Can be colored and heat styled.",
    optionNames: ["Length"],
    variants: [
      { options: { Length: '14"' }, price: 49.99, stock: 12 },
      { options: { Length: '18"' }, price: 64.99, stock: 9 },
      { options: { Length: '22"' }, price: 79.99, stock: 7 },
    ],
  },
  {
    category: "bundles-extensions",
    title: "Clip-In Curly Ponytail",
    badge: "new",
    description: "Drawstring ponytail with two combs for a sleek, full look in seconds.",
    optionNames: ["Color"],
    variants: [
      { options: { Color: "1B" }, price: 29.99, stock: 15 },
      { options: { Color: "Burgundy" }, price: 29.99, stock: 4 },
    ],
  },
  {
    category: "braiding-hair",
    title: "Pre-Stretched Braiding Hair 3-Pack",
    badge: "bestseller",
    featured: true,
    description: "Itch-free, hot-water-set, pre-stretched braiding hair. Three packs per box.",
    optionNames: ["Color"],
    variants: [
      { options: { Color: "1B" }, price: 12.99, stock: 40 },
      { options: { Color: "2" }, price: 12.99, stock: 25 },
      { options: { Color: "27" }, price: 12.99, stock: 11 },
      { options: { Color: "613" }, price: 12.99, stock: 6 },
    ],
  },
  {
    category: "braiding-hair",
    title: "Crochet Passion Twist Hair",
    description: "Pre-looped passion twists for quick crochet installs.",
    optionNames: ["Length"],
    variants: [
      { options: { Length: '18"' }, price: 9.99, stock: 20 },
      { options: { Length: '24"' }, price: 11.99, stock: 14 },
    ],
  },
  {
    category: "hair-care",
    title: "Extra Hold Edge Control",
    badge: "bestseller",
    featured: true,
    description: "Flake-free edge control with castor oil. Strong hold without the white residue.",
    optionNames: ["Size"],
    variants: [{ options: { Size: "2.25 oz" }, price: 8.99, stock: 30 }],
  },
  {
    category: "hair-care",
    title: "Moisture Repair Leave-In Conditioner",
    description: "Lightweight leave-in that detangles, softens and protects natural hair and wigs.",
    optionNames: ["Size"],
    variants: [
      { options: { Size: "8 oz" }, price: 11.49, stock: 18 },
      { options: { Size: "16 oz" }, price: 18.99, stock: 7 },
    ],
  },
  {
    category: "hair-care",
    title: "Wig & Weave Shine Spray",
    badge: "new",
    description: "Silky, weightless shine for synthetic and human hair units.",
    optionNames: ["Size"],
    variants: [{ options: { Size: "4 oz" }, price: 7.99, stock: 22 }],
  },
  {
    category: "cosmetics",
    title: "3D Mink-Effect Lashes",
    featured: true,
    description: "Reusable, lightweight lashes with a comfortable cotton band.",
    optionNames: ["Style"],
    variants: [
      { options: { Style: "Natural" }, price: 6.99, stock: 35 },
      { options: { Style: "Dramatic" }, price: 6.99, stock: 28 },
    ],
  },
  {
    category: "cosmetics",
    title: "Velvet Matte Liquid Lipstick",
    badge: "limited",
    description: "Long-wear matte lip color that stays comfortable all day.",
    optionNames: ["Shade"],
    variants: [
      { options: { Shade: "Orchid" }, price: 9.99, stock: 9 },
      { options: { Shade: "Cocoa" }, price: 9.99, stock: 12 },
      { options: { Shade: "Berry" }, price: 9.99, stock: 1 },
    ],
  },
  {
    category: "beauty-tools",
    title: "Satin-Lined Sleep Bonnet",
    featured: true,
    description: "Double-layer satin bonnet with an adjustable band to protect styles overnight.",
    optionNames: ["Color"],
    variants: [
      { options: { Color: "Lavender" }, price: 7.99, stock: 24 },
      { options: { Color: "Black" }, price: 7.99, stock: 17 },
    ],
  },
  {
    category: "beauty-tools",
    title: "Stocking Wig Caps 2-Pack",
    description: "Stretchy, breathable caps for a smooth wig base.",
    optionNames: ["Color"],
    variants: [
      { options: { Color: "Brown" }, price: 2.99, stock: 60 },
      { options: { Color: "Black" }, price: 2.99, stock: 48 },
    ],
  },
  {
    category: "beauty-tools",
    title: 'Ceramic Flat Iron 1"',
    badge: "sale",
    description: "Even-heat ceramic plates, adjustable temperature up to 450°F and auto shut-off.",
    optionNames: ["Plate"],
    variants: [{ options: { Plate: '1"' }, price: 34.99, compareAt: 44.99, stock: 5 }],
  },
];

function slugify(s: string) {
  return s.toLowerCase().replace(/["']/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function remove() {
  const demo = await db().select({ id: products.id }).from(products).where(eq(products.brand, "Demo"));
  if (demo.length) {
    const ids = demo.map((d) => d.id);
    await db().transaction(async (tx) => {
      const vs = await tx.select({ id: productVariants.id }).from(productVariants).where(inArray(productVariants.productId, ids));
      // Demo stock history is the one ledger we allow to be removed.
      await tx.execute(sql`alter table stock_movements disable trigger stock_movements_no_update`);
      if (vs.length) await tx.delete(stockMovements).where(inArray(stockMovements.variantId, vs.map((v) => v.id)));
      await tx.execute(sql`alter table stock_movements enable trigger stock_movements_no_update`);
      await tx.delete(products).where(inArray(products.id, ids));
    });
  }
  console.log(`Removed ${demo.length} demo products.`);
}

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_SEED !== "1") {
    throw new Error("Refusing to seed demo products in production. Set ALLOW_DEMO_SEED=1 to override on staging.");
  }
  if (process.argv.includes("--remove")) return remove();

  const loc = await db().query.locations.findFirst({ where: eq(locations.isDefault, true) });
  if (!loc) throw new Error("Run npm run db:seed first.");
  const cats = await db().select().from(categories);
  let created = 0;
  for (const [i, d] of DEMO.entries()) {
    const slug = slugify(d.title);
    const exists = await db().query.products.findFirst({ where: eq(products.slug, slug) });
    if (exists) continue;
    const cat = cats.find((c) => c.slug === d.category);
    await db().transaction(async (tx) => {
      const [p] = await tx
        .insert(products)
        .values({
          slug,
          title: d.title,
          description: d.description,
          brand: "Demo",
          categoryId: cat?.id ?? null,
          status: "active",
          badge: d.badge ?? null,
          featured: d.featured ?? false,
          optionNames: d.optionNames,
          createdAt: new Date(Date.now() - (DEMO.length - i) * 3600_000),
        })
        .returning();
      for (const [j, v] of d.variants.entries()) {
        const sku = `DEMO-${slug.slice(0, 18).toUpperCase()}-${j + 1}`;
        const [variant] = await tx
          .insert(productVariants)
          .values({
            productId: p.id,
            sku,
            options: v.options,
            priceCents: Math.round(v.price * 100),
            compareAtCents: v.compareAt ? Math.round(v.compareAt * 100) : null,
            sortOrder: j,
          })
          .returning();
        await tx.insert(inventoryBalances).values({ variantId: variant.id, locationId: loc.id, onHand: v.stock, safetyStock: 0 });
        if (v.stock) {
          await tx.insert(stockMovements).values({
            variantId: variant.id,
            locationId: loc.id,
            quantityDelta: v.stock,
            onHandAfter: v.stock,
            movementType: "initial_import",
            sourceType: "demo_seed",
            reason: "Demo stock",
          });
        }
      }
    });
    created++;
  }
  console.log(`Created ${created} demo products.`);
}

main()
  .then(() => pool().end())
  .catch(async (err) => {
    console.error(err);
    await pool().end();
    process.exit(1);
  });

void and;
