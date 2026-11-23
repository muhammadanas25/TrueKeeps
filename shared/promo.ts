/**
 * Promo codes — the rules, shared by checkout, the server and the admin
 * (owner, 2026-11-22: every setting made in Admin › Promo codes).
 *
 * A code takes a percentage or a fixed number of rupees off the BOOK price
 * (subtotal), never off delivery, and never below zero. It can have start and
 * end dates, a total number of uses, a number of uses per customer and a
 * minimum book price, and the owner can switch it off.
 *
 * The checkout asks the server to check a code (a preview); placing the order
 * checks it again on the server and prices the order there, so a browser can
 * never set its own discount.
 */

import { z } from "zod";
import { formatPKR } from "./pricing";

export const PROMO_KINDS = ["percent", "fixed"] as const;
export type PromoKind = (typeof PROMO_KINDS)[number];

/** What a code looks like: letters, digits and dashes, 3 to 24 of them. */
export const PROMO_CODE_RE = /^[A-Z0-9-]{3,24}$/;
export const normalizeCode = (raw: string) => raw.trim().toUpperCase().replace(/\s+/g, "");

/** Body of POST/PATCH /api/admin/promos. Money in minor units (paisa). */
export const promoInputSchema = z
  .object({
    code: z.string().transform(normalizeCode).refine((c) => PROMO_CODE_RE.test(c), "Use 3 to 24 letters, digits or dashes"),
    kind: z.enum(PROMO_KINDS),
    value: z.number().int().positive(),
    startsAt: z.string().datetime().nullable().optional(),
    endsAt: z.string().datetime().nullable().optional(),
    maxUses: z.number().int().positive().nullable().optional(),
    perCustomer: z.number().int().positive().nullable().optional(),
    minSubtotalMinor: z.number().int().nonnegative().nullable().optional(),
    active: z.boolean().optional(),
    note: z.string().max(200).nullable().optional(),
  })
  .refine((p) => p.kind !== "percent" || p.value <= 90, { message: "A percentage can be at most 90", path: ["value"] })
  .refine((p) => !p.startsAt || !p.endsAt || p.startsAt < p.endsAt, { message: "The end must be after the start", path: ["endsAt"] });
export type PromoInput = z.infer<typeof promoInputSchema>;

/** Body of POST /api/promo/check (the checkout's preview). */
export const promoCheckSchema = z.object({ code: z.string().min(1).max(40), subtotalMinor: z.number().int().nonnegative() });

/** The discount on a book price, rounded to whole rupees, never more than the price. */
export function discountFor(p: { kind: string; value: number }, subtotalMinor: number): number {
  const raw = p.kind === "percent" ? (subtotalMinor * p.value) / 100 : p.value;
  return Math.max(0, Math.min(subtotalMinor, Math.round(raw / 100) * 100));
}

/** How the code reads on a receipt: "10% off" or "Rs 500 off". */
export function promoLabel(p: { kind: string; value: number }): string {
  return p.kind === "percent" ? `${p.value}% off` : `${formatPKR(p.value)} off`;
}

/**
 * Why this code can't be used on this order, in the customer's words, or null
 * when it can. `uses` and `usesByCustomer` count orders that still stand.
 */
export function promoProblem(
  p: { active: boolean; startsAt: Date | null; endsAt: Date | null; maxUses: number | null; perCustomer: number | null; minSubtotalMinor: number | null },
  ctx: { now: Date; uses: number; usesByCustomer: number; subtotalMinor: number },
): string | null {
  if (!p.active) return "That code isn't active.";
  if (p.startsAt && ctx.now < p.startsAt) return "That code isn't active yet.";
  if (p.endsAt && ctx.now >= p.endsAt) return "That code has expired.";
  if (p.maxUses !== null && ctx.uses >= p.maxUses) return "That code has been used up.";
  if (p.perCustomer !== null && ctx.usesByCustomer >= p.perCustomer) return "You've already used this code.";
  if (p.minSubtotalMinor !== null && ctx.subtotalMinor < p.minSubtotalMinor) return `This code needs a book of at least ${formatPKR(p.minSubtotalMinor)}.`;
  return null;
}
