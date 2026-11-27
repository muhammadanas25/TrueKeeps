/**
 * Affiliates API (docs/adr/022; design: canvas Round 6, R6Affiliates /
 * R6Affiliate / R6Partner).
 *
 *   Owner (under /api/admin, so the staff gate has run; plus requireStaff(["admin"])):
 *   GET   /api/admin/affiliates                list + KPIs
 *   POST  /api/admin/affiliates                add (optionally email them their link)
 *   GET   /api/admin/affiliates/:id            one affiliate: KPIs, credited orders, payouts
 *   PATCH /api/admin/affiliates/:id            edit, pause or resume
 *   POST  /api/admin/affiliates/:id/payouts    mark a finished month paid, with the reference
 *   PUT   /api/admin/orders/:id/affiliate      add, change or remove an order's affiliate
 *
 *   The affiliate (signed in with a verified email):
 *   GET   /api/partner/me                      their link, numbers, money and orders
 *
 * Money and the payout account are owner-only. The partner answer never
 * carries a customer's name, email, phone or address: just the date, the
 * book type and the commission.
 */

import { Router } from "express";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { affiliateCommissions, affiliatePayouts, affiliates, affiliateVisits, orders, type Affiliate, type AffiliateCommission } from "@shared/schema";
import {
  ATTRIBUTION_DAYS,
  COMMISSION_STATE_LABEL,
  HOLD_DAYS,
  PAYOUT_DAY,
  PAYOUT_METHOD_LABEL,
  affiliateInputSchema,
  affiliateLink,
  commissionLabel,
  commissionState,
  markPayoutSchema,
  payoutDue,
  periodEnd,
  periodLabel,
  periodOf,
  setOrderAffiliateSchema,
  type CommissionState,
  type PayoutMethod,
} from "@shared/affiliates";
import { formatPKR } from "@shared/pricing";
import { requireStaff } from "../middleware/staff";
import { requireMember, currentUser } from "../middleware/auth";
import { requireOpsDb, opsDb, type OpsDb } from "../ops/db";
import { audit } from "../ops/audit";
import { storage } from "../storage";
import { config } from "../config";
import { log } from "../logger";
import { emailProvider } from "../email";
import { affiliatePaidEmail, affiliateWelcomeEmail } from "../email/templates";
import { forgetAffiliate } from "../affiliates/attribution";
import { markPaid, PayoutError, syncCommission } from "../affiliates/commissions";
import { asyncHandler, parse } from "./helpers";

export const affiliatesRouter = Router();
const owner = requireStaff(["admin"]);
const DAY = 86_400_000;
const partnersUrl = () => `${config.appUrl}/partners`;

/* ── reading lines ─────────────────────────────────────────────── */

type Line = AffiliateCommission & { orderNumber: string; binding: string; pageCount: number; qty: number; status: string; paidAt: Date | null; orderCreatedAt: Date };

async function linesOf(db: OpsDb, affiliateIds: string[]): Promise<Line[]> {
  if (!affiliateIds.length) return [];
  return db
    .select({
      c: affiliateCommissions,
      orderNumber: orders.orderNumber,
      binding: orders.binding,
      pageCount: orders.pageCount,
      qty: orders.qty,
      status: orders.status,
      paidAt: orders.paidAt,
      orderCreatedAt: orders.createdAt,
    })
    .from(affiliateCommissions)
    .innerJoin(orders, eq(orders.id, affiliateCommissions.orderId))
    .where(inArray(affiliateCommissions.affiliateId, affiliateIds))
    .orderBy(desc(orders.createdAt), affiliateCommissions.kind)
    .then((rows) => rows.map((r) => ({ ...r.c, orderNumber: r.orderNumber, binding: r.binding, pageCount: r.pageCount, qty: r.qty, status: r.status, paidAt: r.paidAt, orderCreatedAt: r.orderCreatedAt })));
}

