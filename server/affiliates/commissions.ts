/**
 * Affiliate commissions: keep each order's commission lines in step with the
 * order (docs/adr/022, rules in shared/affiliates.ts).
 *
 * Approach: one idempotent function, syncCommission(orderId), works out what
 * the lines SHOULD be from the order as it is now, and makes them so:
 *
 *   order earns (live, credited, paid…delivered)  → an `earn` line for its
 *       affiliate, rate frozen at that moment; payableAt = delivered + hold
 *       once the order is delivered
 *   order no longer earns (cancelled, refunded, affiliate removed or
 *       changed) → its earn line is reversed if it was never paid out; if it
 *       was, a negative `clawback` line takes it back in the next payout
 *
 * It is called right after anything that changes an order (payment, status
 * change, the owner changing the affiliate), and a job re-runs it every 30
 * minutes for recent credited orders, so a missed call (a crash between two
 * writes) is repaired rather than lost. Calling it twice changes nothing.
 *
 * Payouts (markPaid): every approved, unpaid line (clawbacks included) up to
 * the end of a finished month, in one transaction that stamps the lines with
 * the payout id, so a double click pays once.
 */

import { and, desc, eq, gt, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { affiliateCommissions, affiliatePayouts, affiliates, orderEvents, orders, type AffiliateCommission, type AffiliatePayout, type Order } from "@shared/schema";
import { commissionFor, payableAfterDelivery, periodEnd, periodOf } from "@shared/affiliates";
import { opsDb } from "../ops/db";
import { register, schedule } from "../jobs";
import { log } from "../logger";

/** Order states in which a commission stands. */
const EARNING = ["paid", "in_production", "shipped", "delivered"];

/** The book total the customer paid: subtotal minus promo, before shipping. */
export const commissionBase = (o: Pick<Order, "subtotalMinor" | "discountMinor">) => Math.max(0, o.subtotalMinor - (o.discountMinor ?? 0));

/** When the order was marked delivered (its timeline), or null. */
async function deliveredAt(orderId: string): Promise<Date | null> {
  const db = opsDb()!;
  const [e] = await db
    .select({ at: orderEvents.createdAt })
    .from(orderEvents)
    .where(and(eq(orderEvents.orderId, orderId), eq(orderEvents.toStatus, "delivered")))
    .orderBy(desc(orderEvents.createdAt))
    .limit(1);
  return e?.at ?? null;
}

/** Make the order's commission lines match the order. Safe to call any time. */
export async function syncCommission(orderId: string): Promise<void> {
  const db = opsDb();
  if (!db) return;
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) return;
  const lines = await db.select().from(affiliateCommissions).where(eq(affiliateCommissions.orderId, orderId));
  if (!order.affiliateId && !lines.length) return;

  const earns = order.livemode && order.affiliateId !== null && EARNING.includes(order.status);
  const now = new Date();
  const why = order.status === "refunded" ? "Order refunded" : order.status === "cancelled" ? "Order cancelled" : "Credited to another affiliate";

  // 1. lines that should no longer earn
  for (const l of lines) {
    if (l.kind !== "earn" || l.reversedAt) continue;
    if (earns && l.affiliateId === order.affiliateId) continue;
    if (!l.payoutId) {
      await db.update(affiliateCommissions).set({ reversedAt: now, reversedReason: why, updatedAt: now }).where(eq(affiliateCommissions.id, l.id));
    } else if (!lines.some((c) => c.kind === "clawback" && c.affiliateId === l.affiliateId)) {
      await db
        .insert(affiliateCommissions)
        .values({
          affiliateId: l.affiliateId,
          orderId,
          kind: "clawback",
          baseMinor: l.baseMinor,
          amountMinor: -l.amountMinor,
          commissionKind: l.commissionKind,
          commissionValue: l.commissionValue,
          payableAt: now,
          reversedReason: why,
        })
        .onConflictDoNothing();
    }
  }
  if (!earns) return;

  // 2. the line that should earn
  const mine = lines.find((l) => l.kind === "earn" && l.affiliateId === order.affiliateId);
  const delivered = order.status === "delivered" ? ((await deliveredAt(orderId)) ?? order.updatedAt) : null;
  const payableAt = delivered ? payableAfterDelivery(delivered) : null;

  if (!mine) {
    const [a] = await db.select().from(affiliates).where(eq(affiliates.id, order.affiliateId!)).limit(1);
    if (!a) return;
    const base = commissionBase(order);
    await db
      .insert(affiliateCommissions)
      .values({
        affiliateId: a.id,
        orderId,
        kind: "earn",
        baseMinor: base,
        amountMinor: commissionFor(a, base),
        commissionKind: a.commissionKind,
        commissionValue: a.commissionValue,
        payableAt,
      })
      .onConflictDoNothing();
    return;
  }
  // back to this affiliate after a change: undo an unpaid reversal, or drop the unpaid clawback
  if (mine.reversedAt && !mine.payoutId) {
    await db.update(affiliateCommissions).set({ reversedAt: null, reversedReason: null, updatedAt: now }).where(eq(affiliateCommissions.id, mine.id));
  }
  const claw = lines.find((l) => l.kind === "clawback" && l.affiliateId === mine.affiliateId && !l.payoutId);
  if (claw) await db.delete(affiliateCommissions).where(eq(affiliateCommissions.id, claw.id));
  if (payableAt && !mine.payableAt) {
    await db.update(affiliateCommissions).set({ payableAt, updatedAt: now }).where(eq(affiliateCommissions.id, mine.id));
  }
}

