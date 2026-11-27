/**
 * Affiliates — the rules, shared by the server, the admin and the partner page
 * (owner, 2026-11-26; design approved on the canvas, Round 6; docs/adr/022).
 *
 * What an affiliate is: a person or business with a link,
 * thetruekeeps.com/any-page?ref=CODE. The customer pays the normal price (link
 * only, no discount). When an order placed within ATTRIBUTION_DAYS of the tap
 * is paid, the affiliate earns a commission: a percentage of the book total
 * after any promo code, or a fixed amount per order (chosen per affiliate).
 * Shipping is never counted. Test orders never earn.
 *
 * When it is paid out:
 *   paid order  → "waiting for delivery"
 *   delivered   → "delivered, HOLD_DAYS-day hold" (payableAt = delivered + hold)
 *   payableAt   → "approved"; it belongs to the month (Pakistan time) of its
 *                 payableAt and is paid on PAYOUT_DAY of the month after
 *   cancelled or refunded before payout → reversed (earns nothing)
 *   refunded after payout → a negative "taken back" line in the next payout
 *
 * The three numbers are the owner's to change: each is one constant here.
 */

import { z } from "zod";
import { formatPKR } from "./pricing";

/** A tap on the link counts for this many days (last affiliate tapped wins). */
export const ATTRIBUTION_DAYS = 30;
/** Days after delivery before a commission is approved (refund window). */
export const HOLD_DAYS = 7;
/** Day of the month payouts are made, for everything approved last month. */
export const PAYOUT_DAY = 5;

const DAY_MS = 86_400_000;
const PKT_MS = 5 * 3_600_000;

/* ── codes and links ───────────────────────────────────────────── */

/** Link names: lower-case letters, digits and dashes, 2 to 32 of them. */
export const AFFILIATE_CODE_RE = /^[a-z0-9-]{2,32}$/;
export const normalizeRef = (raw: string) => raw.trim().toLowerCase();

/** The link an affiliate shares (on the home page; any page works). */
export const affiliateLink = (appUrl: string, code: string) => `${appUrl.replace(/\/$/, "")}/?ref=${code}`;

/** Name of the browser cookie that remembers a tap: `code.secondsSinceEpoch`. */
export const REF_COOKIE = "tk_ref";
export const refCookieValue = (code: string, at: Date) => `${code}.${Math.floor(at.getTime() / 1000)}`;

/** The cookie back into a code and a time; null when malformed. */
export function parseRefCookie(v: string | undefined | null): { code: string; at: Date } | null {
  const m = /^([a-z0-9-]{2,32})\.(\d{9,11})$/.exec(v ?? "");
  return m ? { code: m[1], at: new Date(Number(m[2]) * 1000) } : null;
}

/** Is a tap at `at` still inside the window at `now`? */
export const withinWindow = (at: Date, now: Date) => now.getTime() - at.getTime() <= ATTRIBUTION_DAYS * DAY_MS && at.getTime() <= now.getTime() + 60_000;

/* ── commission ────────────────────────────────────────────────── */

export const COMMISSION_KINDS = ["percent", "fixed"] as const;
export type CommissionKind = (typeof COMMISSION_KINDS)[number];

export const PAYOUT_METHODS = ["jazzcash", "easypaisa", "bank"] as const;
export type PayoutMethod = (typeof PAYOUT_METHODS)[number];
export const PAYOUT_METHOD_LABEL: Record<PayoutMethod, string> = { jazzcash: "JazzCash", easypaisa: "Easypaisa", bank: "Bank account" };

/**
 * The commission on one order, in minor units, rounded to whole rupees.
 * `baseMinor` is the book total the customer actually paid: subtotal minus
 * any promo discount, before shipping.
 */
export function commissionFor(a: { commissionKind: string; commissionValue: number }, baseMinor: number): number {
  const raw = a.commissionKind === "percent" ? (Math.max(0, baseMinor) * a.commissionValue) / 100 : a.commissionValue;
  return Math.max(0, Math.round(raw / 100) * 100);
}

/** "10% of each paid book" or "Rs 500 per order". */
export function commissionLabel(a: { commissionKind: string; commissionValue: number }): string {
  return a.commissionKind === "percent" ? `${a.commissionValue}% of each paid book` : `${formatPKR(a.commissionValue)} per order`;
}

/** Short form for tables: "10%" or "Rs 500 / order". */
export const commissionShort = (a: { commissionKind: string; commissionValue: number }) =>
  a.commissionKind === "percent" ? `${a.commissionValue}%` : `${formatPKR(a.commissionValue)} / order`;