/** Money and counts from a set of lines, as of `now`. */
function summarize(lines: Line[], now: Date, since?: Date) {
  let orders = 0,
    sales = 0,
    waiting = 0,
    toPay = 0,
    earned = 0;
  let nextPeriod: string | null = null;
  // an order refunded after payout has a clawback line: it no longer counts as a sale
  const clawed = new Set(lines.filter((l) => l.kind === "clawback").map((l) => `${l.orderId}|${l.affiliateId}`));
  for (const l of lines) {
    const st = commissionState(l, now);
    const inRange = !since || (l.paidAt ?? l.orderCreatedAt) >= since;
    if (l.kind === "earn" && st !== "reversed" && !clawed.has(`${l.orderId}|${l.affiliateId}`) && inRange) {
      orders++;
      sales += l.baseMinor;
      earned += l.amountMinor;
    }
    if (st === "waiting" || st === "hold") waiting += l.amountMinor;
    if (st === "approved" || st === "taken_back") {
      toPay += l.amountMinor;
      const p = periodOf(new Date(l.payableAt!));
      if (!nextPeriod || p < nextPeriod) nextPeriod = p;
    }
  }
  return { orders, sales, waiting, toPay, earned, nextDue: nextPeriod ? payoutDue(nextPeriod).toISOString() : null };
}

/** Distinct visitors per affiliate since a date. */
async function visitorsSince(db: OpsDb, since: Date, ids?: string[]): Promise<Map<string, number>> {
  const rows = await db
    .select({ id: affiliateVisits.affiliateId, n: sql<number>`count(DISTINCT ${affiliateVisits.visitorId})::int` })
    .from(affiliateVisits)
    .where(and(gte(affiliateVisits.day, since.toISOString().slice(0, 10)), ids ? inArray(affiliateVisits.affiliateId, ids) : sql`true`))
    .groupBy(affiliateVisits.affiliateId);
  return new Map(rows.map((r) => [r.id, r.n]));
}

/** People credited to an affiliate who went on to start a book after the tap. */
async function startedBook(db: OpsDb, affiliateId: string, since: Date): Promise<number> {
  const r = await db.execute<{ n: number }>(sql`
    SELECT count(DISTINCT p.user_id)::int AS n FROM projects p JOIN users u ON u.id = p.user_id
    WHERE u.affiliate_id = ${affiliateId} AND p.created_at >= u.affiliate_at AND p.created_at >= ${since}`);
  return r.rows[0]?.n ?? 0;
}

const bookOf = (l: Pick<Line, "binding" | "pageCount" | "qty">) =>
  `${l.binding.charAt(0).toUpperCase()}${l.binding.slice(1)} · ${l.pageCount} pages${l.qty > 1 ? ` · ×${l.qty}` : ""}`;

/** "0300 •••• 221": enough for the affiliate to recognise, not to copy. */
export const maskAccount = (s: string | null) => {
  const d = (s ?? "").replace(/\s/g, "");
  return d.length < 7 ? d : `${d.slice(0, 4)} •••• ${d.slice(-3)}`;
};

function lineState(l: Line, now: Date, payouts: Map<string, Date>) {
  const st = commissionState(l, now);
  let label = COMMISSION_STATE_LABEL[st];
  if (st === "hold") label = `Delivered, payable ${new Date(l.payableAt!).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Karachi" })}`;
  if (st === "paid" && l.payoutId && payouts.get(l.payoutId))
    label = `Paid ${payouts.get(l.payoutId)!.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Karachi" })}`;
  if (st === "reversed") label = `Reversed: ${(l.reversedReason ?? "").replace(/^Order /, "").toLowerCase() || "removed"}`;
  return { state: st as CommissionState, label };
}

/* ── owner: list ───────────────────────────────────────────────── */