/** Fire-and-forget form for hooks in the order flow; the job repairs a miss. */
export function syncCommissionSoon(orderId: string) {
  void syncCommission(orderId).catch((err) => log.error({ err, orderId }, "[affiliates] commission sync failed; the job retries"));
}

/* ── payouts ───────────────────────────────────────────────────── */

export class PayoutError extends Error {
  constructor(
    message: string,
    readonly status = 409,
  ) {
    super(message);
  }
}

/**
 * Pay an affiliate for `period` (a finished month): every approved, unpaid
 * line with payableAt before the month's end, including lines from earlier
 * months that were carried over. One transaction; a second click finds
 * nothing left to pay.
 */
export async function markPaid(affiliateId: string, period: string, reference: string, paidBy: string, now = new Date()): Promise<{ payout: AffiliatePayout; lines: AffiliateCommission[] }> {
  const db = opsDb();
  if (!db) throw new PayoutError("Needs the database", 503);
  if (periodEnd(period) > now) throw new PayoutError("That month hasn't finished yet. It can be paid from the 1st of next month.");
  return db.transaction(async (tx) => {
    const [a] = await tx.select().from(affiliates).where(eq(affiliates.id, affiliateId)).for("update").limit(1);
    if (!a) throw new PayoutError("No such affiliate", 404);
    const due = await tx
      .select()
      .from(affiliateCommissions)
      .where(
        and(
          eq(affiliateCommissions.affiliateId, affiliateId),
          isNull(affiliateCommissions.payoutId),
          isNull(affiliateCommissions.reversedAt),
          isNotNull(affiliateCommissions.payableAt),
          lt(affiliateCommissions.payableAt, periodEnd(period)),
        ),
      )
      .for("update");
    if (!due.length) throw new PayoutError("Nothing is due for that month (it may have been paid already).");
    const amount = due.reduce((s, l) => s + l.amountMinor, 0);
    if (amount <= 0) throw new PayoutError("Refunds taken back are larger than what was earned, so nothing is due. The balance carries to next month.");
    const [payout] = await tx
      .insert(affiliatePayouts)
      .values({ affiliateId, period, amountMinor: amount, lines: due.length, payoutMethod: a.payoutMethod, payoutAccount: a.payoutAccount, reference, paidBy, paidAt: now })
      .returning();
    await tx
      .update(affiliateCommissions)
      .set({ payoutId: payout.id, updatedAt: now })
      .where(inArray(affiliateCommissions.id, due.map((l) => l.id)));
    return { payout, lines: due };
  });
}

/** The month a line belongs to (by when it became payable); null while not yet approved. */
export const linePeriod = (l: Pick<AffiliateCommission, "payableAt">) => (l.payableAt ? periodOf(new Date(l.payableAt)) : null);

/* ── the repair job ────────────────────────────────────────────── */

/** Re-sync credited orders changed in the last 120 days. */
export async function syncRecent(): Promise<number> {
  const db = opsDb();
  if (!db) return 0;
  const rows = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(isNotNull(orders.affiliateId), gt(orders.updatedAt, sql`now() - interval '120 days'`)))
    .limit(5000);
  // orders that lost their affiliate still carry lines to reverse
  const orphaned = await db.execute<{ order_id: string }>(sql`
    SELECT DISTINCT c.order_id FROM affiliate_commissions c JOIN orders o ON o.id = c.order_id
    WHERE c.kind = 'earn' AND c.reversed_at IS NULL AND (o.affiliate_id IS DISTINCT FROM c.affiliate_id OR o.status NOT IN ('paid','in_production','shipped','delivered'))`);
  const ids = new Set([...rows.map((r) => r.id), ...orphaned.rows.map((r) => r.order_id)]);
  for (const id of Array.from(ids)) await syncCommission(id).catch((err) => log.warn({ err, orderId: id }, "[affiliates] sync failed"));
  return ids.size;
}

register("affiliates.sync", async () => void (await syncRecent()), { retryLimit: 1, expireInSeconds: 10 * 60 });
schedule("affiliates.sync", "*/30 * * * *", 30 * 60 * 1000);
