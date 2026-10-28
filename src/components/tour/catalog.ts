/**
 * Sample catalogue for the 3D store ("Walk the store").
 *
 * These are display samples only, with invented brands, so the tour looks like a fully
 * stocked shop while the real catalogue is being built. The tour reads products through
 * the TourProduct shape, so switching to the live catalogue later only replaces this data
 * source; the 3D store itself does not change.
 */

export type SectionKey = "wigs" | "bundles" | "braiding" | "haircare" | "cosmetics" | "tools" | "featured";

export type HairStyle = "straight" | "body" | "deep" | "kinky" | "bob" | "curly" | "pixie" | "braids" | "water";

export type ModelSpec =
  | { kind: "wig"; style: HairStyle; length: number; colors: [string, string?]; skin?: string }
  | { kind: "bundle"; texture: HairStyle; color: string; length: number }
  | { kind: "braid"; colors: [string, string?]; style: "stretched" | "kanekalon" | "crochet" | "locs" }
  | { kind: "bottle"; shape: "shampoo" | "pump" | "jar" | "spray" | "tube" | "oil" | "gel"; color: string; cap: string; label: string }
  | { kind: "cosmetic"; shape: "lipstick" | "palette" | "foundation" | "gloss" | "compact" | "lashes" | "polish"; color: string; accent?: string }
  | { kind: "tool"; shape: "paddle" | "comb" | "flatiron" | "dryer" | "bonnet" | "wand" | "brushset" | "mirror"; color: string; accent?: string }
  /** A real product photographed in the Garner store, shown on the shelf as a framed photo display. */
  | { kind: "photo" };

export type TourProduct = {
  id: string;
  section: Exclude<SectionKey, "featured">;
  name: string;
  /** Short name printed on packaging and shelf labels. */
  short: string;
  brand: string;
  /** null = price not published; the panel says "Price in store". */
  priceCents: number | null;
  compareAtCents?: number;
  badge?: "New" | "Best seller" | "Sale" | "Limited" | "In store";
  /** Real photos from the store (first one is the main photo). */
  photos?: string[];
  rating: number;
  reviews: number;
  description: string;
  options?: { name: string; values: string[] }[];
  featured?: boolean;
  model: ModelSpec;
};

export type TourSection = {
  key: SectionKey;
  name: string;
  /** Short label for chips and the map. */
  label: string;
  aisle: string;
  blurb: string;
  /** Category page in the shop for "browse this section". */
  shopHref: string;
};

export const SECTIONS: TourSection[] = [
  { key: "wigs", name: "The Wig Wall", label: "Wigs", aisle: "Aisle 1", blurb: "Lace fronts, glueless units, bobs and curls on display heads.", shopHref: "/wigs" },
  { key: "bundles", name: "Bundles & Extensions", label: "Bundles", aisle: "Aisle 1", blurb: "Human-hair bundles, closures and clip-ins in every texture.", shopHref: "/bundles-extensions" },
  { key: "braiding", name: "Braiding Hair", label: "Braiding", aisle: "Aisle 2", blurb: "Pre-stretched, kanekalon, crochet and locs in every shade.", shopHref: "/braiding-hair" },
  { key: "haircare", name: "Hair Care", label: "Hair care", aisle: "Aisle 2", blurb: "Wash day, edges, oils, gels and leave-ins.", shopHref: "/hair-care" },
  { key: "cosmetics", name: "Cosmetics", label: "Cosmetics", aisle: "Aisle 3", blurb: "Lips, lashes, base and nails.", shopHref: "/cosmetics" },
  { key: "tools", name: "Beauty Tools", label: "Tools", aisle: "Aisle 3", blurb: "Irons, dryers, brushes and bonnets.", shopHref: "/beauty-tools" },
  { key: "featured", name: "Best Sellers", label: "Best sellers", aisle: "Back wall", blurb: "What our sisters keep coming back for.", shopHref: "/shop?sort=featured" },
];

const C = {
  jet: "#121014",
  natural: "#1f1714",
  darkBrown: "#3b2418",
  chestnut: "#6a3a22",
  auburn: "#8a3a1f",
  honey: "#b7813f",
  blonde: "#d9b26f",
  platinum: "#e8dcc4",
  burgundy: "#5e1424",
  copper: "#a5502a",
  grey: "#9a9497",
  pink: "#e889b5",
  blue: "#3b6fd8",
  lilac: "#a98ae8",
};

const LENGTHS = ['12"', '14"', '16"', '18"', '20"', '22"', '24"', '26"', '28"', '30"'];

/** The store's own number, for "call to check stock" on products without a listed price. */
export const STORE_PHONE = "(919) 803-6420";