affiliatesRouter.get(
  "/api/admin/affiliates",
  owner,
  asyncHandler(async (_req, res) => {
    const db = requireOpsDb();
    const now = new Date();
    const since = new Date(now.getTime() - ATTRIBUTION_DAYS * DAY);
    const list = await db.select().from(affiliates).orderBy(desc(affiliates.active), desc(affiliates.createdAt));
    const lines = await linesOf(
      db,
      list.map((a) => a.id),
    );
    const visitors = await visitorsSince(db, since);
    const [paidOut] = await db.select({ n: sql<number>`coalesce(sum(${affiliatePayouts.amountMinor}),0)::int` }).from(affiliatePayouts);
    const [all30] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(orders)
      .where(and(eq(orders.livemode, true), inArray(orders.status, ["paid", "in_production", "shipped", "delivered"]), gte(orders.paidAt, since)));
    const total = summarize(lines, now);
    const last30 = summarize(lines, now, since);
    const owed = new Set(lines.filter((l) => ["approved", "taken_back"].includes(commissionState(l, now))).map((l) => l.affiliateId));
    res.json({
      kpis: {
        orders30: last30.orders,
        allOrders30: all30?.n ?? 0,
        sales30: last30.sales,
        waiting: total.waiting,
        toPay: total.toPay,
        toPayCount: owed.size,
        nextDue: total.nextDue,
        paidOut: paidOut?.n ?? 0,
      },
      rows: list.map((a) => {
        const s = summarize(
          lines.filter((l) => l.affiliateId === a.id),
          now,
        );
        return { ...publicAffiliate(a), visitors30: visitors.get(a.id) ?? 0, orders: s.orders, sales: s.sales, waiting: s.waiting, toPay: s.toPay };
      }),
    });
  }),
);

/** What the admin sees of an affiliate (everything; the owner set it). */
const publicAffiliate = (a: Affiliate) => ({
  id: a.id,
  code: a.code,
  name: a.name,
  email: a.email,
  channel: a.channel,
  commissionKind: a.commissionKind,
  commissionValue: a.commissionValue,
  commission: commissionLabel(a),
  payoutMethod: a.payoutMethod,
  payoutAccount: a.payoutAccount,
  active: a.active,
  note: a.note,
  link: affiliateLink(config.appUrl, a.code),
  signedIn: Boolean(a.userId),
  createdAt: a.createdAt,
});

/* ── owner: add / edit ─────────────────────────────────────────── */

const rowOf = (b: ReturnType<typeof affiliateInputSchema.parse>) => ({
  name: b.name,
  email: b.email,
  code: b.code,
  channel: b.channel ?? null,
  commissionKind: b.commissionKind,
  commissionValue: b.commissionValue,
  payoutMethod: b.payoutMethod,
  payoutAccount: b.payoutAccount ?? null,
  active: b.active ?? true,
  note: b.note ?? null,
});

async function sendWelcome(a: Affiliate) {
  try {
    const tpl = affiliateWelcomeEmail({
      name: a.name,
      link: affiliateLink(config.appUrl, a.code),
      commission: commissionLabel(a),
      partnersUrl: partnersUrl(),
      windowDays: ATTRIBUTION_DAYS,
      payoutDay: PAYOUT_DAY,
    });
    await emailProvider.send({ to: a.email, ...tpl, idempotencyKey: `affiliate-welcome-${a.id}` });
  } catch (err) {
    log.error({ err, affiliateId: a.id }, "[affiliates] welcome email failed");
  }
}

affiliatesRouter.post(
  "/api/admin/affiliates",
  owner,
  asyncHandler(async (req, res) => {
    const body = parse(affiliateInputSchema, req.body, res);
    if (!body) return;
    const db = requireOpsDb();
    const [clash] = await db.select({ id: affiliates.id }).from(affiliates).where(eq(affiliates.code, body.code)).limit(1);
    if (clash) return res.status(409).json({ error: `The link name "${body.code}" is taken. Pick another.` });
    const [row] = await db
      .insert(affiliates)
      .values({ ...rowOf(body), createdBy: req.staff?.userId ?? null })
      .returning();
    forgetAffiliate(row.code);
    void audit(req, "affiliate.create", { type: "affiliate", id: row.id }, { code: row.code, kind: row.commissionKind, value: row.commissionValue });
    if (body.sendWelcome !== false) void sendWelcome(row);
    res.status(201).json(publicAffiliate(row));
  }),
);

