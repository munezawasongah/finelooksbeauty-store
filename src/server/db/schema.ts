import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => ts("created_at").notNull().defaultNow();
const updatedAt = () => ts("updated_at").notNull().defaultNow();

/* ------------------------------------------------------------------ */
/* Enums                                                               */
/* ------------------------------------------------------------------ */

export const staffRole = pgEnum("staff_role", ["owner", "manager", "staff", "support"]);
export const productStatus = pgEnum("product_status", ["draft", "active", "archived"]);
export const orderStatus = pgEnum("order_status", [
  "pending_payment",
  "paid",
  "processing",
  "ready_for_pickup",
  "shipped",
  "delivered",
  "cancelled",
  "exception",
]);
export const paymentStatus = pgEnum("payment_status", [
  "unpaid",
  "paid",
  "failed",
  "partially_refunded",
  "refunded",
  "disputed",
]);
export const fulfillmentMethod = pgEnum("fulfillment_method", ["ship", "pickup"]);
export const reservationStatus = pgEnum("reservation_status", ["active", "committed", "released", "expired"]);
export const movementType = pgEnum("movement_type", [
  "initial_import",
  "sale_online",
  "sale_pos",
  "adjustment",
  "return_restock",
  "reconciliation",
  "pos_sync",
]);
export const eventStatus = pgEnum("event_status", ["pending", "processing", "processed", "failed", "ignored"]);
export const discountType = pgEnum("discount_type", ["percent", "fixed"]);
export const syncStatus = pgEnum("sync_status", ["ok", "pending", "error", "unmapped"]);

/* ------------------------------------------------------------------ */
/* Staff, customers, sessions                                          */
/* ------------------------------------------------------------------ */

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: staffRole("role").notNull().default("staff"),
    mfaSecretEnc: text("mfa_secret_enc"),
    mfaEnabled: boolean("mfa_enabled").notNull().default(false),
    /** Last accepted TOTP time step, so a code can never be replayed. */
    mfaLastStep: integer("mfa_last_step"),
    /** SHA-256 hashes of single-use recovery codes. */
    mfaRecoveryHashes: text("mfa_recovery_hashes").array().notNull().default(sql`'{}'::text[]`),
    failedLogins: integer("failed_logins").notNull().default(0),
    lockedUntil: ts("locked_until"),
    lastLoginAt: ts("last_login_at"),
    disabledAt: ts("disabled_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("users_email_uq").on(sql`lower(${t.email})`)],
);

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    phone: text("phone"),
    passwordHash: text("password_hash"),
    marketingOptIn: boolean("marketing_opt_in").notNull().default(false),
    failedLogins: integer("failed_logins").notNull().default(0),
    lockedUntil: ts("locked_until"),
    deletedAt: ts("deleted_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("customers_email_uq").on(sql`lower(${t.email})`)],
);

export const customerAddresses = pgTable("customer_addresses", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: uuid("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  line1: text("line1").notNull(),
  line2: text("line2"),
  city: text("city").notNull(),
  state: text("state").notNull(),
  zip: text("zip").notNull(),
  phone: text("phone"),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: createdAt(),
});

/** Session tokens are stored only as SHA-256 hashes. */
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    kind: text("kind", { enum: ["staff", "customer"] }).notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "cascade" }),
    mfaVerified: boolean("mfa_verified").notNull().default(false),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
    lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
    expiresAt: ts("expires_at").notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId), index("sessions_customer_idx").on(t.customerId)],
);

/** One-time tokens (password reset, staff invite). Stored hashed. */
export const authTokens = pgTable("auth_tokens", {
  id: text("id").primaryKey(),
  subjectType: text("subject_type", { enum: ["staff", "customer"] }).notNull(),
  subjectId: uuid("subject_id").notNull(),
  purpose: text("purpose", { enum: ["password_reset", "invite"] }).notNull(),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
  createdAt: createdAt(),
});