const P = (f: string) => `/store-photos/${f}.webp`;

/** Products photographed in the Garner store. They lead each section so they're the first thing you see. */
const REAL_PRODUCTS: TourProduct[] = [
  {
    id: "real-goddess-locs", section: "wigs", name: "Goddess Locs Wig", short: "Goddess Locs Wig", brand: "Fine Looks Hair & Beauty",
    priceCents: 2999, badge: "In store", rating: 4.9, reviews: 0, featured: true,
    description: "Pre-twisted goddess locs with curly ends on a ready-to-wear cap, as displayed in our Garner store.",
    photos: [P("wig-goddess-locs")], model: { kind: "photo" },
  },
  {
    id: "real-fake-scalp", section: "wigs", name: "HD Fake Scalp Body Wave Lace Wig", short: "Fake Scalp Body Wave", brand: "In store now",
    priceCents: null, badge: "In store", rating: 0, reviews: 0, featured: true,
    description: "Long body wave lace wig with a natural-looking fake scalp part. Ask in store about lengths and today's price.",
    photos: [P("wig-fake-scalp-body-wave")], model: { kind: "photo" },
  },
  {
    id: "real-straight-layered", section: "wigs", name: "Straight Layered Wig with Side Bangs", short: "Layered Straight", brand: "In store now",
    priceCents: null, badge: "In store", rating: 0, reviews: 0,
    description: "Soft brown layered straight wig with face-framing side bangs.",
    photos: [P("wig-straight-layered"), P("wig-straight-layered-side")], model: { kind: "photo" },
  },
  {
    id: "real-side-part-lace", section: "wigs", name: "Side-Part Lace Front Wig", short: "Side-Part Lace", brand: "In store now",
    priceCents: null, badge: "In store", rating: 0, reviews: 0,
    description: "Jet black lace front with a deep side part and soft layers.",
    photos: [P("wig-side-part-lace")], model: { kind: "photo" },
  },
  {
    id: "real-ombre-wavy-headband", section: "wigs", name: "Ombré Body Wave Headband Wig", short: "Ombré Headband Wig", brand: "In store now",
    priceCents: null, badge: "In store", rating: 0, reviews: 0,
    description: "Throw-on-and-go headband wig with a dark root melting into honey blonde waves.",
    photos: [P("wig-ombre-wavy-headband")], model: { kind: "photo" },
  },
  {
    id: "real-burgundy-headband", section: "wigs", name: "Burgundy Ombré Straight Headband Wig", short: "Burgundy Headband Wig", brand: "In store now",
    priceCents: null, badge: "In store", rating: 0, reviews: 0,
    description: "Sleek straight headband wig, black root to deep burgundy.",
    photos: [P("wig-burgundy-headband")], model: { kind: "photo" },
  },
  {
    id: "real-copper-curly-headband", section: "wigs", name: "Copper Curly Headband Wig", short: "Copper Curly Wig", brand: "In store now",
    priceCents: null, badge: "In store", rating: 0, reviews: 0,
    description: "Big, bouncy copper curls on a comfortable headband base.",
    photos: [P("wig-copper-curly-headband")], model: { kind: "photo" },
  },
  {
    id: "real-curly-ombre-headband", section: "wigs", name: "Curly Ombré Headband Wig", short: "Curly Ombré Wig", brand: "In store now",
    priceCents: null, badge: "In store", rating: 0, reviews: 0,
    description: "Defined curls with a dark root fading to golden blonde, on a headband base.",
    photos: [P("wig-curly-ombre-headband")], model: { kind: "photo" },
  },
  {
    id: "real-soft-locs-36", section: "braiding", name: 'Fine Looks Soft Locs 36"', short: 'Soft Locs 36"', brand: "Fine Looks Hair & Beauty",
    priceCents: 1299, badge: "In store", rating: 4.9, reviews: 0, featured: true,
    description: "Our own Fine Looks soft locs, 36 inches, packed and priced in store. Light, soft and ready to crochet.",
    options: [{ name: "Color", values: ["Honey Blonde", "Light Brown", "Auburn Brown", "Natural Black"] }],
    photos: [P("locs-soft-36")], model: { kind: "photo" },
  },
];