affiliatesRouter.patch(
  "/api/admin/affiliates/:id",
  owner,
  asyncHandler(async (req, res) => {
    const body = parse(affiliateInputSchema, req.body, res);
    if (!body) return;
    const db = requireOpsDb();
    const [before] = await db.select().from(affiliates).where(eq(affiliates.id, req.params.id)).limit(1);
    if (!before) return res.status(404).json({ error: "No such affiliate" });
    const [clash] = await db.select({ id: affiliates.id }).from(affiliates).where(eq(affiliates.code, body.code)).limit(1);
    if (clash && clash.id !== before.id) return res.status(409).json({ error: `The link name "${body.code}" is taken. Pick another.` });
    // a new email must sign in again before they see the partner page
    const [row] = await db
      .update(affiliates)
      .set({ ...rowOf(body), userId: body.email === before.email ? before.userId : null, updatedAt: new Date() })
      .where(eq(affiliates.id, before.id))
      .returning();
    forgetAffiliate(before.code);
    forgetAffiliate(row.code);
    void audit(req, "affiliate.update", { type: "affiliate", id: row.id }, {
      active: row.active,
      code: row.code !== before.code ? `${before.code} → ${row.code}` : undefined,
      commission: row.commissionKind !== before.commissionKind || row.commissionValue !== before.commissionValue ? `${commissionLabel(before)} → ${commissionLabel(row)}` : undefined,
      payout: row.payoutAccount !== before.payoutAccount || row.payoutMethod !== before.payoutMethod ? "changed" : undefined,
    });
    res.json(publicAffiliate(row));
  }),
);

/* ── owner: one affiliate ──────────────────────────────────────── */

affiliatesRouter.get(
  "/api/admin/affiliates/:id",
  owner,
  asyncHandler(async (req, res) => {
    const db = requireOpsDb();
    const [a] = await db.select().from(affiliates).where(eq(affiliates.id, req.params.id)).limit(1);
    if (!a) return res.status(404).json({ error: "No such affiliate" });
    const now = new Date();
    const since = new Date(now.getTime() - ATTRIBUTION_DAYS * DAY);
    const lines = await linesOf(db, [a.id]);
    const payouts = await db.select().from(affiliatePayouts).where(eq(affiliatePayouts.affiliateId, a.id)).orderBy(desc(affiliatePayouts.paidAt));
    const paidAtOf = new Map(payouts.map((p) => [p.id, p.paidAt]));
    const last30 = summarize(lines, now, since);
    const total = summarize(lines, now);
    const visitors = (await visitorsSince(db, since, [a.id])).get(a.id) ?? 0;

    // unpaid approved money, by the month it belongs to; a finished month can be paid
    const current = periodOf(now);
    const open = new Map<string, { amount: number; lines: number }>();
    for (const l of lines) {
      const st = commissionState(l, now);
      if (st !== "approved" && st !== "taken_back") continue;
      const p = periodOf(new Date(l.payableAt!));
      const o = open.get(p) ?? { amount: 0, lines: 0 };
      o.amount += l.amountMinor;
      o.lines++;
      open.set(p, o);
    }
    // a payout covers its month and every unpaid month before it
    const months = Array.from(open.keys()).sort();
    let carried = 0,
      carriedLines = 0;
    const due = months.map((p) => {
      const o = open.get(p)!;
      carried += o.amount;
      carriedLines += o.lines;
      return { period: p, label: periodLabel(p), amount: carried, lines: carriedLines, ownAmount: o.amount, due: payoutDue(p).toISOString(), canPay: p < current && carried > 0 };
    });

    res.json({
      affiliate: publicAffiliate(a),
      kpis: {
        visitors30: visitors,
        started30: await startedBook(db, a.id, since),
        orders30: last30.orders,
        sales30: last30.sales,
        waiting: total.waiting,
        toPay: total.toPay,
        nextDue: total.nextDue,
        paidOut: payouts.reduce((s, p) => s + p.amountMinor, 0),
      },
      lines: lines.map((l) => ({
        id: l.id,
        orderId: l.orderId,
        orderNumber: l.orderNumber,
        kind: l.kind,
        paidAt: l.paidAt,
        book: bookOf(l),
        status: l.status,
        base: l.baseMinor,
        amount: l.amountMinor,
        ...lineState(l, now, paidAtOf),
      })),
      // the latest finished month with money due is the one to pay; earlier ones fold into it
      due: due.filter((d, i) => !d.canPay || !due.slice(i + 1).some((x) => x.canPay)),
      payouts: payouts.map((p) => ({ id: p.id, period: p.period, label: periodLabel(p.period), amount: p.amountMinor, lines: p.lines, method: PAYOUT_METHOD_LABEL[p.payoutMethod as PayoutMethod] ?? p.payoutMethod, reference: p.reference, paidBy: p.paidBy, paidAt: p.paidAt })),
      rules: { holdDays: HOLD_DAYS, payoutDay: PAYOUT_DAY, windowDays: ATTRIBUTION_DAYS },
    });
  }),
);