/** Known staff devices, used to alert on new-device admin sign-in. */
export const staffDevices = pgTable(
  "staff_devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    fingerprint: text("fingerprint").notNull(),
    firstSeenAt: createdAt(),
    lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("staff_devices_uq").on(t.userId, t.fingerprint)],
);

/* ------------------------------------------------------------------ */
/* Catalog                                                             */
/* ------------------------------------------------------------------ */

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    parentId: uuid("parent_id"),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    imageUrl: text("image_url"),
    sortOrder: integer("sort_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    noindex: boolean("noindex").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("categories_slug_uq").on(t.slug)],
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    brand: text("brand"),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    status: productStatus("status").notNull().default("draft"),
    badge: text("badge", { enum: ["bestseller", "new", "sale", "limited"] }),
    optionNames: text("option_names").array().notNull().default(sql`'{}'::text[]`),
    featured: boolean("featured").notNull().default(false),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    canonicalOverride: text("canonical_override"),
    noindex: boolean("noindex").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("products_slug_uq").on(t.slug),
    index("products_category_idx").on(t.categoryId),
    index("products_status_idx").on(t.status),
    index("products_brand_idx").on(t.brand),
  ],
);

/** Old slugs kept so changed product/category URLs 301-redirect. */
export const slugRedirects = pgTable(
  "slug_redirects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entity: text("entity", { enum: ["product", "category"] }).notNull(),
    fromSlug: text("from_slug").notNull(),
    entityId: uuid("entity_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("slug_redirects_uq").on(t.entity, t.fromSlug)],
);

export const productImages = pgTable(
  "product_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    alt: text("alt").notNull(),
    width: integer("width"),
    height: integer("height"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("product_images_product_idx").on(t.productId)],
);

export const productVariants = pgTable(
  "product_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    sku: text("sku").notNull(),
    barcode: text("barcode"),
    options: jsonb("options").$type<Record<string, string>>().notNull().default({}),
    priceCents: integer("price_cents").notNull(),
    compareAtCents: integer("compare_at_cents"),
    currency: text("currency").notNull().default("USD"),
    taxCode: text("tax_code"),
    weightOz: integer("weight_oz"),
    lowStockThreshold: integer("low_stock_threshold").notNull().default(3),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("variants_sku_uq").on(sql`upper(${t.sku})`),
    uniqueIndex("variants_barcode_uq").on(t.barcode).where(sql`${t.barcode} is not null`),
    index("variants_product_idx").on(t.productId),
    check("variants_price_nonneg", sql`${t.priceCents} >= 0`),
  ],
);

/* ------------------------------------------------------------------ */
/* Inventory                                                           */
/* ------------------------------------------------------------------ */

export const locations = pgTable(
  "locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    cloverMerchantId: text("clover_merchant_id"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("locations_code_uq").on(t.code)],
);

export const inventoryBalances = pgTable(
  "inventory_balances",
  {
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "restrict" }),
    onHand: integer("on_hand").notNull().default(0),
    reserved: integer("reserved").notNull().default(0),
    safetyStock: integer("safety_stock").notNull().default(0),
    version: integer("version").notNull().default(0),
    checkoutPaused: boolean("checkout_paused").notNull().default(false),
    /** manual | stale_sync | sync_error — automatic pauses are lifted automatically. */
    pauseReason: text("pause_reason"),
    lastSyncedAt: ts("last_synced_at"),
    lastSyncSource: text("last_sync_source"),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.variantId, t.locationId] }),
    check("balances_reserved_nonneg", sql`${t.reserved} >= 0`),
    check("balances_safety_nonneg", sql`${t.safetyStock} >= 0`),
  ],
);