const SAMPLE_PRODUCTS: TourProduct[] = [
  /* ------------------------------ Wigs ------------------------------ */
  {
    id: "w1", section: "wigs", name: "Body Wave 13x4 HD Lace Front Wig", short: "Body Wave 13x4", brand: "Crown & Glory",
    priceCents: 18999, compareAtCents: 22999, badge: "Best seller", rating: 4.9, reviews: 312, featured: true,
    description: "Pre-plucked HD lace that melts into every skin tone, bleached knots and a soft, bouncy body wave that holds after washing. 180% density.",
    options: [{ name: "Length", values: LENGTHS.slice(4, 9) }, { name: "Color", values: ["Natural Black", "1B/30 Ombré", "Honey Blonde"] }],
    model: { kind: "wig", style: "body", length: 0.9, colors: [C.natural] },
  },
  {
    id: "w2", section: "wigs", name: "Glueless Bob Wig with Bangs", short: "Glueless Bob", brand: "Silk Royale",
    priceCents: 8999, badge: "New", rating: 4.8, reviews: 96,
    description: "Wear-and-go bob with full bangs, adjustable band and no glue needed. Ready in two minutes.",
    options: [{ name: "Length", values: ['10"', '12"', '14"'] }, { name: "Color", values: ["Jet Black", "Honey Blonde", "Burgundy"] }],
    model: { kind: "wig", style: "bob", length: 0.25, colors: [C.honey] },
  },
  {
    id: "w3", section: "wigs", name: "Kinky Straight Headband Wig", short: "Kinky Straight", brand: "Kinky Muse",
    priceCents: 7499, rating: 4.7, reviews: 141,
    description: "Natural blow-out texture on a no-lace headband base that is protective, breathable and beginner friendly.",
    options: [{ name: "Length", values: LENGTHS.slice(2, 7) }],
    model: { kind: "wig", style: "kinky", length: 0.75, colors: [C.darkBrown] },
  },
  {
    id: "w4", section: "wigs", name: "Deep Wave 5x5 Closure Wig", short: "Deep Wave 5x5", brand: "Crown & Glory",
    priceCents: 15999, rating: 4.8, reviews: 204,
    description: "Defined deep-wave curls on a 5x5 HD closure. Wet-and-wavy friendly, 200% density.",
    options: [{ name: "Length", values: LENGTHS.slice(3, 9) }],
    model: { kind: "wig", style: "deep", length: 0.85, colors: [C.natural] },
  },
  {
    id: "w5", section: "wigs", name: "1B/30 Ombré Straight Lace Wig", short: "Ombré 1B/30", brand: "Fine Looks Signature",
    priceCents: 21999, badge: "Limited", rating: 5.0, reviews: 58, featured: true,
    description: "Dark root melting into a warm auburn 30 for dimension that looks salon fresh. 13x6 deep part.",
    options: [{ name: "Length", values: LENGTHS.slice(5, 10) }],
    model: { kind: "wig", style: "straight", length: 1, colors: [C.natural, C.copper] },
  },
  {
    id: "w6", section: "wigs", name: "Pixie Curl Short Cut Wig", short: "Pixie Curl", brand: "Silk Royale",
    priceCents: 5999, rating: 4.6, reviews: 77,
    description: "A tapered, curly pixie that is lightweight, cool and ready to wear.",
    options: [{ name: "Color", values: ["Natural Black", "Copper", "Platinum"] }],
    model: { kind: "wig", style: "pixie", length: 0.1, colors: [C.copper] },
  },
  {
    id: "w7", section: "wigs", name: "Water Wave Glueless Wig", short: "Water Wave", brand: "Crown & Glory",
    priceCents: 16999, rating: 4.8, reviews: 133,
    description: "Glossy water-wave pattern with pre-cut lace and an elastic band. Wear it glueless or melted.",
    options: [{ name: "Length", values: LENGTHS.slice(4, 9) }],
    model: { kind: "wig", style: "water", length: 0.85, colors: [C.jet] },
  },
  {
    id: "w8", section: "wigs", name: "Burgundy 99J Body Wave Wig", short: "99J Body Wave", brand: "Fine Looks Signature",
    priceCents: 17999, badge: "New", rating: 4.9, reviews: 42,
    description: "Rich wine-red 99J that shines under any light, on a soft body wave with a pre-plucked hairline.",
    options: [{ name: "Length", values: LENGTHS.slice(4, 8) }],
    model: { kind: "wig", style: "body", length: 0.8, colors: [C.burgundy] },
  },
  {
    id: "w9", section: "wigs", name: "Knotless Box Braid Wig", short: "Box Braid Wig", brand: "Kinky Muse",
    priceCents: 12999, rating: 4.7, reviews: 88,
    description: "Hand-braided knotless box braids on a full lace cap. All the look, none of the chair time.",
    options: [{ name: "Length", values: ['26"', '30"', '36"'] }],
    model: { kind: "wig", style: "braids", length: 1, colors: [C.natural] },
  },
  {
    id: "w10", section: "wigs", name: "Platinum Curly Lace Wig", short: "Platinum Curly", brand: "Silk Royale",
    priceCents: 19999, rating: 4.8, reviews: 61,
    description: "Bold platinum 613 in big, springy curls. Bleached by hand, so it's ready to tone or wear as is.",
    options: [{ name: "Length", values: LENGTHS.slice(3, 7) }],
    model: { kind: "wig", style: "curly", length: 0.6, colors: [C.platinum] },
  },

  /* ---------------------------- Bundles ----------------------------- */
  {
    id: "b1", section: "bundles", name: "Brazilian Straight Bundles (3 pack)", short: "Brazilian Straight", brand: "Crown & Glory",
    priceCents: 11999, badge: "Best seller", rating: 4.9, reviews: 288, featured: true,
    description: "Silky, double-wefted virgin hair with minimal shedding. Can be dyed, bleached and heat styled.",
    options: [{ name: "Lengths", values: ['14/16/18"', '18/20/22"', '22/24/26"'] }],
    model: { kind: "bundle", texture: "straight", color: C.natural, length: 0.9 },
  },
  {
    id: "b2", section: "bundles", name: "Peruvian Body Wave Bundles (3 pack)", short: "Peruvian Body Wave", brand: "Crown & Glory",
    priceCents: 12999, rating: 4.8, reviews: 176,
    description: "Full from top to tip, with a soft S-wave that keeps its pattern wash after wash.",
    options: [{ name: "Lengths", values: ['16/18/20"', '20/22/24"'] }],
    model: { kind: "bundle", texture: "body", color: C.natural, length: 0.85 },
  },
  {
    id: "b3", section: "bundles", name: "Deep Wave Bundles with 4x4 Closure", short: "Deep Wave + Closure", brand: "Silk Royale",
    priceCents: 15999, rating: 4.7, reviews: 92,
    description: "Matching bundles and HD closure for a complete sew-in.",
    options: [{ name: "Lengths", values: ['16/18/20" + 14"', '20/22/24" + 16"'] }],
    model: { kind: "bundle", texture: "deep", color: C.jet, length: 0.8 },
  },
  {
    id: "b4", section: "bundles", name: "Kinky Curly Clip-In Extensions", short: "Kinky Curly Clip-In", brand: "Kinky Muse",
    priceCents: 8999, badge: "New", rating: 4.8, reviews: 54,
    description: "Seven-piece clip-in set that blends with 4A–4C natural hair. Instant volume, no leave-out stress.",
    options: [{ name: "Length", values: ['14"', '18"', '22"'] }],
    model: { kind: "bundle", texture: "kinky", color: C.darkBrown, length: 0.7 },
  },
  {
    id: "b5", section: "bundles", name: "Honey Blonde #27 Straight Bundles", short: "#27 Straight", brand: "Silk Royale",
    priceCents: 13999, rating: 4.6, reviews: 47,
    description: "Pre-colored honey blonde, gentle on the cuticle and ready to install.",
    options: [{ name: "Lengths", values: ['16/18/20"', '20/22/24"'] }],
    model: { kind: "bundle", texture: "straight", color: C.honey, length: 0.85 },
  },
  {
    id: "b6", section: "bundles", name: "Water Wave Bundles (3 pack)", short: "Water Wave", brand: "Crown & Glory",
    priceCents: 12499, rating: 4.7, reviews: 83,
    description: "Defined wet-look ripples. Spritz with water and leave-in to revive.",
    options: [{ name: "Lengths", values: ['18/20/22"', '22/24/26"'] }],
    model: { kind: "bundle", texture: "water", color: C.natural, length: 0.9 },
  },
  {
    id: "b7", section: "bundles", name: "Ombré 1B/30 Body Wave Bundles", short: "1B/30 Body Wave", brand: "Fine Looks Signature",
    priceCents: 14999, rating: 4.8, reviews: 39,
    description: "Dark root to auburn tip, so your sew-in comes out ombré with no salon color needed.",
    options: [{ name: "Lengths", values: ['16/18/20"', '20/22/24"'] }],
    model: { kind: "bundle", texture: "body", color: C.copper, length: 0.85 },
  },
  {
    id: "b8", section: "bundles", name: "Silky Straight Tape-In Extensions", short: "Tape-In Silky", brand: "Silk Royale",
    priceCents: 9999, rating: 4.5, reviews: 28,
    description: "Forty seamless tape wefts that lie flat and are reusable with fresh tape.",
    options: [{ name: "Length", values: ['16"', '20"', '24"'] }],
    model: { kind: "bundle", texture: "straight", color: C.chestnut, length: 0.8 },
  },

  /* ---------------------------- Braiding ---------------------------- */
  {
    id: "r1", section: "braiding", name: "Pre-Stretched Braiding Hair 1B", short: "Pre-Stretched 1B", brand: "Edge Society",
    priceCents: 699, badge: "Best seller", rating: 4.9, reviews: 540, featured: true,
    description: "Feathered ends, itch-free and hot-water set. 3 packs do a full head of medium knotless.",
    options: [{ name: "Length", values: ['26"', '30"', '36"'] }],
    model: { kind: "braid", colors: [C.jet], style: "stretched" },
  },
  {
    id: "r2", section: "braiding", name: "Pre-Stretched Braiding Hair #27", short: "Pre-Stretched #27", brand: "Edge Society",
    priceCents: 699, rating: 4.8, reviews: 212,
    description: "Warm honey blonde for peekaboos and boho knotless.",
    options: [{ name: "Length", values: ['26"', '30"'] }],
    model: { kind: "braid", colors: [C.honey], style: "stretched" },
  },
  {
    id: "r3", section: "braiding", name: "Ombré Braiding Hair 1B/30", short: "Ombré 1B/30", brand: "Edge Society",
    priceCents: 799, rating: 4.8, reviews: 188,
    description: "A two-tone fade built in, so every braid matches.",
    options: [{ name: "Length", values: ['26"', '30"'] }],
    model: { kind: "braid", colors: [C.jet, C.copper], style: "stretched" },
  },
  {
    id: "r4", section: "braiding", name: "Kanekalon Jumbo Braid 2 Natural Brown", short: "Jumbo Braid #2", brand: "Velour Crown",
    priceCents: 499, rating: 4.6, reviews: 302,
    description: "Classic jumbo braid with a soft yaki texture that seals with hot water.",
    model: { kind: "braid", colors: [C.darkBrown], style: "kanekalon" },
  },
  {
    id: "r5", section: "braiding", name: "Passion Twist Crochet Hair", short: "Passion Twist", brand: "Velour Crown",
    priceCents: 899, badge: "New", rating: 4.7, reviews: 97,
    description: "Pre-looped bohemian passion twists. Install in an afternoon.",
    options: [{ name: "Length", values: ['18"', '24"'] }],
    model: { kind: "braid", colors: [C.natural], style: "crochet" },
  },
  {
    id: "r6", section: "braiding", name: "Soft Locs Crochet Hair", short: "Soft Locs", brand: "Velour Crown",
    priceCents: 1099, rating: 4.8, reviews: 120,
    description: "Lightweight, pre-looped soft locs with distressed ends.",
    options: [{ name: "Length", values: ['18"', '24"', '36"'] }],
    model: { kind: "braid", colors: [C.darkBrown, C.honey], style: "locs" },
  },
  {
    id: "r7", section: "braiding", name: "Pre-Stretched Braiding Hair Burgundy", short: "Pre-Stretched 99J", brand: "Edge Society",
    priceCents: 699, rating: 4.7, reviews: 76,
    description: "Deep wine 99J for a bold, rich braid.",
    model: { kind: "braid", colors: [C.burgundy], style: "stretched" },
  },
  {
    id: "r8", section: "braiding", name: "Pastel Pink Braiding Hair", short: "Pastel Pink", brand: "Edge Society",
    priceCents: 699, rating: 4.6, reviews: 44,
    description: "Fun color for festival braids and peekaboos.",
    model: { kind: "braid", colors: [C.pink], style: "stretched" },
  },
  {
    id: "r9", section: "braiding", name: "Royal Blue Braiding Hair", short: "Royal Blue", brand: "Edge Society",
    priceCents: 699, rating: 4.5, reviews: 31,
    description: "Saturated royal blue that doesn't fade under the sun.",
    model: { kind: "braid", colors: [C.blue], style: "stretched" },
  },
  {
    id: "r10", section: "braiding", name: "Ombré Grey Braiding Hair", short: "Ombré Grey", brand: "Velour Crown",
    priceCents: 799, rating: 4.7, reviews: 52,
    description: "Black to silver, a soft and elegant fade.",
    model: { kind: "braid", colors: [C.jet, C.grey], style: "kanekalon" },
  },

  /* ---------------------------- Hair care --------------------------- */
  {
    id: "h1", section: "haircare", name: "Moisture Rich Shampoo", short: "Moisture Shampoo", brand: "Melanin Botanics",
    priceCents: 1299, badge: "Best seller", rating: 4.8, reviews: 410, featured: true,
    description: "Sulfate-free cleanse with shea and aloe. Cleans without stripping.",
    options: [{ name: "Size", values: ["8 oz", "16 oz"] }],
    model: { kind: "bottle", shape: "shampoo", color: "#f4e6d4", cap: "#6a3a22", label: "#5238de" },
  },
  {
    id: "h2", section: "haircare", name: "Deep Repair Conditioner", short: "Deep Conditioner", brand: "Melanin Botanics",
    priceCents: 1399, rating: 4.8, reviews: 266,
    description: "Rich, slippy detangling with argan and protein for stronger strands.",
    options: [{ name: "Size", values: ["8 oz", "16 oz"] }],
    model: { kind: "bottle", shape: "pump", color: "#f8ebf8", cap: "#1e1433", label: "#b84af6" },
  },
  {
    id: "h3", section: "haircare", name: "Extra Hold Edge Control", short: "Edge Control", brand: "Edge Society",
    priceCents: 899, badge: "Best seller", rating: 4.9, reviews: 702, featured: true,
    description: "Sleek, flake-free edges that hold for 24 hours. Lightly scented with lavender.",
    options: [{ name: "Scent", values: ["Lavender", "Honey", "Unscented"] }],
    model: { kind: "bottle", shape: "jar", color: "#1e1433", cap: "#b84af6", label: "#ffffff" },
  },
  {
    id: "h4", section: "haircare", name: "Wig & Lace Holding Spray", short: "Lace Hold Spray", brand: "Crown & Glory",
    priceCents: 1099, rating: 4.7, reviews: 188,
    description: "Melts and holds lace with no white residue. Water-resistant.",
    model: { kind: "bottle", shape: "spray", color: "#e7e2fb", cap: "#5238de", label: "#1e1433" },
  },
  {
    id: "h5", section: "haircare", name: "Jamaican Black Castor Oil", short: "Castor Oil", brand: "Melanin Botanics",
    priceCents: 999, rating: 4.9, reviews: 355,
    description: "Pure, roasted JBCO for scalp, edges and brows.",
    options: [{ name: "Size", values: ["4 oz", "8 oz"] }],
    model: { kind: "bottle", shape: "oil", color: "#2a160c", cap: "#d9b26f", label: "#d9b26f" },
  },
  {
    id: "h6", section: "haircare", name: "Curl Defining Custard", short: "Curl Custard", brand: "Kinky Muse",
    priceCents: 1499, rating: 4.7, reviews: 142,
    description: "Clumps and defines coils with soft, touchable hold.",
    model: { kind: "bottle", shape: "jar", color: "#fbe3ef", cap: "#e889b5", label: "#5e1424" },
  },
  {
    id: "h7", section: "haircare", name: "Leave-In Detangler Spray", short: "Leave-In Spray", brand: "Kinky Muse",
    priceCents: 1199, rating: 4.8, reviews: 201,
    description: "Instant slip for knots and tangles, with heat protection up to 230°C.",
    model: { kind: "bottle", shape: "spray", color: "#fff4e6", cap: "#b7813f", label: "#5238de" },
  },
  {
    id: "h8", section: "haircare", name: "Braid & Loc Sheen Spray", short: "Sheen Spray", brand: "Edge Society",
    priceCents: 799, rating: 4.6, reviews: 98,
    description: "Lightweight shine that soothes itchy scalps under braids.",
    model: { kind: "bottle", shape: "spray", color: "#d6f0ea", cap: "#1e1433", label: "#1e1433" },
  },
  {
    id: "h9", section: "haircare", name: "Styling Gel Maximum Hold", short: "Styling Gel", brand: "Edge Society",
    priceCents: 699, rating: 4.7, reviews: 166,
    description: "Crystal-clear gel for sleek ponytails and slick backs.",
    options: [{ name: "Size", values: ["16 oz", "32 oz"] }],
    model: { kind: "bottle", shape: "gel", color: "#9ad1ff", cap: "#1e1433", label: "#ffffff" },
  },
  {
    id: "h10", section: "haircare", name: "Scalp Growth Serum", short: "Growth Serum", brand: "Melanin Botanics",
    priceCents: 1899, badge: "New", rating: 4.8, reviews: 63,
    description: "Rosemary, peppermint and biotin in a dropper for targeted care.",
    model: { kind: "bottle", shape: "oil", color: "#3c2d6b", cap: "#ffffff", label: "#b84af6" },
  },
  {
    id: "h11", section: "haircare", name: "Hydrating Hair Mask", short: "Hair Mask", brand: "Melanin Botanics",
    priceCents: 1699, rating: 4.9, reviews: 121,
    description: "Ten-minute moisture mask with mango butter.",
    model: { kind: "bottle", shape: "jar", color: "#ffe3a3", cap: "#5238de", label: "#5238de" },
  },
  {
    id: "h12", section: "haircare", name: "Heat Protectant Cream", short: "Heat Protect", brand: "Silk Royale",
    priceCents: 1299, rating: 4.6, reviews: 74,
    description: "Silk-press ready protection with smoothing silk amino acids.",
    model: { kind: "bottle", shape: "tube", color: "#ffffff", cap: "#b84af6", label: "#5238de" },
  },

  /* ---------------------------- Cosmetics --------------------------- */
  {
    id: "c1", section: "cosmetics", name: "Velvet Matte Liquid Lipstick", short: "Velvet Matte Lip", brand: "Velvet Hue",
    priceCents: 1499, badge: "Best seller", rating: 4.8, reviews: 389, featured: true,
    description: "Featherweight matte that lasts all day without drying.",
    options: [{ name: "Shade", values: ["Berry", "Cocoa Nude", "Ruby", "Plum"] }],
    model: { kind: "cosmetic", shape: "gloss", color: "#8b1d3d" },
  },
  {
    id: "c2", section: "cosmetics", name: "Satin Bullet Lipstick", short: "Satin Lipstick", brand: "Velvet Hue",
    priceCents: 1299, rating: 4.7, reviews: 144,
    description: "Creamy satin color with vitamin E.",
    options: [{ name: "Shade", values: ["Brick", "Mauve", "Classic Red"] }],
    model: { kind: "cosmetic", shape: "lipstick", color: "#b4233a", accent: "#d9b26f" },
  },
  {
    id: "c3", section: "cosmetics", name: "Golden Hour Eyeshadow Palette", short: "Golden Hour Palette", brand: "Velvet Hue",
    priceCents: 2899, badge: "New", rating: 4.9, reviews: 88, featured: true,
    description: "Twelve buttery mattes and shimmers designed for deeper skin tones.",
    model: { kind: "cosmetic", shape: "palette", color: "#1e1433", accent: "#d9b26f" },
  },
  {
    id: "c4", section: "cosmetics", name: "Skin Tint Foundation", short: "Skin Tint", brand: "Velvet Hue",
    priceCents: 2499, rating: 4.7, reviews: 156,
    description: "Breathable medium coverage in 30 shades, mostly rich.",
    options: [{ name: "Shade", values: ["Caramel", "Mocha", "Espresso", "Ebony"] }],
    model: { kind: "cosmetic", shape: "foundation", color: "#7a4a2c" },
  },
  {
    id: "c5", section: "cosmetics", name: "Mink Effect Lashes", short: "Mink Lashes", brand: "Fine Looks Signature",
    priceCents: 999, rating: 4.8, reviews: 212,
    description: "Fluffy, reusable lashes on a soft cotton band. Reusable up to 20 times.",
    options: [{ name: "Style", values: ["Wispy", "Dramatic", "Natural"] }],
    model: { kind: "cosmetic", shape: "lashes", color: "#ffffff", accent: "#b84af6" },
  },
  {
    id: "c6", section: "cosmetics", name: "Pressed Setting Powder", short: "Setting Powder", brand: "Velvet Hue",
    priceCents: 1799, rating: 4.6, reviews: 92,
    description: "Blurs and sets with no flashback.",
    model: { kind: "cosmetic", shape: "compact", color: "#1e1433", accent: "#c08a5c" },
  },
  {
    id: "c7", section: "cosmetics", name: "Gel Nail Polish", short: "Gel Polish", brand: "Velvet Hue",
    priceCents: 899, rating: 4.5, reviews: 61,
    description: "Gel shine without the lamp. Chip resistant for seven days.",
    options: [{ name: "Shade", values: ["Orchid", "Nude", "Cherry"] }],
    model: { kind: "cosmetic", shape: "polish", color: "#b84af6" },
  },
  {
    id: "c8", section: "cosmetics", name: "High Shine Lip Gloss", short: "Lip Gloss", brand: "Velvet Hue",
    priceCents: 1099, rating: 4.7, reviews: 134,
    description: "Glassy, non-sticky shine with a peptide plump.",
    model: { kind: "cosmetic", shape: "gloss", color: "#e889b5" },
  },
  {
    id: "c9", section: "cosmetics", name: "Bronze Glow Highlighter", short: "Bronze Glow", brand: "Velvet Hue",
    priceCents: 1699, rating: 4.8, reviews: 77,
    description: "Molten gold glow for cheekbones and collarbones.",
    model: { kind: "cosmetic", shape: "compact", color: "#5238de", accent: "#d9a35a" },
  },
  {
    id: "c10", section: "cosmetics", name: "Nude Lip Liner Trio", short: "Lip Liner Trio", brand: "Velvet Hue",
    priceCents: 1199, rating: 4.6, reviews: 48,
    description: "Three creamy liners for the perfect brown-girl nude.",
    model: { kind: "cosmetic", shape: "lipstick", color: "#6b3a2a", accent: "#1e1433" },
  },
  {
    id: "c11", section: "cosmetics", name: "Berry Bliss Eyeshadow Palette", short: "Berry Palette", brand: "Velvet Hue",
    priceCents: 2499, rating: 4.7, reviews: 64,
    description: "Plums, berries and copper shimmers.",
    model: { kind: "cosmetic", shape: "palette", color: "#5e1424", accent: "#e889b5" },
  },
  {
    id: "c12", section: "cosmetics", name: "Dramatic Volume Lashes", short: "Volume Lashes", brand: "Fine Looks Signature",
    priceCents: 1199, rating: 4.8, reviews: 103,
    description: "Bold, layered 25mm volume.",
    model: { kind: "cosmetic", shape: "lashes", color: "#1e1433", accent: "#d9b26f" },
  },

  /* ------------------------------ Tools ----------------------------- */
  {
    id: "t1", section: "tools", name: 'Titanium Flat Iron 1"', short: "Titanium Flat Iron", brand: "Luxe Tools",
    priceCents: 7999, badge: "Best seller", rating: 4.9, reviews: 231, featured: true,
    description: "Floating titanium plates up to 450°F for silk presses that last.",
    model: { kind: "tool", shape: "flatiron", color: "#1e1433", accent: "#b84af6" },
  },
  {
    id: "t2", section: "tools", name: "Ionic Blow Dryer with Comb", short: "Ionic Dryer", brand: "Luxe Tools",
    priceCents: 5999, rating: 4.7, reviews: 119,
    description: "1875W ionic dryer with a pik comb attachment for stretched natural hair.",
    model: { kind: "tool", shape: "dryer", color: "#5238de", accent: "#ffffff" },
  },
  {
    id: "t3", section: "tools", name: "Boar Bristle Paddle Brush", short: "Paddle Brush", brand: "Luxe Tools",
    priceCents: 1499, rating: 4.8, reviews: 176,
    description: "Smooths wigs and distributes oils without breakage.",
    model: { kind: "tool", shape: "paddle", color: "#2a1c3d", accent: "#d9b26f" },
  },
  {
    id: "t4", section: "tools", name: "Rat Tail Parting Comb Set", short: "Parting Combs", brand: "Edge Society",
    priceCents: 599, rating: 4.7, reviews: 288,
    description: "Precise parts for braids and installs. Set of three.",
    model: { kind: "tool", shape: "comb", color: "#b84af6" },
  },
  {
    id: "t5", section: "tools", name: "Satin-Lined Sleep Bonnet", short: "Satin Bonnet", brand: "Fine Looks Signature",
    priceCents: 1299, badge: "New", rating: 4.9, reviews: 146,
    description: "Double-layer satin with an adjustable tie that protects your hair overnight.",
    options: [{ name: "Color", values: ["Orchid", "Black", "Leopard"] }],
    model: { kind: "tool", shape: "bonnet", color: "#b84af6", accent: "#5238de" },
  },
  {
    id: "t6", section: "tools", name: '1.25" Curling Wand', short: "Curling Wand", brand: "Luxe Tools",
    priceCents: 4999, rating: 4.6, reviews: 72,
    description: "Ceramic barrel for bouncy, lasting curls.",
    model: { kind: "tool", shape: "wand", color: "#e8dcc4", accent: "#1e1433" },
  },
  {
    id: "t7", section: "tools", name: "Edge Brush & Styling Set", short: "Edge Brush Set", brand: "Edge Society",
    priceCents: 799, rating: 4.8, reviews: 199,
    description: "Dual-sided edge brush, comb and silk scarf.",
    model: { kind: "tool", shape: "brushset", color: "#5238de", accent: "#b84af6" },
  },
  {
    id: "t8", section: "tools", name: "LED Vanity Mirror", short: "LED Mirror", brand: "Luxe Tools",
    priceCents: 3499, rating: 4.7, reviews: 58,
    description: "Three light modes and 10x magnification, rechargeable.",
    model: { kind: "tool", shape: "mirror", color: "#ffffff", accent: "#e7e2fb" },
  },
];

export const TOUR_PRODUCTS: TourProduct[] = [...REAL_PRODUCTS, ...SAMPLE_PRODUCTS];

/** Every photo the 3D store needs to load. */
export const TOUR_PHOTO_URLS = [...new Set(TOUR_PRODUCTS.flatMap((p) => p.photos ?? []))];

export const PRODUCT_BY_ID = new Map(TOUR_PRODUCTS.map((p) => [p.id, p]));

export function productsIn(section: SectionKey) {
  return section === "featured" ? TOUR_PRODUCTS.filter((p) => p.featured) : TOUR_PRODUCTS.filter((p) => p.section === section);
}

export function priceLabel(cents: number | null) {
  return cents == null ? "Price in store" : usd(cents);
}

export function usd(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