/* ── owner: mark a month paid ──────────────────────────────────── */

affiliatesRouter.post(
  "/api/admin/affiliates/:id/payouts",
  owner,
  asyncHandler(async (req, res) => {
    const body = parse(markPayoutSchema, req.body, res);
    if (!body) return;
    try {
      const { payout, lines } = await markPaid(req.params.id, body.period, body.reference, req.staff?.email ?? "owner");
      void audit(req, "affiliate.payout", { type: "affiliate", id: req.params.id }, { period: body.period, amount: payout.amountMinor, lines: lines.length, reference: body.reference });
      const [a] = await requireOpsDb().select().from(affiliates).where(eq(affiliates.id, req.params.id)).limit(1);
      if (a) {
        const tpl = affiliatePaidEmail({
          name: a.name,
          amount: formatPKR(payout.amountMinor),
          month: periodLabel(payout.period),
          method: PAYOUT_METHOD_LABEL[a.payoutMethod as PayoutMethod] ?? a.payoutMethod,
          reference: payout.reference,
          partnersUrl: partnersUrl(),
        });
        void emailProvider.send({ to: a.email, ...tpl, idempotencyKey: `affiliate-paid-${payout.id}` }).catch((err) => log.error({ err }, "[affiliates] payout email failed"));
      }
      res.status(201).json({ payout });
    } catch (err) {
      if (err instanceof PayoutError) return res.status(err.status).json({ error: err.message });
      throw err;
    }
  }),
);

/* ── owner: an order's affiliate by hand ───────────────────────── */

affiliatesRouter.put(
  "/api/admin/orders/:id/affiliate",
  owner,
  asyncHandler(async (req, res) => {
    const body = parse(setOrderAffiliateSchema, req.body, res);
    if (!body) return;
    const db = requireOpsDb();
    const [order] = await db.select().from(orders).where(eq(orders.id, req.params.id)).limit(1);
    if (!order) return res.status(404).json({ error: "Order not found" });
    let name = "none";
    if (body.affiliateId) {
      const [a] = await db.select().from(affiliates).where(eq(affiliates.id, body.affiliateId)).limit(1);
      if (!a) return res.status(404).json({ error: "No such affiliate" });
      name = `${a.name} (${a.code})`;
    }
    if (body.affiliateId === order.affiliateId) return res.json({ ok: true, unchanged: true });
    let before = "none";
    if (order.affiliateId) {
      const [b] = await db.select().from(affiliates).where(eq(affiliates.id, order.affiliateId)).limit(1);
      before = b ? `${b.name} (${b.code})` : order.affiliateId;
    }
    await db
      .update(orders)
      .set({ affiliateId: body.affiliateId, affiliateSource: body.affiliateId ? "admin" : null, updatedAt: new Date() })
      .where(eq(orders.id, order.id));
    await storage.addOrderEvent({ orderId: order.id, kind: "note", actor: "admin", note: `Affiliate: ${before} → ${name}${body.note ? `. ${body.note}` : ""}` });
    void audit(req, "order.affiliate", { type: "order", id: order.id }, { from: before, to: name, note: body.note });
    await syncCommission(order.id);
    res.json({ ok: true });
  }),
);

/** For the order page in the admin: who is credited and the commission line(s). */
export async function orderAffiliateInfo(orderId: string, affiliateId: string | null) {
  const db = opsDb();
  if (!db) return null;
  const [a] = affiliateId ? await db.select().from(affiliates).where(eq(affiliates.id, affiliateId)).limit(1) : [];
  const lines = await db.select().from(affiliateCommissions).where(eq(affiliateCommissions.orderId, orderId));
  if (!a && !lines.length) return { affiliate: null, lines: [] };
  const now = new Date();
  const names = new Map<string, string>();
  if (lines.length) {
    const rows = await db
      .select({ id: affiliates.id, name: affiliates.name })
      .from(affiliates)
      .where(
        inArray(
          affiliates.id,
          lines.map((l) => l.affiliateId),
        ),
      );
    rows.forEach((r) => names.set(r.id, r.name));
  }
  return {
    affiliate: a ? { id: a.id, name: a.name, code: a.code, commission: commissionLabel(a) } : null,
    lines: lines.map((l) => ({ affiliate: names.get(l.affiliateId) ?? "", kind: l.kind, amount: l.amountMinor, state: COMMISSION_STATE_LABEL[commissionState(l, now)] })),
  };
}