/** Append-only ledger; every change to on_hand writes exactly one row. */
export const stockMovements = pgTable(
  "stock_movements",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    /** restrict: a variant with stock history can be archived, never hard-deleted. */
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "restrict" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),
    quantityDelta: integer("quantity_delta").notNull(),
    onHandAfter: integer("on_hand_after").notNull(),
    movementType: movementType("movement_type").notNull(),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id"),
    idempotencyKey: text("idempotency_key"),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    reason: text("reason"),
    createdAt: createdAt(),
  },
  (t) => [
    index("movements_variant_idx").on(t.variantId, t.createdAt),
    uniqueIndex("movements_idem_uq").on(t.idempotencyKey).where(sql`${t.idempotencyKey} is not null`),
  ],
);

export const stockReservations = pgTable(
  "stock_reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),
    quantity: integer("quantity").notNull(),
    status: reservationStatus("status").notNull().default("active"),
    expiresAt: ts("expires_at").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("reservations_order_variant_uq").on(t.orderId, t.variantId),
    index("reservations_active_idx").on(t.status, t.expiresAt),
    check("reservations_qty_pos", sql`${t.quantity} > 0`),
  ],
);

/* ------------------------------------------------------------------ */
/* Carts                                                               */
/* ------------------------------------------------------------------ */

export const carts = pgTable("carts", {
  id: text("id").primaryKey(),
  customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
  discountCode: text("discount_code"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const cartItems = pgTable(
  "cart_items",
  {
    cartId: text("cart_id")
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull(),
    addedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.cartId, t.variantId] }), check("cart_qty_pos", sql`${t.quantity} > 0`)],
);

/* ------------------------------------------------------------------ */
/* Orders, payments, refunds                                           */
/* ------------------------------------------------------------------ */

export type Address = {
  name: string;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone?: string | null;
};

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: text("number").notNull(),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    email: text("email"),
    phone: text("phone"),
    customerName: text("customer_name"),
    status: orderStatus("status").notNull().default("pending_payment"),
    paymentStatus: paymentStatus("payment_status").notNull().default("unpaid"),
    fulfillmentMethod: fulfillmentMethod("fulfillment_method").notNull(),
    shippingAddress: jsonb("shipping_address").$type<Address>(),
    shippingMethodId: uuid("shipping_method_id"),
    shippingLabel: text("shipping_label"),
    subtotalCents: integer("subtotal_cents").notNull(),
    discountCents: integer("discount_cents").notNull().default(0),
    shippingCents: integer("shipping_cents").notNull().default(0),
    taxCents: integer("tax_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull(),
    refundedCents: integer("refunded_cents").notNull().default(0),
    currency: text("currency").notNull().default("USD"),
    discountCode: text("discount_code"),
    cartId: text("cart_id"),
    marketingOptIn: boolean("marketing_opt_in").notNull().default(false),
    stripeCheckoutSessionId: text("stripe_checkout_session_id"),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    guestTokenHash: text("guest_token_hash"),
    exceptionReason: text("exception_reason"),
    carrier: text("carrier"),
    trackingNumber: text("tracking_number"),
    internalNotes: text("internal_notes"),
    reservationExpiresAt: ts("reservation_expires_at"),
    paidAt: ts("paid_at"),
    cancelledAt: ts("cancelled_at"),
    fulfilledAt: ts("fulfilled_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("orders_number_uq").on(t.number),
    uniqueIndex("orders_checkout_session_uq")
      .on(t.stripeCheckoutSessionId)
      .where(sql`${t.stripeCheckoutSessionId} is not null`),
    index("orders_status_idx").on(t.status, t.createdAt),
    index("orders_customer_idx").on(t.customerId),
    index("orders_email_idx").on(sql`lower(${t.email})`),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id").references(() => productVariants.id, { onDelete: "set null" }),
    productId: uuid("product_id"),
    sku: text("sku").notNull(),
    productTitle: text("product_title").notNull(),
    variantLabel: text("variant_label"),
    imageUrl: text("image_url"),
    unitPriceCents: integer("unit_price_cents").notNull(),
    quantity: integer("quantity").notNull(),
    lineTotalCents: integer("line_total_cents").notNull(),
    restockedQuantity: integer("restocked_quantity").notNull().default(0),
  },
  (t) => [index("order_items_order_idx").on(t.orderId)],
);

