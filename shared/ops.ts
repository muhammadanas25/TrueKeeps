/**
 * Ops console vocabulary shared by server and admin UI (docs/adr/018).
 *
 * What: staff roles and what each may do, the notification events the owner
 * can route from Admin → Notifications, print job states, and the shape of
 * the analytics beacons the browser sends.
 *
 * Why one file: the server enforces these lists and the admin UI renders
 * them. Keeping them together means a new event or role shows up in the
 * settings screen the moment the server learns to send it, and the two can't
 * disagree about who may see what.
 */

import { z } from "zod";

/* ── Staff roles ────────────────────────────────────────────────── */

/**
 * `admin` is the owner (labelled "Owner" in the UI; the stored value predates
 * the console and stays for compatibility). `ops` runs orders and printing
 * but sees no money totals, exports or settings.
 */
export const STAFF_ROLES = ["admin", "ops"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];
export const isStaffRole = (r: unknown): r is StaffRole => STAFF_ROLES.includes(r as StaffRole);

export const ROLE_LABEL: Record<string, string> = { admin: "Owner", ops: "Ops", customer: "Customer" };

/** How long a passed second factor lasts before staff are asked again. */
export const STAFF_ELEVATION_HOURS = 12;

/* ── Notifications ──────────────────────────────────────────────── */

export const NOTIFY_EVENTS = [
  "order_paid",
  "print_ready",
  "print_failed",
  "order_shipped",
  "order_delivered",
  "order_cancelled",
  "payment_mismatch",
  "staff_sign_in",
  "daily_summary",
] as const;
export type NotifyEvent = (typeof NOTIFY_EVENTS)[number];

export interface NotifyEventInfo {
  label: string;
  /** what the message says, for the settings screen */
  description: string;
  /** false for staff-only events (security alerts, digests) */
  customerCapable: boolean;
  /** defaults used until the owner saves the rule */
  defaults: { staffEmail: boolean; customerEmail: boolean; customerWhatsapp: boolean };
  /**
   * What fills {{1}}, {{2}}, … in the WhatsApp templates the owner creates in
   * Meta's manager, in order. Meta only delivers business-started messages
   * from approved templates, so these must match the template's variables.
   */
  whatsappParams: { staff: string[]; customer: string[] };
}

export const NOTIFY_EVENT_INFO: Record<NotifyEvent, NotifyEventInfo> = {
  order_paid: {
    label: "New paid order",
    description: "Staff: order number, book and total. Customer: order confirmation with a link to the order.",
    customerCapable: true,
    defaults: { staffEmail: true, customerEmail: true, customerWhatsapp: false },
    whatsappParams: { staff: ["order number", "book title", "total"], customer: ["customer first name", "order number", "order page link"] },
  },
  print_ready: {
    label: "Print file ready",
    description: "The print PDF is built, checked and stored. Staff only.",
    customerCapable: false,
    defaults: { staffEmail: false, customerEmail: false, customerWhatsapp: false },
    whatsappParams: { staff: ["order number", "book title"], customer: [] },
  },
  print_failed: {
    label: "Print file failed",
    description: "A print file could not be built after every retry and needs someone to look.",
    customerCapable: false,
    defaults: { staffEmail: true, customerEmail: false, customerWhatsapp: false },
    whatsappParams: { staff: ["order number", "what went wrong"], customer: [] },
  },
  order_shipped: {
    label: "Order shipped",
    description: "Customer: courier and tracking number. Staff: a copy, if you want one.",
    customerCapable: true,
    defaults: { staffEmail: false, customerEmail: true, customerWhatsapp: false },
    whatsappParams: { staff: ["order number", "courier", "tracking number"], customer: ["customer first name", "order number", "courier", "tracking number"] },
  },
  order_delivered: {
    label: "Order delivered",
    description: "Customer: delivered, with a link to leave a private review.",
    customerCapable: true,
    defaults: { staffEmail: false, customerEmail: true, customerWhatsapp: false },
    whatsappParams: { staff: ["order number"], customer: ["customer first name", "order number", "review link"] },
  },
  order_cancelled: {
    label: "Order cancelled or refunded",
    description: "Customer: the order was cancelled or refunded.",
    customerCapable: true,
    defaults: { staffEmail: false, customerEmail: true, customerWhatsapp: false },
    whatsappParams: { staff: ["order number", "new status"], customer: ["customer first name", "order number", "new status"] },
  },
  payment_mismatch: {
    label: "Payment amount didn't match",
    description: "Safepay reported a different amount than the order total. The order was NOT marked paid.",
    customerCapable: false,
    defaults: { staffEmail: true, customerEmail: false, customerWhatsapp: false },
    whatsappParams: { staff: ["order number", "amount reported", "order total"], customer: [] },
  },
  staff_sign_in: {
    label: "Staff signed in to the admin",
    description: "Security alert each time someone passes the admin's second sign-in step.",
    customerCapable: false,
    defaults: { staffEmail: true, customerEmail: false, customerWhatsapp: false },
    whatsappParams: { staff: ["staff name", "IP address"], customer: [] },
  },
  daily_summary: {
    label: "Daily summary (9:00)",
    description: "Yesterday's paid orders and revenue, and anything stuck.",
    customerCapable: false,
    defaults: { staffEmail: true, customerEmail: false, customerWhatsapp: false },
    whatsappParams: { staff: ["paid orders yesterday", "revenue yesterday", "orders needing action"], customer: [] },
  },
};

