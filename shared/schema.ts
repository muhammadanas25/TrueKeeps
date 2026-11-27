/**
 * Database schema — single source of truth for Postgres (Drizzle) and
 * the zod insert schemas the API validates against.
 *
 * Shape (Phase 2A):
 *
 *   users ──< sessions            (better-auth: identity + login state)
 *     │   ──< accounts            (OAuth links: google, …)
 *     │       verifications       (magic-link tokens)
 *     │
 *     ├──< projects ──< project_pages ──< page_photos   (canvas editor)
 *     │      │
 *     │      └──< uploaded_photos                       (media metadata)
 *     │
 *     └──< orders ──< order_events                      (Phase 2B commerce)
 *                 └──< payments
 *
 * Conventions
 *  - ids are varchar UUIDs generated in Postgres (`gen_random_uuid()`)
 *    or, for auth rows, by better-auth (configured to emit UUIDs too)
 *  - every FK is declared with an explicit ON DELETE and has an index —
 *    Postgres does NOT index FK columns automatically, and every list
 *    endpoint filters by one of them
 *  - timestamps are `timestamptz` so PKT vs UTC never bites (reminder
 *    send windows, order timelines)
 *  - `projects.user_id` is NOT NULL: guests are real (anonymous) user
 *    rows, so one ownership check covers members and guests alike
 *    (docs/adr/004)
 *
 * Auth tables are named/shaped for better-auth's Drizzle adapter with
 * `usePlural: true` — property names (camelCase) must match the
 * better-auth field names; SQL column names are snake_case.
 *
 * Migrations: `npm run db:generate` after editing this file, then
 * review the SQL in migrations/ (hand-edit data backfills there).
 */

import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  timestamp,
  decimal,
  integer,
  bigint,
  bigserial,
  real,
  boolean,
  jsonb,
  smallint,
  date,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

/* ── helpers ────────────────────────────────────────────────────── */

const uuidPk = () => varchar("id").primaryKey().default(sql`gen_random_uuid()`);
const ts = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => ts("created_at").defaultNow().notNull();
const updatedAt = () => ts("updated_at").defaultNow().notNull();

/* ── Identity (better-auth managed) ─────────────────────────────── */

/**
 * One row per person — including guests. Anonymous users get a
 * placeholder email from the anonymous plugin and `is_anonymous=true`;
 * when they sign in with Google / magic link their projects are moved
 * to the real user and the anonymous row is deleted (server/auth.ts).
 */