export const orderEvents = pgTable(
  "order_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    fromStatus: text("from_status"),
    toStatus: text("to_status"),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [index("order_events_order_idx").on(t.orderId, t.createdAt)],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    provider: text("provider").notNull().default("stripe"),
    providerRef: text("provider_ref").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("USD"),
    status: text("status").notNull(),
    paymentMethodType: text("payment_method_type"),
    cardBrand: text("card_brand"),
    cardLast4: text("card_last4"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("payments_provider_ref_uq").on(t.provider, t.providerRef)],
);

export const refunds = pgTable(
  "refunds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    providerRefundId: text("provider_refund_id"),
    amountCents: integer("amount_cents").notNull(),
    reason: text("reason").notNull(),
    status: text("status", { enum: ["pending", "succeeded", "failed", "canceled"] }).notNull(),
    restockItems: jsonb("restock_items").$type<{ orderItemId: string; quantity: number }[]>().notNull().default([]),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("refunds_provider_uq").on(t.providerRefundId).where(sql`${t.providerRefundId} is not null`),
    uniqueIndex("refunds_idem_uq").on(t.idempotencyKey),
  ],
);

/* ------------------------------------------------------------------ */
/* Promotions, shipping, settings                                      */
/* ------------------------------------------------------------------ */

export const discounts = pgTable(
  "discounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    description: text("description"),
    type: discountType("type").notNull(),
    value: integer("value").notNull(),
    minSubtotalCents: integer("min_subtotal_cents").notNull().default(0),
    startsAt: ts("starts_at"),
    endsAt: ts("ends_at"),
    usageLimit: integer("usage_limit"),
    usedCount: integer("used_count").notNull().default(0),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("discounts_code_uq").on(sql`upper(${t.code})`)],
);

export const shippingMethods = pgTable("shipping_methods", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  carrier: text("carrier", { enum: ["USPS", "UPS", "FedEx", "Other"] }).notNull(),
  amountCents: integer("amount_cents").notNull(),
  freeOverCents: integer("free_over_cents"),
  minDays: integer("min_days").notNull(),
  maxDays: integer("max_days").notNull(),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: updatedAt(),
});

export const newsletterSubscribers = pgTable(
  "newsletter_subscribers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    consentText: text("consent_text").notNull(),
    unsubscribedAt: ts("unsubscribed_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("newsletter_email_uq").on(sql`lower(${t.email})`)],
);

/* ------------------------------------------------------------------ */
/* Integrations                                                        */
/* ------------------------------------------------------------------ */

export const integrationEvents = pgTable(
  "integration_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider", { enum: ["stripe", "clover"] }).notNull(),
    externalEventId: text("external_event_id").notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").notNull(),
    status: eventStatus("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    errorSummary: text("error_summary"),
    receivedAt: ts("received_at").notNull().defaultNow(),
    nextAttemptAt: ts("next_attempt_at").notNull().defaultNow(),
    processedAt: ts("processed_at"),
  },
  (t) => [
    uniqueIndex("integration_events_uq").on(t.provider, t.externalEventId),
    index("integration_events_status_idx").on(t.status, t.nextAttemptAt),
  ],
);

export const cloverConnections = pgTable(
  "clover_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    merchantId: text("merchant_id").notNull(),
    environment: text("environment", { enum: ["sandbox", "production"] }).notNull(),
    accessTokenEnc: text("access_token_enc").notNull(),
    refreshTokenEnc: text("refresh_token_enc"),
    accessTokenExpiresAt: ts("access_token_expires_at"),
    refreshTokenExpiresAt: ts("refresh_token_expires_at"),
    status: text("status", { enum: ["connected", "error", "disconnected"] }).notNull().default("connected"),
    lastError: text("last_error"),
    lastSyncAt: ts("last_sync_at"),
    lastReconcileAt: ts("last_reconcile_at"),
    connectedAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("clover_connections_merchant_uq").on(t.merchantId)],
);