/** International-format phone for WhatsApp: digits only, country code first (92…). */
export const whatsappNumberSchema = z
  .string()
  .trim()
  .transform((s) => s.replace(/[\s()+-]/g, ""))
  .transform((s) => (s.startsWith("0") ? "92" + s.slice(1) : s))
  .refine((s) => /^\d{10,15}$/.test(s), "Enter a WhatsApp number with country code, e.g. 923001234567");

/** WhatsApp template names are lower_snake_case in Meta's manager. */
const templateName = z
  .string()
  .trim()
  .max(120)
  .regex(/^[a-z0-9_]*$/, "Template names use lowercase letters, digits and _")
  .transform((s) => s || null)
  .nullable();

export const notifyRuleSchema = z.object({
  enabled: z.boolean(),
  staffEmails: z.array(z.string().trim().toLowerCase().email()).max(20),
  staffWhatsapp: z.array(whatsappNumberSchema).max(20),
  customerEmail: z.boolean(),
  customerWhatsapp: z.boolean(),
  staffTemplate: templateName,
  customerTemplate: templateName,
  templateLang: z.string().trim().regex(/^[a-z]{2}(_[A-Z]{2})?$/, "e.g. en or en_US").default("en"),
});
export type NotifyRuleInput = z.infer<typeof notifyRuleSchema>;

/* ── Print jobs ─────────────────────────────────────────────────── */

export const PRINT_STATES = ["queued", "rendering", "composing", "verifying", "checked", "failed"] as const;
export type PrintState = (typeof PRINT_STATES)[number];
export const PRINT_STATE_LABEL: Record<PrintState, string> = {
  queued: "Waiting",
  rendering: "Cutting photos",
  composing: "Building PDF",
  verifying: "Checking",
  checked: "Checked",
  failed: "Failed",
};

/** Retries before a print job is marked failed and staff are alerted. */
export const PRINT_MAX_ATTEMPTS = 5;

/** Days from payment to the delivery we promise (drives "late" flags). */
export const DELIVERY_PROMISE_DAYS = 6;

/* ── Analytics beacons ──────────────────────────────────────────── */

/**
 * What the browser may send to POST /api/events. Bounded everywhere: this
 * endpoint is public, so it must never let a client write arbitrary blobs.
 */
const vitalSchema = z.object({
  metric: z.enum(["LCP", "INP", "CLS", "FCP", "TTFB"]),
  value: z.number().min(0).max(120_000),
  rating: z.enum(["good", "needs-improvement", "poor"]).optional(),
});

export const beaconEventSchema = z.discriminatedUnion("name", [
  z.object({ name: z.literal("page_view"), path: z.string().max(200), referrer: z.string().max(300).optional() }),
  /** active (visible + interacting) milliseconds spent on a page or builder step */
  z.object({ name: z.literal("page_time"), path: z.string().max(200), step: z.string().max(40).optional(), activeMs: z.number().int().min(0).max(4 * 3600_000) }),
  z.object({ name: z.literal("step"), path: z.string().max(200), step: z.string().max(40) }),
  z.object({ name: z.literal("vital"), path: z.string().max(200), vital: vitalSchema }),
  z.object({ name: z.literal("error"), path: z.string().max(200), message: z.string().max(300), source: z.string().max(200).optional() }),
  /** 3+ taps on the same element within a second */
  z.object({ name: z.literal("rage"), path: z.string().max(200), target: z.string().max(120) }),
]);
export type BeaconEvent = z.infer<typeof beaconEventSchema>;

export const beaconSchema = z.object({
  anonId: z.string().regex(/^[a-zA-Z0-9-]{8,64}$/),
  visitId: z.string().regex(/^[a-zA-Z0-9-]{8,64}$/),
  /** sent once per visit with the first batch */
  context: z
    .object({
      screenW: z.number().int().min(0).max(20000).optional(),
      touch: z.boolean().optional(),
      /** Network Information API (Chrome/Android only) */
      connection: z.string().max(12).optional(),
      downlinkMbps: z.number().min(0).max(10_000).optional(),
      rttMs: z.number().min(0).max(60_000).optional(),
      /** download speed measured from the page's own resources */
      measuredMbps: z.number().min(0).max(10_000).optional(),
      utm: z
        .object({ source: z.string().max(60).optional(), medium: z.string().max(60).optional(), campaign: z.string().max(80).optional() })
        .optional(),
      referrerHost: z.string().max(120).optional(),
    })
    .optional(),
  events: z.array(beaconEventSchema).min(1).max(40),
});
export type Beacon = z.infer<typeof beaconSchema>;

/* ── Funnel ─────────────────────────────────────────────────────── */

/**
 * The builder's seven steps as the tracker names them (client/src/lib/
 * track.ts: `compose` is two steps, told apart by its sub-step), then "Paid",
 * which the server adds from orders. Order matters: the funnel counts people
 * who reached each step in this order.
 */
export const FUNNEL_STEPS: Array<{ id: string; label: string }> = [
  { id: "quiz", label: "1. Occasion" },
  { id: "upload", label: "2. Photos" },
  { id: "compose-0", label: "3. Feel" },
  { id: "compose-1", label: "4. Name and lettering" },
  { id: "book", label: "5. Pick your book" },
  { id: "preview", label: "6. Preview and approve" },
  { id: "order", label: "7. Checkout" },
  { id: "paid", label: "Paid" },
];