/* ── months and payouts (Pakistan time) ────────────────────────── */

/** "2026-11": the month (Pakistan time) a moment falls in. */
export function periodOf(d: Date): string {
  const p = new Date(d.getTime() + PKT_MS);
  return `${p.getUTCFullYear()}-${String(p.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** The first instant AFTER a month (00:00 on the 1st of the next month, Pakistan time). */
export function periodEnd(period: string): Date {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m, 1) - PKT_MS);
}

/** When a month's payout is due: PAYOUT_DAY of the next month. */
export function payoutDue(period: string): Date {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m, PAYOUT_DAY) - PKT_MS);
}

/** "November 2026". */
export function periodLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** When a delivered order's commission becomes payable. */
export const payableAfterDelivery = (deliveredAt: Date) => new Date(deliveredAt.getTime() + HOLD_DAYS * DAY_MS);

/* ── commission states, as people read them ────────────────────── */

export type CommissionState = "waiting" | "hold" | "approved" | "paid" | "reversed" | "taken_back";

/**
 * One commission line's state now. `kind` is "earn" (the order's commission)
 * or "clawback" (taking back one already paid, after a refund).
 */
export function commissionState(
  c: { kind: string; reversedAt: Date | string | null; payableAt: Date | string | null; payoutId: string | null },
  now: Date,
): CommissionState {
  if (c.kind === "clawback") return c.payoutId ? "paid" : "taken_back";
  if (c.reversedAt) return "reversed";
  if (c.payoutId) return "paid";
  if (!c.payableAt) return "waiting";
  return new Date(c.payableAt) > now ? "hold" : "approved";
}

export const COMMISSION_STATE_LABEL: Record<CommissionState, string> = {
  waiting: "Waiting for delivery",
  hold: `Delivered, ${HOLD_DAYS}-day hold`,
  approved: "Approved, in next payout",
  paid: "Paid",
  reversed: "Reversed",
  taken_back: "Taken back, off next payout",
};

/* ── self-referral ─────────────────────────────────────────────── */

const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "").replace(/^(92|0)/, "");

/**
 * True when the buyer is the affiliate: the same account, the same email, or
 * the order's phone is the affiliate's JazzCash/Easypaisa number.
 */
export function isSelfReferral(
  a: { userId: string | null; email: string; payoutMethod: string; payoutAccount: string | null },
  buyer: { userId: string; email: string; phone: string | null },
): boolean {
  if (a.userId && a.userId === buyer.userId) return true;
  if (a.email.trim().toLowerCase() === buyer.email.trim().toLowerCase()) return true;
  const wallet = a.payoutMethod !== "bank" ? digits(a.payoutAccount) : "";
  return wallet.length >= 10 && wallet === digits(buyer.phone);
}

/* ── admin input ───────────────────────────────────────────────── */

/** Body of POST/PATCH /api/admin/affiliates. Money in minor units. */
export const affiliateInputSchema = z
  .object({
    name: z.string().trim().min(2, "Enter their name").max(80),
    email: z.string().trim().toLowerCase().email("Enter an email they can sign in with").max(120),
    code: z
      .string()
      .transform(normalizeRef)
      .refine((c) => AFFILIATE_CODE_RE.test(c), "Use 2 to 32 lower-case letters, digits or dashes"),
    channel: z.string().trim().max(80).nullable().optional(),
    commissionKind: z.enum(COMMISSION_KINDS),
    commissionValue: z.number().int().positive(),
    payoutMethod: z.enum(PAYOUT_METHODS),
    payoutAccount: z.string().trim().max(120).nullable().optional(),
    active: z.boolean().optional(),
    note: z.string().trim().max(300).nullable().optional(),
    /** create only: email them their link */
    sendWelcome: z.boolean().optional(),
  })
  .refine((a) => a.commissionKind !== "percent" || a.commissionValue <= 50, { message: "A percentage can be at most 50", path: ["commissionValue"] });
export type AffiliateInput = z.infer<typeof affiliateInputSchema>;

/** Body of POST /api/admin/affiliates/:id/payouts. */
export const markPayoutSchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/),
  reference: z.string().trim().min(2, "Enter the JazzCash, Easypaisa or bank reference").max(80),
});

/** Body of PUT /api/admin/orders/:id/affiliate. */
export const setOrderAffiliateSchema = z.object({
  affiliateId: z.string().min(1).max(64).nullable(),
  note: z.string().trim().max(300).optional(),
});
