/**
 * Promo codes on the server: look a code up, count its uses, and say whether
 * it applies to an order (the rules are in shared/promo.ts).
 *
 * Uses are counted from the orders that carry the code and still stand
 * (LIVE_ORDER_STATUSES), so an expired or cancelled order gives its use back
 * and there is no counter to drift. Two orders racing for the last use can
 * both get it; for promo codes that is an acceptable edge, and the owner sees
 * every use on the Promo codes page.
 *
 * Needs the database: without one (local dev on memory storage) no code
 * exists, and the checkout says so.
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import { orders, promoCodes, type PromoCode } from "@shared/schema";
import { LIVE_ORDER_STATUSES } from "@shared/orders";
import { discountFor, normalizeCode, promoLabel, promoProblem } from "@shared/promo";
import { opsDb } from "../ops/db";

export class PromoError extends Error {
  readonly status = 400;
  readonly code = "PROMO_INVALID";
}

/** How many standing orders use a code, in all and by one customer. */
export async function promoUses(code: string, userId?: string): Promise<{ uses: number; byCustomer: number }> {
  const db = opsDb();
  if (!db) return { uses: 0, byCustomer: 0 };
  const [row] = await db
    .select({
      uses: sql<number>`count(*)::int`,
      byCustomer: sql<number>`count(*) FILTER (WHERE ${orders.userId} = ${userId ?? ""})::int`,
    })
    .from(orders)
    .where(and(eq(orders.promoCode, code), inArray(orders.status, LIVE_ORDER_STATUSES)));
  return { uses: row?.uses ?? 0, byCustomer: row?.byCustomer ?? 0 };
}

/**
 * The code, if it applies to this customer's book price: its discount and
 * label. Throws PromoError with the reason in the customer's words when not.
 */
export async function applyPromo(raw: string, userId: string, subtotalMinor: number): Promise<{ promo: PromoCode; discountMinor: number; label: string }> {
  const code = normalizeCode(raw);
  const db = opsDb();
  const [promo] = db ? await db.select().from(promoCodes).where(eq(promoCodes.code, code)).limit(1) : [];
  if (!promo) throw new PromoError("We don't recognise that code. Check the spelling.");
  const { uses, byCustomer } = await promoUses(code, userId);
  const problem = promoProblem(promo, { now: new Date(), uses, usesByCustomer: byCustomer, subtotalMinor });
  if (problem) throw new PromoError(problem);
  return { promo, discountMinor: discountFor(promo, subtotalMinor), label: promoLabel(promo) };
}
