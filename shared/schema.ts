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
  real,
  boolean,
  jsonb,
  smallint,
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
    /** `customer` | `admin` — admin unlocks /admin routes and theme editing */
    role: text("role").notNull().default("customer"),
    /** reminder / lifecycle emails suppressed when true (transactional still sent) */
    marketingOptOut: boolean("marketing_opt_out").notNull().default(false),
    /** E.164, collected at checkout for courier contact */
    phone: text("phone"),
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
    /** Servable URL of the ~1200px preview derivative (set async by the image pipeline) */
    previewUrl: text("preview_url"),
    /** Pixel dimensions of the (EXIF-rotated) original; set async by the image pipeline */
    width: integer("width"),
    height: integer("height"),
    sizeBytes: integer("size_bytes"),
    /** `pending` (derivatives queued) | `ready` | `invalid` (sharp could not decode) */
    status: text("status").notNull().default("pending"),
    uploadedAt: ts("uploaded_at").defaultNow().notNull(),
  },
  (t) => [index("uploaded_photos_project_idx").on(t.projectId), index("uploaded_photos_user_idx").on(t.userId)],
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
    /** `safepay` | `fake` (dev) */
    paymentProvider: text("payment_provider").notNull(),
    /** provider's payment session id (Safepay tracker token) */
    providerRef: text("provider_ref"),
    /** false = sandbox / test payment — never fulfil these */
    livemode: boolean("livemode").notNull().default(false),
    idempotencyKey: text("idempotency_key").notNull(),
    courier: text("courier"),
    trackingNumber: text("tracking_number"),
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
export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type OrderEvent = typeof orderEvents.$inferSelect;
export type NewOrderEvent = typeof orderEvents.$inferInsert;
export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