/** For the owner's pickers: every affiliate's id, name and link name. */
affiliatesRouter.get(
  "/api/admin/affiliates-picker",
  owner,
  asyncHandler(async (_req, res) => {
    const db = requireOpsDb();
    res.json(await db.select({ id: affiliates.id, name: affiliates.name, code: affiliates.code, active: affiliates.active }).from(affiliates).orderBy(affiliates.name));
  }),
);

/* ── the affiliate's own page ──────────────────────────────────── */

affiliatesRouter.get(
  "/api/partner/me",
  requireMember,
  asyncHandler(async (req, res) => {
    const db = opsDb();
    if (!db) return res.json({ affiliate: null });
    const user = currentUser(req) as { id: string; email: string; emailVerified?: boolean };
    // the account it was linked to, else this verified email (linked now)
    let a: Affiliate | undefined = (await db.select().from(affiliates).where(eq(affiliates.userId, user.id)).limit(1))[0];
    if (!a && user.emailVerified) {
      const [byEmail] = await db
        .select()
        .from(affiliates)
        .where(eq(affiliates.email, user.email.toLowerCase()))
        .orderBy(desc(affiliates.createdAt))
        .limit(1);
      if (byEmail && !byEmail.userId) {
        await db.update(affiliates).set({ userId: user.id }).where(eq(affiliates.id, byEmail.id));
        a = byEmail;
      }
    }
    if (!a) return res.json({ affiliate: null });

    const now = new Date();
    const month = periodOf(now);
    const monthStart = periodEnd(prevPeriod(month)); // 00:00 on the 1st, Pakistan time
    const lines = await linesOf(db, [a.id]);
    const payouts = await db.select().from(affiliatePayouts).where(eq(affiliatePayouts.affiliateId, a.id)).orderBy(desc(affiliatePayouts.paidAt));
    const paidAtOf = new Map(payouts.map((p) => [p.id, p.paidAt]));
    const thisMonth = summarize(lines, now, monthStart);
    const total = summarize(lines, now);
    res.json({
      affiliate: {
        name: a.name,
        link: affiliateLink(config.appUrl, a.code),
        commission: commissionLabel(a),
        active: a.active,
        payout: `${PAYOUT_METHOD_LABEL[a.payoutMethod as PayoutMethod] ?? a.payoutMethod} ${maskAccount(a.payoutAccount)}`.trim(),
      },
      month: periodLabel(month),
      kpis: {
        visitors: (await visitorsSince(db, monthStart, [a.id])).get(a.id) ?? 0,
        started: await startedBook(db, a.id, monthStart),
        orders: thisMonth.orders,
        earned: thisMonth.earned,
      },
      money: { waiting: total.waiting, due: total.toPay, nextDue: total.nextDue, paid: payouts.reduce((s, p) => s + p.amountMinor, 0) },
      // no customer details, by design
      orders: lines.slice(0, 60).map((l) => ({
        id: l.id,
        date: l.paidAt ?? l.orderCreatedAt,
        book: l.binding.charAt(0).toUpperCase() + l.binding.slice(1),
        kind: l.kind,
        amount: l.amountMinor,
        ...lineState(l, now, paidAtOf),
      })),
      payouts: payouts.map((p) => ({ label: periodLabel(p.period), amount: p.amountMinor, reference: p.reference, paidAt: p.paidAt })),
      rules: { windowDays: ATTRIBUTION_DAYS, holdDays: HOLD_DAYS, payoutDay: PAYOUT_DAY },
    });
  }),
);

/** "2026-10" for "2026-11". */
function prevPeriod(p: string): string {
  const [y, m] = p.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