export const cloverItemMappings = pgTable(
  "clover_item_mappings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    merchantId: text("merchant_id").notNull(),
    cloverItemId: text("clover_item_id").notNull(),
    variantId: uuid("variant_id").references(() => productVariants.id, { onDelete: "set null" }),
    cloverName: text("clover_name").notNull(),
    cloverSku: text("clover_sku"),
    cloverCode: text("clover_code"),
    cloverPriceCents: integer("clover_price_cents"),
    cloverStock: integer("clover_stock"),
    stockTracked: boolean("stock_tracked").notNull().default(true),
    syncStatus: syncStatus("sync_status").notNull().default("unmapped"),
    syncError: text("sync_error"),
    lastSyncedAt: ts("last_synced_at"),
    lastPushedQuantity: integer("last_pushed_quantity"),
    lastPushedAt: ts("last_pushed_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("clover_map_item_uq").on(t.merchantId, t.cloverItemId),
    uniqueIndex("clover_map_variant_uq").on(t.variantId).where(sql`${t.variantId} is not null`),
  ],
);

/**
 * Website-originated stock changes waiting to be written to Clover.
 * Clover's item_stocks endpoint sets an absolute quantity, so pending
 * deltas are counted when interpreting Clover's numbers (see clover/sync.ts).
 */
export const cloverOutbound = pgTable(
  "clover_outbound",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    merchantId: text("merchant_id").notNull(),
    cloverItemId: text("clover_item_id").notNull(),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    quantityDelta: integer("quantity_delta").notNull(),
    sourceKey: text("source_key").notNull(),
    status: text("status", { enum: ["pending", "pushed", "failed"] }).notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    nextAttemptAt: ts("next_attempt_at").notNull().defaultNow(),
    createdAt: createdAt(),
    pushedAt: ts("pushed_at"),
  },
  (t) => [
    uniqueIndex("clover_outbound_source_uq").on(t.sourceKey),
    index("clover_outbound_pending_idx").on(t.status, t.nextAttemptAt),
  ],
);

export const reconciliationRuns = pgTable("reconciliation_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: text("provider").notNull(),
  status: text("status", { enum: ["running", "completed", "failed"] }).notNull(),
  triggeredBy: text("triggered_by").notNull(),
  checked: integer("checked").notNull().default(0),
  discrepancies: jsonb("discrepancies")
    .$type<{ variantId: string | null; sku: string | null; cloverItemId: string; local: number | null; clover: number | null; action: string }[]>()
    .notNull()
    .default([]),
  error: text("error"),
  startedAt: createdAt(),
  finishedAt: ts("finished_at"),
});

/* ------------------------------------------------------------------ */
/* Audit                                                               */
/* ------------------------------------------------------------------ */

/** Append-only: a database trigger (migration 0001) blocks UPDATE and DELETE. */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actorUserId: uuid("actor_user_id"),
    actorLabel: text("actor_label").notNull(),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    summary: jsonb("summary").$type<Record<string, unknown>>().notNull().default({}),
    ip: text("ip"),
    correlationId: text("correlation_id"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_entity_idx").on(t.entity, t.entityId), index("audit_created_idx").on(t.createdAt)],
);

export const alerts = pgTable(
  "alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(),
    severity: text("severity", { enum: ["info", "warning", "critical"] }).notNull(),
    message: text("message").notNull(),
    dedupeKey: text("dedupe_key"),
    context: jsonb("context").$type<Record<string, unknown>>().notNull().default({}),
    resolvedAt: ts("resolved_at"),
    resolvedBy: uuid("resolved_by"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("alerts_open_dedupe_uq").on(t.dedupeKey).where(sql`${t.dedupeKey} is not null and ${t.resolvedAt} is null`),
    index("alerts_open_idx").on(t.resolvedAt, t.createdAt),
  ],
);