export const users = pgTable(
  "users",
  {
    id: uuidPk(),
    name: text("name").notNull().default(""),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    isAnonymous: boolean("is_anonymous").notNull().default(false),
    /**
     * `customer` | `admin` (the owner: everything) | `ops` (orders and print,
     * no money totals or settings) — see STAFF_ROLES in shared/ops.ts
     */
    role: text("role").notNull().default("customer"),
    /** reminder / lifecycle emails suppressed when true (transactional still sent) */
    marketingOptOut: boolean("marketing_opt_out").notNull().default(false),
    /** E.164, collected at checkout for courier contact */
    phone: text("phone"),
    /**
     * The last affiliate link this person tapped and when (shared/affiliates.ts),
     * saved onto the account so a link tapped on a phone still counts when they
     * order from another device. Orders keep their own copy (orders.affiliate_id).
     */
    affiliateId: varchar("affiliate_id"),
    affiliateAt: ts("affiliate_at"),
    lastSeenAt: ts("last_seen_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("users_email_unique").on(t.email)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuidPk(),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    expiresAt: ts("expires_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("sessions_token_unique").on(t.token), index("sessions_user_id_idx").on(t.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: uuidPk(),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** provider-side subject (Google `sub`) */
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: ts("access_token_expires_at"),
    refreshTokenExpiresAt: ts("refresh_token_expires_at"),
    scope: text("scope"),
    /** unused (no password auth) but required by the better-auth model */
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("accounts_user_id_idx").on(t.userId),
    uniqueIndex("accounts_provider_account_unique").on(t.providerId, t.accountId),
  ],
);

/** Short-lived tokens: magic links (identifier = email). */
export const verifications = pgTable(
  "verifications",
  {
    id: uuidPk(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: ts("expires_at").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)],
);

/* ── Catalogue ──────────────────────────────────────────────────── */

export const products = pgTable("products", {
  id: uuidPk(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  imageUrl: text("image_url"),
  description: text("description"),
  createdAt: createdAt(),
});

export const themes = pgTable("themes", {
  id: uuidPk(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  imageUrl: text("image_url"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  pageCount: integer("page_count").notNull().default(20),
  createdAt: createdAt(),
});

/* ── Books ──────────────────────────────────────────────────────── */

/**
 * A project is one book. The quiz-first builder stores its whole
 * client state in `document` (photos by URL, pages, captions, theme…)
 * with an optimistic-concurrency `document_version`; the canvas editor
 * (/create) uses the normalised project_pages/page_photos rows instead.
 * The denormalised occasion/vibe/theme/binding columns exist so
 * analytics and lifecycle campaigns can query without unpacking JSON.
 */
export const projects = pgTable(
  "projects",
  {
    id: uuidPk(),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    themeId: varchar("theme_id"),
    /** `draft` | `ordered` | `archived` */
    status: text("status").notNull().default("draft"),
    /** which builder produced it: `builder` (quiz-first) | `canvas` | `classic` */
    source: text("source").notNull().default("builder"),
    occasion: text("occasion"),
    vibe: text("vibe"),
    themeKey: text("theme_key"),
    binding: text("binding"),
    coverStyle: text("cover_style"),
    density: text("density"),
    /** builder state snapshot (BuilderDocument in shared/document.ts) */
    document: jsonb("document"),
    documentVersion: integer("document_version").notNull().default(0),
    /** sha256 of the one-time claim token handed to the creating client */
    claimTokenHash: text("claim_token_hash"),
    lastReminderAt: ts("last_reminder_at"),
    reminderStage: smallint("reminder_stage").notNull().default(0),
    deletedAt: ts("deleted_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("projects_user_updated_idx").on(t.userId, t.updatedAt),
    // reminder scan: drafts only, cheap partial index
    index("projects_draft_updated_idx")
      .on(t.updatedAt)
      .where(sql`${t.status} = 'draft' AND ${t.deletedAt} IS NULL`),
  ],
);

export const projectPages = pgTable(
  "project_pages",
  {
    id: uuidPk(),
    projectId: varchar("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    pageNumber: integer("page_number").notNull(),
    layoutId: text("layout_id"),
    backgroundUrl: text("background_url"),
    createdAt: createdAt(),
  },
  (t) => [index("project_pages_project_idx").on(t.projectId, t.pageNumber)],
);

export const pagePhotos = pgTable(
  "page_photos",
  {
    id: uuidPk(),
    pageId: varchar("page_id")
      .notNull()
      .references(() => projectPages.id, { onDelete: "cascade" }),
    photoUrl: text("photo_url").notNull(),
    x: real("x").notNull().default(0),
    y: real("y").notNull().default(0),
    width: real("width").notNull().default(100),
    height: real("height").notNull().default(100),
    rotation: real("rotation").notNull().default(0),
    zIndex: integer("z_index").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("page_photos_page_idx").on(t.pageId)],
);

/* ── Media metadata (bytes live in the media store, ADR 002) ────── */

export const uploadedPhotos = pgTable(
  "uploaded_photos",
  {
    id: uuidPk(),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: varchar("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** Servable URL of the original (media-store public URL; legacy rows may hold data: URLs) */
    url: text("url").notNull(),
    originalFilename: text("original_filename").notNull(),
    /** Media-store object key of the original; null for legacy data-URL rows */
    storageKey: text("storage_key"),
    /** Servable URL of the ~400px thumbnail derivative (set async by the image pipeline) */
    thumbUrl: text("thumb_url"),
    /** Servable URL of the ~1600px display copy (from the browser, or the image pipeline for /create) */
    previewUrl: text("preview_url"),
    /** Pixel dimensions of the (EXIF-rotated) original; set async by the image pipeline */
    width: integer("width"),
    height: integer("height"),
    sizeBytes: integer("size_bytes"),
    /** `pending` (derivatives queued) | `ready` | `invalid` (sharp could not decode) */
    status: text("status").notNull().default("pending"),
    /**
     * When the untouched HD original finished uploading. Null while only the
     * display copy has arrived; a book can't be ordered until every placed
     * photo has this, because the original is what gets printed.
     */
    originalUploadedAt: ts("original_uploaded_at"),
    uploadedAt: ts("uploaded_at").defaultNow().notNull(),
  },
  (t) => [index("uploaded_photos_project_idx").on(t.projectId), index("uploaded_photos_user_idx").on(t.userId)],
);

/**
 * One row per batch of photos a customer added, reported by their browser so
 * upload speed can be compared across batch sizes, file sizes and connections
 * (docs/adr/014). Holds measurements only: no file names, no photos.
 *
 * `id` is chosen by the browser, so a report sent as the page closed can be
 * overwritten by the finished one if the customer comes back.
 */
export const uploadBatches = pgTable(
  "upload_batches",
  {
    id: varchar("id").primaryKey(),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: varchar("project_id"),
    /** `complete` (every photo settled) | `unfinished` (the page closed first) */
    status: text("status").notNull(),
    /** `new` (first pick) | `resume` (photos picked again after a closed tab) */
    kind: text("kind").notNull().default("new"),
    photoCount: integer("photo_count").notNull(),
    rejectedCount: integer("rejected_count").notNull().default(0),
    duplicateCount: integer("duplicate_count").notNull().default(0),
    heicCount: integer("heic_count").notNull().default(0),
    sourceBytes: bigint("source_bytes", { mode: "number" }).notNull().default(0),
    originalBytes: bigint("original_bytes", { mode: "number" }).notNull().default(0),
    displayBytes: bigint("display_bytes", { mode: "number" }).notNull().default(0),
    /** ms from picking to the first photo usable in the book */
    firstInBookMs: integer("first_in_book_ms"),
    /** ms from picking to every editing copy on the server */
    allInBookMs: integer("all_in_book_ms"),
    /** ms from picking to every HD original on the server */
    allHdMs: integer("all_hd_ms"),
    /** average upload speed of the originals, megabits per second */
    hdMbps: real("hd_mbps"),
    retries: integer("retries").notNull().default(0),
    stalls: integer("stalls").notNull().default(0),
    /** navigator.connection.effectiveType, where the browser offers it */
    connection: text("connection"),
    downlinkMbps: real("downlink_mbps"),
    deviceMemoryGb: real("device_memory_gb"),
    cpuCores: integer("cpu_cores"),
    mobile: boolean("mobile"),
    browser: text("browser"),
    /** per-photo rows: [sourceKB, megapixels, prepareMs, displayMs, originalMs, type] */
    photos: jsonb("photos"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").defaultNow().notNull(),
  },
  (t) => [index("upload_batches_created_idx").on(t.createdAt)],
);

/* ── Commerce (Phase 2B, docs/adr/005) ──────────────────────────── */

/**
 * One row per checkout. Money is integer paisa; prices are re-quoted on
 * the server (shared/pricing.ts) and frozen here with the price-list
 * version, so a later price change never alters a placed order.
 * `document_snapshot` is the exact book the customer paid for — the
 * print pipeline renders from it even if the project is edited or
 * deleted afterwards (hence ON DELETE RESTRICT on project).
 */
export const orders = pgTable(
  "orders",
  {
    id: uuidPk(),
    /** human-facing reference, e.g. TK-7F3K9Q — also sent to Safepay */
    orderNumber: text("order_number").notNull(),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    projectId: varchar("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    /** see shared/orders.ts ORDER_STATUSES */
    status: text("status").notNull().default("pending_payment"),
    currency: text("currency").notNull().default("PKR"),
    unitMinor: integer("unit_minor").notNull(),
    subtotalMinor: integer("subtotal_minor").notNull(),
    shippingMinor: integer("shipping_minor").notNull(),
    totalMinor: integer("total_minor").notNull(),
    priceListVersion: text("price_list_version").notNull(),
    binding: text("binding").notNull(),
    /** paper finish, a printing instruction: `matte` | `glossy` */
    finish: text("finish").notNull().default("matte"),
    qty: integer("qty").notNull(),
    pageCount: integer("page_count").notNull(),
    /** denormalised for analytics / lifecycle campaigns */
    title: text("title").notNull(),
    occasion: text("occasion"),
    themeKey: text("theme_key"),
    documentSnapshot: jsonb("document_snapshot").notNull(),
    shippingAddress: jsonb("shipping_address").notNull(),
    contactEmail: text("contact_email").notNull(),
    contactPhone: text("contact_phone").notNull(),
    /** who placed it; differs from the address's name when it's a gift (null on orders before 2026-11-28) */
    contactName: text("contact_name"),
    /** sent to someone else as a gift: no price or invoice in the parcel (docs/adr/025) */
    isGift: boolean("is_gift").notNull().default(false),
    /** `safepay` | `fake` (dev) */
    paymentProvider: text("payment_provider").notNull(),
    /** provider's payment session id (Safepay tracker token) */
    providerRef: text("provider_ref"),
    /** false = sandbox / test payment — never fulfil these */
    livemode: boolean("livemode").notNull().default(false),
    idempotencyKey: text("idempotency_key").notNull(),
    courier: text("courier"),
    trackingNumber: text("tracking_number"),
    /** the promo code applied, upper case (shared/promo.ts); null = none */
    promoCode: text("promo_code"),
    /** what the code took off the book price; totalMinor is already net of it */
    discountMinor: integer("discount_minor").notNull().default(0),
    /** the affiliate credited with this order (docs/adr/022); null = none */
    affiliateId: varchar("affiliate_id"),
    /** `link` (their link, within the window) | `admin` (set by hand, audited) */
    affiliateSource: text("affiliate_source"),
    paidAt: ts("paid_at"),
    expiresAt: ts("expires_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("orders_number_unique").on(t.orderNumber),
    uniqueIndex("orders_user_idem_unique").on(t.userId, t.idempotencyKey),
    uniqueIndex("orders_provider_ref_unique").on(t.providerRef),
    index("orders_user_created_idx").on(t.userId, t.createdAt),
    index("orders_status_created_idx").on(t.status, t.createdAt),
    index("orders_project_idx").on(t.projectId),
    index("orders_affiliate_idx").on(t.affiliateId),
  ],
);

/** Append-only status timeline — what the customer sees on /orders/:id. */
export const orderEvents = pgTable(
  "order_events",
  {
    id: uuidPk(),
    orderId: varchar("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    /** status after this event (or null for notes like payment_failed) */
    toStatus: text("to_status"),
    fromStatus: text("from_status"),
    /** `created` | `status` | `payment_failed` | `amount_mismatch` | `note` */
    kind: text("kind").notNull(),
    /** `user` | `webhook` | `redirect` | `poll` | `reconcile` | `admin` | `system` */
    actor: text("actor").notNull(),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [index("order_events_order_idx").on(t.orderId, t.createdAt)],
);

/**
 * Customer feedback from /feedback (docs/adr/015). Private: read on
 * /admin/feedback, never shown publicly. `user_id` links a signed-in (or
 * guest) visitor when there is one and survives the user being deleted.
 * Topic and rating ids are listed in shared/feedback.ts.
 */
export const feedback = pgTable(
  "feedback",
  {
    id: uuidPk(),
    userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
    topic: text("topic").notNull(),
    /** `loved` | `good` | `okay` | `poor`, or null when skipped */
    rating: text("rating"),
    message: text("message").notNull(),
    name: text("name"),
    /** email or WhatsApp number, only so the team can reply */
    contact: text("contact"),
    orderNumber: text("order_number"),
    /** the page the visitor came from */
    fromPath: text("from_path"),
    /** `new` | `read` */
    status: text("status").notNull().default("new"),
    createdAt: createdAt(),
  },
  (t) => [index("feedback_status_created_idx").on(t.status, t.createdAt)],
);

/**
 * Small switches the owner changes from the admin, one row per key, e.g.
 * "payments" → { card, bankTransfer } (shared/payments.ts). A table rather
 * than environment variables so a switch needs no redeploy.
 */
/**
 * Promo codes, made and switched on/off by the owner in Admin › Promo codes
 * (owner, 2026-11-22: "promo code... it will have all this configurable from
 * admin page"). The rules are in shared/promo.ts; uses are counted from the
 * orders that carry the code, so there is no counter to drift.
 */
export const promoCodes = pgTable(
  "promo_codes",
  {
    id: uuidPk(),
    /** stored upper case; customers can type it any way */
    code: text("code").notNull(),
    /** `percent` (value 1–90) | `fixed` (value in minor units) */
    kind: text("kind").notNull(),
    value: integer("value").notNull(),
    startsAt: ts("starts_at"),
    endsAt: ts("ends_at"),
    /** total orders that may use it; null = no limit */
    maxUses: integer("max_uses"),
    /** orders per customer; null = no limit */
    perCustomer: integer("per_customer").default(1),
    /** the book price an order needs before the code applies; null = any */
    minSubtotalMinor: integer("min_subtotal_minor"),
    active: boolean("active").notNull().default(true),
    /** for the team only, e.g. "Eid campaign on Instagram" */
    note: text("note"),
    createdBy: varchar("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("promo_codes_code_unique").on(t.code)],
);
export type PromoCode = typeof promoCodes.$inferSelect;

/* ── Affiliates (docs/adr/022, rules in shared/affiliates.ts) ──── */

/**
 * People and businesses who share a link (?ref=code) and earn a commission on
 * the paid books it brings. Never deleted: paused instead, so old orders keep
 * their name. `user_id` is filled the first time they sign in to /partners
 * with this email.
 */
export const affiliates = pgTable(
  "affiliates",
  {
    id: uuidPk(),
    /** the link name, lower case: ?ref=mahnoor */
    code: text("code").notNull(),
    name: text("name").notNull(),
    /** they sign in to /partners with this; lower case */
    email: text("email").notNull(),
    userId: varchar("user_id"),
    /** where they post, for the team: "Instagram · 41k" */
    channel: text("channel"),
    /** `percent` (value 1–50) | `fixed` (value in minor units per order) */
    commissionKind: text("commission_kind").notNull(),
    commissionValue: integer("commission_value").notNull(),
    /** `jazzcash` | `easypaisa` | `bank` */
    payoutMethod: text("payout_method").notNull(),
    /** wallet number or bank account/IBAN; shown masked outside the admin */
    payoutAccount: text("payout_account"),
    active: boolean("active").notNull().default(true),
    note: text("note"),
    createdBy: varchar("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("affiliates_code_unique").on(t.code), index("affiliates_email_idx").on(t.email)],
);
export type Affiliate = typeof affiliates.$inferSelect;

/**
 * One row per visitor per affiliate per day, from the link tap (server/affiliates/
 * attribution.ts). "Visitors" = distinct visitor ids. No personal data: the
 * visitor id is a random cookie.
 */
export const affiliateVisits = pgTable(
  "affiliate_visits",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    affiliateId: varchar("affiliate_id").notNull(),
    visitorId: text("visitor_id").notNull(),
    day: date("day").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("affiliate_visits_unique").on(t.affiliateId, t.visitorId, t.day), index("affiliate_visits_day_idx").on(t.affiliateId, t.day)],
);

/**
 * Commission lines. `earn` is the order's commission, worked out when it is
 * paid, with the rate frozen on the row (a later rate change doesn't touch it).
 * `clawback` is a negative line when an order whose commission was already paid
 * out is refunded or moved to another affiliate; it comes off the next payout.
 * States are read from the columns (shared/affiliates.ts commissionState).
 */
export const affiliateCommissions = pgTable(
  "affiliate_commissions",
  {
    id: uuidPk(),
    affiliateId: varchar("affiliate_id")
      .notNull()
      .references(() => affiliates.id, { onDelete: "restrict" }),
    orderId: varchar("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    /** `earn` | `clawback` */
    kind: text("kind").notNull(),
    /** book total the customer paid (subtotal − promo), before shipping */
    baseMinor: integer("base_minor").notNull(),
    /** positive for earn, negative for clawback */
    amountMinor: integer("amount_minor").notNull(),
    commissionKind: text("commission_kind").notNull(),
    commissionValue: integer("commission_value").notNull(),
    /** delivered + hold; null while waiting for delivery */
    payableAt: ts("payable_at"),
    reversedAt: ts("reversed_at"),
    reversedReason: text("reversed_reason"),
    payoutId: varchar("payout_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("affiliate_commissions_line_unique").on(t.orderId, t.affiliateId, t.kind),
    index("affiliate_commissions_aff_idx").on(t.affiliateId, t.payableAt),
  ],
);
export type AffiliateCommission = typeof affiliateCommissions.$inferSelect;

/**
 * A payout the owner made (Admin › Affiliates › Mark paid), covering every
 * approved, unpaid line up to the end of `period`. The reference is the
 * JazzCash/Easypaisa/bank transaction id; the affiliate sees it.
 */
export const affiliatePayouts = pgTable(
  "affiliate_payouts",
  {
    id: uuidPk(),
    affiliateId: varchar("affiliate_id")
      .notNull()
      .references(() => affiliates.id, { onDelete: "restrict" }),
    /** "2026-11": the month whose approved commission this pays */
    period: text("period").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    lines: integer("lines").notNull(),
    payoutMethod: text("payout_method").notNull(),
    payoutAccount: text("payout_account"),
    reference: text("reference").notNull(),
    paidBy: text("paid_by"),
    paidAt: ts("paid_at").defaultNow().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("affiliate_payouts_aff_idx").on(t.affiliateId, t.paidAt)],
);
export type AffiliatePayout = typeof affiliatePayouts.$inferSelect;

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  /** the admin who last changed it */
  updatedBy: varchar("updated_by"),
  updatedAt: updatedAt(),
});

/**
 * Every confirmed money movement we learn about, for audit and
 * idempotency. `provider_event_id` (the webhook's own id) is unique, so a
 * re-delivered webhook can't record twice.
 */
export const payments = pgTable(
  "payments",
  {
    id: uuidPk(),
    orderId: varchar("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    provider: text("provider").notNull(),
    providerRef: text("provider_ref").notNull(),
    providerEventId: text("provider_event_id"),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull(),
    /** `succeeded` | `failed` | `refunded` */
    status: text("status").notNull(),
    /** how we learned of it: `webhook` | `redirect` | `poll` | `reconcile` */
    source: text("source").notNull(),
    raw: jsonb("raw"),
    createdAt: createdAt(),
  },
  (t) => [
    index("payments_order_idx").on(t.orderId),
    uniqueIndex("payments_event_unique").on(t.providerEventId),
  ],
);

/* ── Ops console (docs/adr/018) ─────────────────────────────────── */

/**
 * A staff member's authenticator-app secret (TOTP, RFC 6238). Staff sign in
 * with a magic link or Google like everyone else; this second factor is asked
 * for before any admin data is served (server/middleware/staff.ts), because a
 * stolen mailbox must not be a stolen admin.
 *
 * `secret_enc` is AES-256-GCM ciphertext (server/security/totp.ts), so a
 * database dump alone can't mint codes. Backup codes are stored as SHA-256
 * hashes and removed as they're used. `enrolled_at` stays null until the
 * first code proves the app was set up. `last_step` blocks replaying a code
 * inside its own 30-second window.
 */
export const staffFactors = pgTable("staff_factors", {
  userId: varchar("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  secretEnc: text("secret_enc").notNull(),
  backupCodes: jsonb("backup_codes").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  enrolledAt: ts("enrolled_at"),
  failedCount: integer("failed_count").notNull().default(0),
  lockedUntil: ts("locked_until"),
  lastStep: bigint("last_step", { mode: "number" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/**
 * One row per signed-in session that has passed the second factor, valid
 * until `expires_at` (12 hours). Tied to the session row, so signing out or
 * revoking the session ends it too.
 */
export const staffElevations = pgTable(
  "staff_elevations",
  {
    sessionId: varchar("session_id")
      .primaryKey()
      .references(() => sessions.id, { onDelete: "cascade" }),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: ts("expires_at").notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [index("staff_elevations_user_idx").on(t.userId)],
);

/** A role waiting for someone who hasn't signed in yet; applied at their first sign-in. */
export const staffInvites = pgTable("staff_invites", {
  email: text("email").primaryKey(),
  role: text("role").notNull(),
  invitedBy: varchar("invited_by"),
  createdAt: createdAt(),
});

/**
 * Who did what in the admin, append-only: every staff change, every print
 * file download, sign-in step-ups and failures. Never shown to customers.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuidPk(),
    actorId: varchar("actor_id"),
    actorEmail: text("actor_email"),
    actorRole: text("actor_role"),
    /** dotted verb, e.g. `order.status`, `print.download`, `staff.step_up_failed` */
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    detail: jsonb("detail"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_log_created_idx").on(t.createdAt), index("audit_log_target_idx").on(t.targetType, t.targetId)],
);

/** One stored, checked file of a print job (see `print_jobs.files`). */
export interface PrintJobFile {
  /** `interior` | `cover` (PDFs) | `jpegs` (a ZIP of 300 DPI JPEGs; `pages` = how many) */
  kind: string;
  key: string;
  bytes: number;
  sha256: string;
  pages: number;
  /** a second copy, in the backup bucket, checked the same way */
  backupKey?: string | null;
}

/**
 * The print PDF of an order, built and checked in stages (server/print/
 * pipeline.ts). A paid order always gets a row, and the reconciler finishes
 * any row left behind by a crash or an outage. Versions are immutable: a
 * rebuild makes version n+1 under a new key, so the file a printer
 * downloaded can always be proven by its checksum.
 *
 * `state`: queued → rendering → composing → verifying → checked (→
 * backed_up when a backup bucket is configured), or failed after the
 * retries run out.
 */
export const printJobs = pgTable(
  "print_jobs",
  {
    id: uuidPk(),
    orderId: varchar("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    state: text("state").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    files: jsonb("files").$type<PrintJobFile[]>(),
    pageCount: integer("page_count"),
    lowDpiCount: integer("low_dpi_count").notNull().default(0),
    /** placed photos the renderer couldn't use, with why */
    problems: jsonb("problems"),
    stateChangedAt: ts("state_changed_at").defaultNow().notNull(),
    checkedAt: ts("checked_at"),
    /** `system`, or the staff email that asked for a rebuild */
    requestedBy: text("requested_by").notNull().default("system"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("print_jobs_order_version_unique").on(t.orderId, t.version),
    index("print_jobs_state_idx").on(t.state, t.stateChangedAt),
  ],
);

/**
 * Who hears about what (one row per event id in shared/ops.ts), edited from
 * Admin → Notifications. Staff recipients are typed in (emails and WhatsApp
 * numbers); customers are switched on or off per channel. WhatsApp needs a
 * template Meta has approved, named here.
 */
export const notifyRules = pgTable("notify_rules", {
  event: text("event").primaryKey(),
  enabled: boolean("enabled").notNull().default(true),
  staffEmails: jsonb("staff_emails").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  staffWhatsapp: jsonb("staff_whatsapp").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  customerEmail: boolean("customer_email").notNull().default(false),
  customerWhatsapp: boolean("customer_whatsapp").notNull().default(false),
  /** Meta-approved template names, one for staff and one for customers */
  staffTemplate: text("staff_template"),
  customerTemplate: text("customer_template"),
  templateLang: text("template_lang").notNull().default("en"),
  updatedBy: varchar("updated_by"),
  updatedAt: updatedAt(),
});

/**
 * The outbox: one row per message to one recipient. Written before anything
 * is sent; a worker sends it with retries, and provider callbacks move it to
 * delivered/read. `dedupe_key` is unique, so the same event can never message
 * the same person twice however many times it fires.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: uuidPk(),
    event: text("event").notNull(),
    /** `email` | `whatsapp` */
    channel: text("channel").notNull(),
    /** `staff` | `customer` */
    audience: text("audience").notNull(),
    recipient: text("recipient").notNull(),
    orderId: varchar("order_id").references(() => orders.id, { onDelete: "set null" }),
    payload: jsonb("payload").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    /** `queued` | `sent` | `delivered` | `read` | `failed` | `skipped` */
    status: text("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    providerId: text("provider_id"),
    error: text("error"),
    sentAt: ts("sent_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("notifications_dedupe_unique").on(t.dedupeKey),
    index("notifications_created_idx").on(t.createdAt),
    index("notifications_order_idx").on(t.orderId),
    index("notifications_provider_idx").on(t.providerId),
  ],
);

/**
 * First-party analytics: page views, active time, builder steps, speed
 * readings, errors and frustrated taps, sent by the browser to
 * POST /api/events. No names, emails, photos or typed text: `anon_id` is a
 * random id kept in the browser, `user_id` only links a signed-in visitor so
 * the funnel can follow them to a paid order.
 */
export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    name: text("name").notNull(),
    anonId: text("anon_id"),
    userId: varchar("user_id"),
    /** one browser tab visit; groups page views into a session */
    visitId: text("visit_id"),
    path: text("path"),
    props: jsonb("props"),
    /** `phone` | `tablet` | `computer` */
    device: text("device"),
    os: text("os"),
    browser: text("browser"),
    createdAt: createdAt(),
  },
  (t) => [index("analytics_events_name_created_idx").on(t.name, t.createdAt), index("analytics_events_anon_idx").on(t.anonId)],
);

/**
 * Server response times, one row per route per minute per server process.
 * `buckets` is a histogram over fixed bounds (server/analytics/latency.ts),
 * so any time range can be merged exactly and read as p50/p90/p95/p99.
 */
export const requestMetrics = pgTable(
  "request_metrics",
  {
    minute: ts("minute").notNull(),
    route: text("route").notNull(),
    instance: text("instance").notNull(),
    count: integer("count").notNull(),
    errors: integer("errors").notNull().default(0),
    sumMs: bigint("sum_ms", { mode: "number" }).notNull(),
    maxMs: integer("max_ms").notNull(),
    buckets: jsonb("buckets").$type<number[]>().notNull(),
  },
  (t) => [uniqueIndex("request_metrics_unique").on(t.minute, t.route, t.instance), index("request_metrics_minute_idx").on(t.minute)],
);

export type StaffFactor = typeof staffFactors.$inferSelect;
export type AuditEntry = typeof auditLog.$inferSelect;
export type PrintJob = typeof printJobs.$inferSelect;
export type NotifyRule = typeof notifyRules.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;

/* ── Zod insert schemas (API validation) ────────────────────────── */

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProductSchema = createInsertSchema(products).omit({
  id: true,
  createdAt: true,
});

export const insertThemeSchema = createInsertSchema(themes).omit({
  id: true,
  createdAt: true,
});

/**
 * What a CLIENT may send when creating a project. Ownership (`userId`),
 * versioning and reminder bookkeeping are server-assigned and
 * deliberately excluded so a request body can never set them.
 */
export const insertProjectSchema = createInsertSchema(projects)
  .omit({
    id: true,
    userId: true,
    documentVersion: true,
    claimTokenHash: true,
    lastReminderAt: true,
    reminderStage: true,
    deletedAt: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    name: z.string().trim().min(1).max(120),
    status: z.enum(["draft", "ordered", "archived"]).optional(),
    source: z.enum(["builder", "canvas", "classic"]).optional(),
  });

/** PATCH body for a project — every field optional, same allow-list. */
export const updateProjectSchema = insertProjectSchema.partial();

export const insertProjectPageSchema = createInsertSchema(projectPages).omit({
  id: true,
  createdAt: true,
});
export const updateProjectPageSchema = insertProjectPageSchema.omit({ projectId: true }).partial();

export const insertPagePhotoSchema = createInsertSchema(pagePhotos).omit({
  id: true,
  createdAt: true,
});
export const updatePagePhotoSchema = insertPagePhotoSchema.omit({ pageId: true }).partial();

export const insertUploadedPhotoSchema = createInsertSchema(uploadedPhotos).omit({
  id: true,
  uploadedAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof products.$inferSelect;
export type InsertTheme = z.infer<typeof insertThemeSchema>;
export type Theme = typeof themes.$inferSelect;
/** Client-facing create payload (no owner) */
export type InsertProject = z.infer<typeof insertProjectSchema>;
/** Storage-level create payload (owner required) */
export type NewProject = InsertProject & { userId: string; claimTokenHash?: string | null };
export type UpdateProject = z.infer<typeof updateProjectSchema>;
export type Project = typeof projects.$inferSelect;
export type InsertProjectPage = z.infer<typeof insertProjectPageSchema>;
export type ProjectPage = typeof projectPages.$inferSelect;
export type InsertPagePhoto = z.infer<typeof insertPagePhotoSchema>;
export type PagePhoto = typeof pagePhotos.$inferSelect;
export type InsertUploadedPhoto = z.infer<typeof insertUploadedPhotoSchema>;
export type UploadedPhoto = typeof uploadedPhotos.$inferSelect;
export type UploadBatch = typeof uploadBatches.$inferSelect;
export type NewUploadBatch = typeof uploadBatches.$inferInsert;
export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type OrderEvent = typeof orderEvents.$inferSelect;
export type NewOrderEvent = typeof orderEvents.$inferInsert;
export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
export type Feedback = typeof feedback.$inferSelect;
export type NewFeedback = typeof feedback.$inferInsert;
export type AppSetting = typeof appSettings.$inferSelect;
