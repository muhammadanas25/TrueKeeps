/**
 * The admin console's API (docs/adr/018). Everything here sits under
 * /api/admin, so the staff gate (server/routes.ts → requireStaff) has already
 * checked: signed in, staff role fresh from the database, IP allow-list,
 * second sign-in step passed. Owner-only parts add requireStaff(["admin"]).
 *
 *   GET  /api/admin/ops/overview                 needs action, KPIs*, revenue*, funnel*, print pipeline
 *   GET  /api/admin/ops/orders                   list: view tabs, search, pages of 25
 *   GET  /api/admin/ops/orders/:id               full detail: contact, print jobs, messages, payments
 *   GET  /api/admin/ops/orders/:id/print/:v/:kind  15-minute download link (audited)
 *   GET  /api/admin/ops/print                    print queue board
 *   GET  /api/admin/ops/analytics/:report*       sales | funnel | audience | network | speed | experience
 *   GET  /api/admin/ops/notifications            message log
 *   POST /api/admin/ops/notifications/:id/resend
 *   GET  /api/admin/ops/notify-rules*, PUT /api/admin/ops/notify-rules/:event*, POST …/:event/test*
 *   GET  /api/admin/ops/team*, POST /api/admin/ops/team/invite*, PATCH /api/admin/ops/team/:userId*,
 *   POST /api/admin/ops/team/:userId/reset-2fa*
 *   GET  /api/admin/ops/audit*
 *   GET  /api/admin/ops/export/orders.csv*       (audited)
 *                                                * Owner only
 *
 * Money (revenue, totals in summaries) is Owner-only; Ops sees orders,
 * customers' contact details and print status, which is what they work with.
 * Test (sandbox) orders are left out of every figure unless `test=1`.
 */

import path from "path";
import { Router, type Request } from "express";
import { z } from "zod";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  auditLog,
  notifications,
  orderEvents,
  orders,
  payments,
  printJobs,
  promoCodes,
  staffElevations,
  staffFactors,
  staffInvites,
  users,
  type Order,
  type PrintJob,
} from "@shared/schema";
import { DELIVERY_PROMISE_DAYS, FUNNEL_STEPS, NOTIFY_EVENTS, NOTIFY_EVENT_INFO, notifyRuleSchema, STAFF_ROLES, type NotifyEvent } from "@shared/ops";
import { formatPKR } from "@shared/pricing";
import { promoInputSchema } from "@shared/promo";
import { LIVE_ORDER_STATUSES } from "@shared/orders";
import { requireStaff, isOwner } from "../middleware/staff";
import { requireOpsDb, type OpsDb } from "../ops/db";
import { audit } from "../ops/audit";
import { setRole } from "../ops/roles";
import { mediaStore } from "../media";
import { listRules, saveRule } from "../notify/rules";
import { notifyEvent, resendNotification } from "../notify/outbox";
import { percentile, BUCKET_BOUNDS } from "../analytics/latency";
import { register, schedule } from "../jobs";
import { log } from "../logger";
import { asyncHandler, parse } from "./helpers";
import { orderAffiliateInfo } from "./affiliates";

export const adminConsoleRouter = Router();
const owner = requireStaff(["admin"]);

/* ── shared helpers ─────────────────────────────────────────────── */

const PKT_OFFSET_MS = 5 * 3600_000;
const DAY = 86400_000;
/** Midnight in Pakistan, as a UTC instant. */
const pktMidnight = (t: number) => Math.floor((t + PKT_OFFSET_MS) / DAY) * DAY - PKT_OFFSET_MS;

export function periodRange(period: unknown) {
  const now = Date.now();
  const days = period === "today" ? 1 : period === "30d" ? 30 : period === "90d" ? 90 : 7;
  const from = period === "today" ? pktMidnight(now) : pktMidnight(now) - (days - 1) * DAY;
  const span = now - from;
  return { from: new Date(from), to: new Date(now), prevFrom: new Date(from - span), prevTo: new Date(from), days };
}

const PAID = ["paid", "in_production", "shipped", "delivered"];
/** Leave test (sandbox) orders out unless `test=1`. `alias` is the orders table's alias in raw SQL. */
const liveOnly = (req: Request, alias?: string) => (req.query.test === "1" ? sql`true` : sql.raw(`${alias ? alias + "." : ""}livemode = true`));

type Row = Record<string, unknown>;
async function rows<T = Row>(db: OpsDb, q: ReturnType<typeof sql>): Promise<T[]> {
  return (await db.execute(q)).rows as T[];
}

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

/** The latest print job per order, for a set of orders. */
async function latestJobs(db: OpsDb, orderIds: string[]): Promise<Map<string, PrintJob>> {
  if (!orderIds.length) return new Map();
  const list = await db.select().from(printJobs).where(inArray(printJobs.orderId, orderIds)).orderBy(desc(printJobs.version));
  const out = new Map<string, PrintJob>();
  for (const j of list) if (!out.has(j.orderId)) out.set(j.orderId, j);
  return out;
}

const deliverBy = (o: Pick<Order, "paidAt">) => (o.paidAt ? new Date(o.paidAt.getTime() + DELIVERY_PROMISE_DAYS * DAY) : null);

/* ── needs action ───────────────────────────────────────────────── */

export interface ActionItem {
  orderId: string;
  orderNumber: string;
  kind: "print" | "late" | "printer" | "delivery" | "transfer" | "payment";
  text: string;
  since: string;
}

/** Everything that is waiting on a person, oldest first. */
export async function needsAction(db: OpsDb): Promise<ActionItem[]> {
  const out: ActionItem[] = [];
  const failed = await rows<{ order_id: string; order_number: string; last_error: string | null; state_changed_at: Date; problems: unknown }>(
    db,
    sql`SELECT DISTINCT ON (j.order_id) j.order_id, o.order_number, j.last_error, j.state, j.state_changed_at, j.problems
        FROM print_jobs j JOIN orders o ON o.id = j.order_id
        WHERE o.status IN ('paid','in_production')
        ORDER BY j.order_id, j.version DESC`,
  );
  for (const f of failed as Array<Row>) {
    const problems = (f.problems as unknown[] | null)?.length ?? 0;
    if (f.state === "failed") out.push({ orderId: String(f.order_id), orderNumber: String(f.order_number), kind: "print", text: `Print file failed: ${String(f.last_error ?? "unknown error").slice(0, 120)}`, since: new Date(f.state_changed_at as Date).toISOString() });
    else if (f.state === "checked" && problems) out.push({ orderId: String(f.order_id), orderNumber: String(f.order_number), kind: "print", text: `Print file built with ${problems} problem(s). Check before printing.`, since: new Date(f.state_changed_at as Date).toISOString() });
  }
  const now = Date.now();
  const list = await db
    .select()
    .from(orders)
    .where(sql`${orders.status} IN ('paid','in_production','shipped') OR (${orders.status} = 'pending_payment' AND ${orders.paymentProvider} = 'bank_transfer')`)
    .limit(500);
  for (const o of list) {
    const due = deliverBy(o);
    const changed = o.updatedAt.getTime();
    if (o.status === "pending_payment") out.push({ orderId: o.id, orderNumber: o.orderNumber, kind: "transfer", text: `Waiting for a bank transfer of ${formatPKR(o.totalMinor)}. Check the account, then mark paid.`, since: o.createdAt.toISOString() });
    else if (o.status === "paid" && o.paidAt && now - o.paidAt.getTime() > DAY) out.push({ orderId: o.id, orderNumber: o.orderNumber, kind: "late", text: `Paid ${Math.round((now - o.paidAt.getTime()) / 3600_000)} h ago and not sent to the printer yet.`, since: o.paidAt.toISOString() });
    else if (o.status === "in_production" && now - changed > 5 * DAY) out.push({ orderId: o.id, orderNumber: o.orderNumber, kind: "printer", text: "At the printer for more than 5 days.", since: o.updatedAt.toISOString() });
    else if (o.status === "shipped" && now - changed > 7 * DAY) out.push({ orderId: o.id, orderNumber: o.orderNumber, kind: "delivery", text: "Shipped over 7 days ago and not marked delivered.", since: o.updatedAt.toISOString() });
    if (due && due.getTime() < now && (o.status === "paid" || o.status === "in_production")) {
      out.push({ orderId: o.id, orderNumber: o.orderNumber, kind: "late", text: `Past its promised delivery date (${due.toLocaleDateString("en-PK", { day: "numeric", month: "short" })}) and not shipped.`, since: due.toISOString() });
    }
  }
  const mismatches = await rows<{ order_id: string; order_number: string; created_at: Date }>(
    db,
    sql`SELECT e.order_id, o.order_number, max(e.created_at) AS created_at FROM order_events e JOIN orders o ON o.id = e.order_id
        WHERE e.kind = 'amount_mismatch' AND e.created_at > now() - interval '7 days' AND o.status IN ('pending_payment','expired')
        GROUP BY e.order_id, o.order_number`,
  );
  for (const m of mismatches) out.push({ orderId: m.order_id, orderNumber: m.order_number, kind: "payment", text: "Safepay reported a different amount. Not marked paid; check Safepay.", since: new Date(m.created_at).toISOString() });
  return out.sort((a, b) => a.since.localeCompare(b.since));
}

/* ── overview ───────────────────────────────────────────────────── */

async function salesBetween(db: OpsDb, req: Request, from: Date, to: Date) {
  const [r] = await rows(
    db,
    sql`SELECT count(*)::int AS orders, coalesce(sum(total_minor),0)::bigint AS revenue FROM orders
        WHERE status IN ('paid','in_production','shipped','delivered') AND paid_at >= ${from} AND paid_at < ${to} AND ${liveOnly(req)}`,
  );
  return { orders: num(r.orders), revenueMinor: num(r.revenue) };
}

async function dailyRevenue(db: OpsDb, req: Request, from: Date, days: number) {
  const r = await rows<{ day: number; revenue: string }>(
    db,
    sql`SELECT floor(extract(epoch FROM (paid_at - ${from}::timestamptz)) / 86400)::int AS day, sum(total_minor) AS revenue FROM orders
        WHERE status IN ('paid','in_production','shipped','delivered') AND paid_at >= ${from} AND paid_at < ${new Date(from.getTime() + days * DAY)} AND ${liveOnly(req)}
        GROUP BY 1`,
  );
  const out = new Array(days).fill(0);
  for (const x of r) if (x.day >= 0 && x.day < days) out[x.day] = num(x.revenue);
  return out;
}

/** Books → paid, counted in books (projects) started in the window. */
async function bookFunnel(db: OpsDb, req: Request, from: Date, to: Date) {
  const [r] = await rows(
    db,
    sql`WITH p AS (SELECT id, document FROM projects WHERE created_at >= ${from} AND created_at < ${to} AND source = 'builder')
        SELECT
          (SELECT count(*) FROM p)::int AS started,
          (SELECT count(*) FROM p WHERE (SELECT count(*) FROM uploaded_photos u WHERE u.project_id = p.id) >= 10)::int AS photos,
          (SELECT count(*) FROM p WHERE jsonb_array_length(coalesce(p.document->'pages','[]'::jsonb)) >= 2)::int AS made,
          (SELECT count(DISTINCT o.project_id) FROM orders o JOIN p ON p.id = o.project_id WHERE ${liveOnly(req, "o")})::int AS checkout,
          (SELECT count(DISTINCT o.project_id) FROM orders o JOIN p ON p.id = o.project_id WHERE o.paid_at IS NOT NULL AND ${liveOnly(req, "o")})::int AS paid`,
  );
  return [
    { label: "Started a book", n: num(r.started) },
    { label: "Added 10+ photos", n: num(r.photos) },
    { label: "Book made", n: num(r.made) },
    { label: "Opened checkout", n: num(r.checkout) },
    { label: "Paid", n: num(r.paid) },
  ];
}

adminConsoleRouter.get(
  "/api/admin/ops/overview",
  asyncHandler(async (req, res) => {
    const db = requireOpsDb();
    const range = periodRange(req.query.period);
    const actions = await needsAction(db);
    const pipeline = await rows(
      db,
      sql`SELECT j.state, o.status, count(*)::int AS n FROM (
            SELECT DISTINCT ON (order_id) order_id, state FROM print_jobs ORDER BY order_id, version DESC) j
          JOIN orders o ON o.id = j.order_id
          WHERE o.status IN ('paid','in_production','shipped') OR (o.status = 'delivered' AND o.updated_at > now() - interval '14 days')
          GROUP BY 1, 2`,
    );
    const body: Record<string, unknown> = { actions, pipeline, role: req.staff!.role, range };
    if (isOwner(req)) {
      const [cur, prev] = await Promise.all([salesBetween(db, req, range.from, range.to), salesBetween(db, req, range.prevFrom, range.prevTo)]);
      const [funnelCur, funnelPrev] = await Promise.all([bookFunnel(db, req, range.from, range.to), bookFunnel(db, req, range.prevFrom, range.prevTo)]);
      body.kpis = { cur, prev, startToPaid: { cur: funnelCur[0].n ? funnelCur[4].n / funnelCur[0].n : null, prev: funnelPrev[0].n ? funnelPrev[4].n / funnelPrev[0].n : null } };
      body.revenue = { cur: await dailyRevenue(db, req, range.from, range.days), prev: await dailyRevenue(db, req, range.prevFrom, range.days) };
      body.funnel = funnelCur;
    }
    res.json(body);
  }),
);

/* ── orders ─────────────────────────────────────────────────────── */

const listQuery = z.object({
  view: z.enum(["action", "transfer", "ready", "printer", "shipped", "all"]).default("action"),
  q: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  test: z.enum(["0", "1"]).optional(),
});

function rowOf(o: Order, job: PrintJob | undefined) {
  const a = o.shippingAddress as { fullName?: string; phone?: string; line1?: string; line2?: string; city?: string; province?: string; postalCode?: string };
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    createdAt: o.createdAt,
    paidAt: o.paidAt,
    deliverBy: deliverBy(o),
    customer: a.fullName ?? "",
    phone: o.contactPhone,
    email: o.contactEmail,
    city: a.city ?? "",
    area: a.line2 || a.line1 || "",
    book: `${o.binding} · ${o.pageCount} pages${o.qty > 1 ? ` · ×${o.qty}` : ""}`,
    total: o.totalMinor,
    paymentProvider: o.paymentProvider,
    livemode: o.livemode,
    print: job ? { state: job.state, version: job.version, problems: ((job.problems as unknown[]) ?? []).length, lowDpi: job.lowDpiCount } : null,
  };
}

adminConsoleRouter.get(
  "/api/admin/ops/orders",
  asyncHandler(async (req, res) => {
    const db = requireOpsDb();
    const qp = listQuery.safeParse(req.query);
    if (!qp.success) return res.status(400).json({ error: "Invalid filters" });
    const { view, q, page, test } = qp.data;
    const conds = [test === "1" ? sql`true` : sql`(${orders.livemode} = true OR ${orders.status} = 'pending_payment')`];
    const actionIds = Array.from(new Set((await needsAction(db)).map((a) => a.orderId)));
    if (view === "action") {
      const ids = actionIds;
      if (!ids.length) return res.json({ rows: [], total: 0, page, pageSize: 25 });
      conds.push(inArray(orders.id, ids));
    } else if (view === "transfer") conds.push(sql`${orders.status} = 'pending_payment' AND ${orders.paymentProvider} = 'bank_transfer'`);
    else if (view === "ready") conds.push(sql`${orders.status} = 'paid'`);
    else if (view === "printer") conds.push(sql`${orders.status} = 'in_production'`);
    else if (view === "shipped") conds.push(sql`${orders.status} = 'shipped'`);
    if (q) {
      const like = `%${q.replace(/[%_\\]/g, (c) => "\\" + c)}%`;
      const digits = q.replace(/\D/g, "");
      conds.push(
        sql`(${orders.orderNumber} ILIKE ${like} OR ${orders.contactEmail} ILIKE ${like} OR ${orders.shippingAddress}->>'fullName' ILIKE ${like}
             OR ${orders.shippingAddress}->>'city' ILIKE ${like} ${digits.length >= 4 ? sql`OR regexp_replace(${orders.contactPhone}, '\\D', '', 'g') LIKE ${"%" + digits.slice(-7) + "%"}` : sql``})`,
      );
    }
    const where = and(...conds);
    const [{ count }] = await rows<{ count: number }>(db, sql`SELECT count(*)::int AS count FROM orders WHERE ${where}`);
    const list = await db.select().from(orders).where(where).orderBy(desc(orders.createdAt)).limit(25).offset((page - 1) * 25);
    const jobs = await latestJobs(db, list.map((o) => o.id));
    const counts = await rows(
      db,
      sql`SELECT
            count(*) FILTER (WHERE status = 'pending_payment' AND payment_provider = 'bank_transfer')::int AS transfer,
            count(*) FILTER (WHERE status = 'paid')::int AS ready,
            count(*) FILTER (WHERE status = 'in_production')::int AS printer,
            count(*) FILTER (WHERE status = 'shipped')::int AS shipped
          FROM orders WHERE ${test === "1" ? sql`true` : sql`livemode = true OR status = 'pending_payment'`}`,
    );
    res.json({
      rows: list.map((o) => rowOf(o, jobs.get(o.id))),
      total: count,
      page,
      pageSize: 25,
      counts: { ...counts[0], action: actionIds.length },
    });
  }),
);

adminConsoleRouter.get(
  "/api/admin/ops/orders/:id",
  asyncHandler(async (req, res) => {
    const db = requireOpsDb();
    const [order] = await db.select().from(orders).where(eq(orders.id, req.params.id)).limit(1);
    if (!order) return res.status(404).json({ error: "Order not found" });
    const [events, jobs, msgs, pays, history] = await Promise.all([
      db.select().from(orderEvents).where(eq(orderEvents.orderId, order.id)).orderBy(orderEvents.createdAt),
      db.select().from(printJobs).where(eq(printJobs.orderId, order.id)).orderBy(desc(printJobs.version)),
      db.select().from(notifications).where(eq(notifications.orderId, order.id)).orderBy(desc(notifications.createdAt)).limit(50),
      db.select().from(payments).where(eq(payments.orderId, order.id)),
      rows(
        db,
        sql`SELECT count(*)::int AS orders, coalesce(sum(total_minor) FILTER (WHERE paid_at IS NOT NULL),0)::bigint AS spent, min(created_at) AS first
            FROM orders WHERE user_id = ${order.userId}`,
      ),
    ]);
    const { documentSnapshot, idempotencyKey: _k, ...rest } = order;
    const doc = documentSnapshot as { pages?: unknown[]; photos?: unknown[]; title?: string; flagged?: unknown[] };
    res.json({
      order: { ...rest, deliverBy: deliverBy(order) },
      book: { pages: doc.pages?.length ?? 0, photos: doc.photos?.length ?? 0, flagged: doc.flagged?.length ?? 0 },
      events,
      printJobs: jobs,
      notifications: msgs.map((m) => ({ ...m, payload: undefined })),
      payments: isOwner(req) ? pays.map((p) => ({ ...p, raw: undefined })) : [],
      customer: { orders: num(history[0]?.orders), spentMinor: isOwner(req) ? num(history[0]?.spent) : null, since: history[0]?.first ?? null },
      // affiliate credit and commission: money, so owner only (docs/adr/022)
      affiliate: isOwner(req) ? await orderAffiliateInfo(order.id, order.affiliateId) : null,
      canSeeMoney: isOwner(req),
    });
  }),
);

/** A 15-minute link to one stored print file; every request is audited. */
adminConsoleRouter.get(
  "/api/admin/ops/orders/:id/print/:version/:kind",
  asyncHandler(async (req, res) => {
    const db = requireOpsDb();
    const version = Number(req.params.version);
    const [job] = await db.select().from(printJobs).where(and(eq(printJobs.orderId, req.params.id), eq(printJobs.version, version))).limit(1);
    const file = job?.files?.find((f) => f.kind === req.params.kind);
    if (!job || job.state !== "checked" || !file) return res.status(404).json({ error: "No checked file" });
    const [order] = await db.select({ n: orders.orderNumber }).from(orders).where(eq(orders.id, job.orderId)).limit(1);
    // the stored name carries the type: interior.pdf, cover.pdf, jpegs.zip
    const ext = path.extname(file.key) || ".pdf";
    const url = await mediaStore.signedDownload(file.key, `${order?.n ?? "order"}-v${version}-${file.kind}${ext}`, 15 * 60);
    void audit(req, "print.download", { type: "order", id: job.orderId }, { version, kind: file.kind, sha256: file.sha256 });
    res.json({ url, sha256: file.sha256, bytes: file.bytes, expiresInSeconds: 15 * 60 });
  }),
);

/* ── print queue ────────────────────────────────────────────────── */

adminConsoleRouter.get(
  "/api/admin/ops/print",
  asyncHandler(async (req, res) => {
    const db = requireOpsDb();
    const list = await db
      .select()
      .from(orders)
      .where(sql`(${orders.status} IN ('paid','in_production') OR (${orders.status} = 'shipped' AND ${orders.updatedAt} > now() - interval '14 days')) AND ${liveOnly(req)}`)
      .orderBy(orders.paidAt)
      .limit(300);
    const jobs = await latestJobs(db, list.map((o) => o.id));
    const cards = list.map((o) => {
      const j = jobs.get(o.id);
      const column =
        o.status === "shipped" ? "shipped" : o.status === "in_production" ? "printer" : !j || ["queued", "rendering", "composing", "verifying"].includes(j.state) ? "building" : j.state === "failed" ? "failed" : "ready";
      return { ...rowOf(o, j), column, courier: o.courier, tracking: o.trackingNumber };
    });
    res.json({ cards });
  }),
);

/* ── analytics (Owner) ──────────────────────────────────────────── */

const analytics = Router();
adminConsoleRouter.use("/api/admin/ops/analytics", owner, analytics);

analytics.get(
  "/sales",
  asyncHandler(async (req, res) => {
    const db = requireOpsDb();
    const r = periodRange(req.query.period);
    const [cur, prev] = await Promise.all([salesBetween(db, req, r.from, r.to), salesBetween(db, req, r.prevFrom, r.prevTo)]);
    const by = (col: ReturnType<typeof sql>) =>
      rows(db, sql`SELECT ${col} AS k, count(*)::int AS n, sum(total_minor)::bigint AS revenue FROM orders WHERE status IN ('paid','in_production','shipped','delivered') AND paid_at >= ${r.from} AND ${liveOnly(req)} GROUP BY 1 ORDER BY 3 DESC`);
    const [refunds] = await rows(db, sql`SELECT count(*)::int AS n, coalesce(sum(total_minor),0)::bigint AS minor FROM orders WHERE status = 'refunded' AND updated_at >= ${r.from} AND ${liveOnly(req)}`);
    res.json({
      cur,
      prev,
      daily: { cur: await dailyRevenue(db, req, r.from, r.days), prev: await dailyRevenue(db, req, r.prevFrom, r.days) },
      byBinding: await by(sql`binding`),
      byPayment: await by(sql`payment_provider`),
      byCity: await by(sql`initcap(shipping_address->>'city')`),
      byPages: await by(sql`CASE WHEN page_count <= 12 THEN 'up to 12 pages' WHEN page_count <= 20 THEN '13–20 pages' WHEN page_count <= 28 THEN '21–28 pages' ELSE '29+ pages' END`),
      byOccasion: await by(sql`coalesce(occasion, 'not set')`),
      // owner, 2026-11-22: ordered as we made it vs customised (BuilderState.customized)
      byMade: await by(
        sql`CASE document_snapshot->>'customized' WHEN 'changed' THEN 'Customised in the editor' WHEN 'looked' THEN 'Opened the editor, changed nothing' WHEN 'none' THEN 'Ordered as we made it' ELSE 'Before this was counted' END`,
      ),
      refunds: { n: num(refunds.n), minor: num(refunds.minor) },
      repeat: (await rows(db, sql`SELECT count(*) FILTER (WHERE n > 1)::int AS repeat, count(*)::int AS buyers FROM (SELECT user_id, count(*) AS n FROM orders WHERE paid_at IS NOT NULL AND ${liveOnly(req)} GROUP BY 1) t`))[0],
    });
  }),
);

/** Visitors who reached each builder step (in order), with a breakdown, plus time on each step. */
analytics.get(
  "/funnel",
  asyncHandler(async (req, res) => {
    const db = requireOpsDb();
    const r = periodRange(req.query.period);
    const split = ["device", "os", "browser", "source", "visitor"].includes(String(req.query.split)) ? String(req.query.split) : "none";
    const stepIds = FUNNEL_STEPS.filter((s) => s.id !== "paid").map((s) => s.id);
    const groupExpr =
      split === "device" ? sql`max(device)` : split === "os" ? sql`max(os)` : split === "browser" ? sql`max(browser)` : split === "source" ? sql`coalesce(max(src), 'direct')` : split === "visitor" ? sql`CASE WHEN min(first_seen) < ${r.from} THEN 'came back' ELSE 'first visit' END` : sql`'everyone'`;
    const people = await rows<{ grp: string; reached: number; paid: boolean }>(
      db,
      sql`WITH ev AS (
            SELECT anon_id, user_id, device, os, browser, props->>'step' AS step,
                   (SELECT e2.props->'utm'->>'source' FROM analytics_events e2 WHERE e2.anon_id = e.anon_id AND e2.name = 'visit' AND e2.props ? 'utm' LIMIT 1) AS src,
                   (SELECT min(e3.created_at) FROM analytics_events e3 WHERE e3.anon_id = e.anon_id) AS first_seen
            FROM analytics_events e WHERE name = 'step' AND created_at >= ${r.from} AND created_at < ${r.to})
          SELECT ${groupExpr} AS grp,
                 max(array_position(ARRAY[${sql.join(stepIds.map((id) => sql`${id}`), sql`, `)}]::text[], step)) AS reached,
                 bool_or(EXISTS (SELECT 1 FROM orders o WHERE o.user_id = ev.user_id AND o.paid_at >= ${r.from})) AS paid
          FROM ev GROUP BY anon_id`,
    );
    const groups = new Map<string, number[]>();
    for (const p of people) {
      const g = String(p.grp ?? "unknown");
      const arr = groups.get(g) ?? new Array(FUNNEL_STEPS.length).fill(0);
      for (let i = 0; i < (p.reached ?? 0); i++) arr[i]++;
      if (p.paid) arr[FUNNEL_STEPS.length - 1]++;
      groups.set(g, arr);
    }
    const time = await rows(
      db,
      sql`SELECT props->>'step' AS step,
                 percentile_cont(0.5) WITHIN GROUP (ORDER BY (props->>'activeMs')::int) AS p50,
                 percentile_cont(0.9) WITHIN GROUP (ORDER BY (props->>'activeMs')::int) AS p90,
                 count(*)::int AS n
          FROM analytics_events WHERE name = 'page_time' AND props ? 'step' AND created_at >= ${r.from} GROUP BY 1`,
    );
    const toPaid = await rows(
      db,
      sql`SELECT width_bucket((extract(epoch FROM (o.paid_at - p.created_at)) / 60)::float8, ARRAY[10, 30, 60, 360, 1440, 4320]::float8[]) AS b, count(*)::int AS n
          FROM orders o JOIN projects p ON p.id = o.project_id WHERE o.paid_at >= ${r.from} AND ${liveOnly(req, "o")} GROUP BY 1`,
    );
    res.json({
      steps: FUNNEL_STEPS,
      groups: Array.from(groups.entries()).map(([name, counts]) => ({ name, counts })).sort((a, b) => b.counts[0] - a.counts[0]).slice(0, 4),
      time,
      timeToPaid: toPaid,
      books: await bookFunnel(db, req, r.from, r.to),
      trend: await rows(
        db,
        sql`SELECT date_trunc('week', p.created_at) AS week, count(DISTINCT p.id)::int AS started, count(DISTINCT o.project_id) FILTER (WHERE o.paid_at IS NOT NULL)::int AS paid
            FROM projects p LEFT JOIN orders o ON o.project_id = p.id AND ${liveOnly(req, "o")}
            WHERE p.created_at > now() - interval '12 weeks' AND p.source = 'builder' GROUP BY 1 ORDER BY 1`,
      ),
    });
  }),
);

/** Who visits: device, OS, browser, screen, and how much each converts. */
analytics.get(
  "/audience",
  asyncHandler(async (req, res) => {
    const db = requireOpsDb();
    const r = periodRange(req.query.period);
    const split = (col: string) =>
      rows(
        db,
        sql`SELECT ${sql.raw(col)} AS k, count(DISTINCT anon_id)::int AS visitors,
                   count(DISTINCT anon_id) FILTER (WHERE name = 'step')::int AS started,
                   count(DISTINCT user_id) FILTER (WHERE EXISTS (SELECT 1 FROM orders o WHERE o.user_id = analytics_events.user_id AND o.paid_at >= ${r.from}))::int AS paid
            FROM analytics_events WHERE created_at >= ${r.from} AND name IN ('page_view','step') GROUP BY 1 ORDER BY 2 DESC LIMIT 8`,
      );
    const screens = await rows(
      db,
      sql`SELECT CASE WHEN (props->>'screenW')::int < 375 THEN 'small phone (<375px)' WHEN (props->>'screenW')::int < 768 THEN 'phone' WHEN (props->>'screenW')::int < 1280 THEN 'tablet / laptop' ELSE 'big screen' END AS k,
                 count(DISTINCT anon_id)::int AS visitors
          FROM analytics_events WHERE name = 'visit' AND created_at >= ${r.from} AND props ? 'screenW' GROUP BY 1 ORDER BY 2 DESC`,
    );
    const sources = await rows(
      db,
      sql`SELECT coalesce(props->'utm'->>'source', props->>'referrerHost', 'direct') AS k, count(DISTINCT anon_id)::int AS visitors
          FROM analytics_events WHERE name = 'visit' AND created_at >= ${r.from} GROUP BY 1 ORDER BY 2 DESC LIMIT 10`,
    );
    res.json({ device: await split("device"), os: await split("os"), browser: await split("browser"), screens, sources });
  }),
);

/** Customers' internet speed: from visits (connection, measured download) and real uploads. */
analytics.get(
  "/network",
  asyncHandler(async (req, res) => {
    const db = requireOpsDb();
    const r = periodRange(req.query.period);
    const visits = await rows(
      db,
      sql`SELECT coalesce(props->>'connection', 'unknown') AS k, count(*)::int AS visits,
                 percentile_cont(0.5) WITHIN GROUP (ORDER BY (props->>'measuredMbps')::float) AS down_p50,
                 percentile_cont(0.1) WITHIN GROUP (ORDER BY (props->>'measuredMbps')::float) AS down_p10,
                 percentile_cont(0.5) WITHIN GROUP (ORDER BY (props->>'downlinkMbps')::float) AS hint_p50,
                 percentile_cont(0.5) WITHIN GROUP (ORDER BY (props->>'rttMs')::float) AS rtt_p50
          FROM analytics_events WHERE name = 'visit' AND created_at >= ${r.from} GROUP BY 1 ORDER BY 2 DESC`,
    );
    const uploads = await rows(
      db,
      sql`SELECT coalesce(connection, 'unknown') AS k, count(*)::int AS batches,
                 percentile_cont(0.5) WITHIN GROUP (ORDER BY hd_mbps) AS up_p50,
                 percentile_cont(0.1) WITHIN GROUP (ORDER BY hd_mbps) AS up_p10,
                 percentile_cont(0.5) WITHIN GROUP (ORDER BY all_hd_ms) AS all_hd_ms_p50,
                 avg(CASE WHEN stalls > 0 THEN 1 ELSE 0 END) AS stalled_share
          FROM upload_batches WHERE created_at >= ${r.from} AND hd_mbps IS NOT NULL GROUP BY 1 ORDER BY 2 DESC`,
    );
    res.json({ visits, uploads });
  }),
);

/** Server response times (p50/p90/p95/p99) per route, and Web Vitals per device. */
analytics.get(
  "/speed",
  asyncHandler(async (req, res) => {
    const db = requireOpsDb();
    const r = periodRange(req.query.period);
    const totals = await rows<{ route: string; count: number; errors: number; sum_ms: string; max_ms: number }>(
      db,
      sql`SELECT route, sum(count)::int AS count, sum(errors)::int AS errors, sum(sum_ms)::bigint AS sum_ms, max(max_ms)::int AS max_ms
          FROM request_metrics WHERE minute >= ${r.from} GROUP BY route ORDER BY 2 DESC LIMIT 60`,
    );
    // histograms merge exactly: add the counts bucket by bucket
    const sums = await rows<{ route: string; idx: number; n: number }>(
      db,
      sql`SELECT route, idx::int AS idx, sum(val::int)::int AS n
          FROM request_metrics, jsonb_array_elements_text(buckets) WITH ORDINALITY AS t(val, idx)
          WHERE minute >= ${r.from} GROUP BY route, idx`,
    );
    const hist = new Map<string, number[]>();
    for (const x of sums) {
      const arr = hist.get(x.route) ?? new Array(BUCKET_BOUNDS.length + 1).fill(0);
      arr[x.idx - 1] = x.n;
      hist.set(x.route, arr);
    }
    const routes = totals.map((x) => {
      const b = hist.get(x.route) ?? [];
      return { route: x.route, count: x.count, errors: x.errors, meanMs: x.count ? Math.round(num(x.sum_ms) / x.count) : null, maxMs: x.max_ms, p50: percentile(b, 0.5), p90: percentile(b, 0.9), p95: percentile(b, 0.95), p99: percentile(b, 0.99) };
    });
    const vitals = await rows(
      db,
      sql`SELECT props->>'metric' AS metric, device, count(*)::int AS n,
                 percentile_cont(0.75) WITHIN GROUP (ORDER BY (props->>'value')::float) AS p75,
                 percentile_cont(0.95) WITHIN GROUP (ORDER BY (props->>'value')::float) AS p95
          FROM analytics_events WHERE name = 'vital' AND created_at >= ${r.from} GROUP BY 1, 2 ORDER BY 1, 2`,
    );
    res.json({ routes, vitals, bucketBounds: BUCKET_BOUNDS });
  }),
);

/** Time on pages, where people leave, errors and rage taps. */
analytics.get(
  "/experience",
  asyncHandler(async (req, res) => {
    const db = requireOpsDb();
    const r = periodRange(req.query.period);
    const pages = await rows(
      db,
      sql`WITH v AS (SELECT path, count(*)::int AS views FROM analytics_events WHERE name = 'page_view' AND created_at >= ${r.from} GROUP BY 1),
          t AS (SELECT path, percentile_cont(0.5) WITHIN GROUP (ORDER BY (props->>'activeMs')::int) AS p50,
                       percentile_cont(0.9) WITHIN GROUP (ORDER BY (props->>'activeMs')::int) AS p90
                FROM analytics_events WHERE name = 'page_time' AND NOT (props ? 'step') AND created_at >= ${r.from} GROUP BY 1),
          x AS (SELECT path, count(*)::int AS exits FROM (
                  SELECT DISTINCT ON (visit_id) visit_id, path FROM analytics_events WHERE name = 'page_view' AND created_at >= ${r.from} ORDER BY visit_id, created_at DESC) l GROUP BY 1)
          SELECT v.path, v.views, t.p50, t.p90, coalesce(x.exits, 0) AS exits FROM v LEFT JOIN t USING (path) LEFT JOIN x USING (path) ORDER BY v.views DESC LIMIT 25`,
    );
    const rage = await rows(db, sql`SELECT path, props->>'target' AS target, count(*)::int AS n FROM analytics_events WHERE name = 'rage' AND created_at >= ${r.from} GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 10`);
    const errors = await rows(
      db,
      sql`SELECT props->>'message' AS message, max(path) AS path, count(*)::int AS n, count(DISTINCT visit_id)::int AS visits FROM analytics_events WHERE name = 'error' AND created_at >= ${r.from} GROUP BY 1 ORDER BY 3 DESC LIMIT 10`,
    );
    const [visits] = await rows(
      db,
      sql`SELECT count(DISTINCT visit_id)::int AS visits, count(DISTINCT visit_id) FILTER (WHERE name = 'error')::int AS with_error FROM analytics_events WHERE created_at >= ${r.from}`,
    );
    res.json({ pages, rage, errors, visits });
  }),
);

/* ── notifications ──────────────────────────────────────────────── */

adminConsoleRouter.get(
  "/api/admin/ops/notifications",
  asyncHandler(async (req, res) => {
    const db = requireOpsDb();
    const status = typeof req.query.status === "string" && /^[a-z]+$/.test(req.query.status) ? req.query.status : null;
    const list = await db
      .select({
        id: notifications.id,
        event: notifications.event,
        channel: notifications.channel,
        audience: notifications.audience,
        recipient: notifications.recipient,
        orderId: notifications.orderId,
        status: notifications.status,
        attempts: notifications.attempts,
        error: notifications.error,
        createdAt: notifications.createdAt,
        sentAt: notifications.sentAt,
        orderNumber: orders.orderNumber,
      })
      .from(notifications)
      .leftJoin(orders, eq(orders.id, notifications.orderId))
      .where(status ? eq(notifications.status, status) : undefined)
      .orderBy(desc(notifications.createdAt))
      .limit(200);
    const [health] = await rows(
      db,
      sql`SELECT count(*)::int AS total, count(*) FILTER (WHERE status IN ('sent','delivered','read'))::int AS ok,
                 count(*) FILTER (WHERE status = 'failed')::int AS failed, count(*) FILTER (WHERE status = 'skipped')::int AS skipped
          FROM notifications WHERE created_at > now() - interval '7 days'`,
    );
    res.json({ list, health });
  }),
);

adminConsoleRouter.post(
  "/api/admin/ops/notifications/:id/resend",
  asyncHandler(async (req, res) => {
    await resendNotification(req.params.id);
    void audit(req, "notify.resend", { type: "notification", id: req.params.id });
    res.json({ ok: true });
  }),
);

adminConsoleRouter.get(
  "/api/admin/ops/notify-rules",
  owner,
  asyncHandler(async (_req, res) => {
    res.json({ rules: await listRules(), info: NOTIFY_EVENT_INFO, whatsappConnected: Boolean((await import("../notify/whatsapp")).whatsapp) });
  }),
);

adminConsoleRouter.put(
  "/api/admin/ops/notify-rules/:event",
  owner,
  asyncHandler(async (req, res) => {
    const event = req.params.event as NotifyEvent;
    if (!NOTIFY_EVENTS.includes(event)) return res.status(404).json({ error: "Unknown event" });
    const body = parse(notifyRuleSchema, req.body, res);
    if (!body) return;
    if (!NOTIFY_EVENT_INFO[event].customerCapable) {
      body.customerEmail = false;
      body.customerWhatsapp = false;
    }
    const rule = await saveRule(event, body, req.staff!.userId);
    void audit(req, "notify.rule_saved", { type: "notify_rule", id: event }, body as unknown as Record<string, unknown>);
    res.json({ rule });
  }),
);

/** Send this event's staff message to the staff recipients now, with sample values. */
adminConsoleRouter.post(
  "/api/admin/ops/notify-rules/:event/test",
  owner,
  asyncHandler(async (req, res) => {
    const event = req.params.event as NotifyEvent;
    if (!NOTIFY_EVENTS.includes(event)) return res.status(404).json({ error: "Unknown event" });
    const sample = {
      orderNumber: "TK-TEST01",
      title: "Sample book",
      total: "Rs 5,690",
      totalMinor: 569000,
      book: "hardcover · 12 pages",
      city: "Lahore",
      firstName: "Test",
      courier: "TCS",
      tracking: "000000",
      status: "cancelled",
      reason: "sample error",
      reported: "Rs 1 (TK-TEST01)",
      attempts: 5,
      pages: 12,
      name: req.staff!.name || req.staff!.email,
      email: req.staff!.email,
      ip: req.ip ?? "",
      when: new Date().toISOString(),
      paidCount: 3,
      revenue: "Rs 17,070",
      actionCount: 1,
      testMode: true,
      adminUrl: "",
      orderUrl: "",
      reviewUrl: "",
    };
    // staff recipients only: a test never messages a customer
    const n = await notifyEvent(event, { key: `test-${Date.now()}`, vars: sample, customer: null });
    void audit(req, "notify.test", { type: "notify_rule", id: event });
    res.json({ queued: n });
  }),
);

/* ── team & security (Owner) ────────────────────────────────────── */

adminConsoleRouter.get(
  "/api/admin/ops/team",
  owner,
  asyncHandler(async (_req, res) => {
    const db = requireOpsDb();
    const staff = await db
      .select({ id: users.id, name: users.name, email: users.email, role: users.role, enrolledAt: staffFactors.enrolledAt, lockedUntil: staffFactors.lockedUntil })
      .from(users)
      .leftJoin(staffFactors, eq(staffFactors.userId, users.id))
      .where(inArray(users.role, [...STAFF_ROLES]));
    const last = await rows<{ user_id: string; at: Date; ip: string }>(
      db,
      sql`SELECT DISTINCT ON (user_id) user_id, created_at AS at, ip FROM staff_elevations ORDER BY user_id, created_at DESC`,
    );
    const lastBy = new Map(last.map((l) => [l.user_id, l]));
    res.json({
      staff: staff.map((s) => ({ ...s, lastStepUp: lastBy.get(s.id)?.at ?? null, lastIp: lastBy.get(s.id)?.ip ?? null })),
      invites: await db.select().from(staffInvites),
    });
  }),
);

const inviteSchema = z.object({ email: z.string().trim().toLowerCase().email(), role: z.enum(STAFF_ROLES) });

adminConsoleRouter.post(
  "/api/admin/ops/team/invite",
  owner,
  asyncHandler(async (req, res) => {
    const body = parse(inviteSchema, req.body, res);
    if (!body) return;
    const db = requireOpsDb();
    const [existing] = await db.select().from(users).where(eq(users.email, body.email)).limit(1);
    if (existing && !existing.isAnonymous) {
      await setRole(existing.id, body.role);
      void audit(req, "staff.role_set", { type: "user", id: existing.id }, { role: body.role, email: body.email });
      return res.json({ applied: true });
    }
    await db.insert(staffInvites).values({ email: body.email, role: body.role, invitedBy: req.staff!.userId }).onConflictDoUpdate({ target: staffInvites.email, set: { role: body.role } });
    void audit(req, "staff.invited", { type: "email", id: body.email }, { role: body.role });
    res.json({ applied: false, invited: true });
  }),
);

adminConsoleRouter.delete(
  "/api/admin/ops/team/invite/:email",
  owner,
  asyncHandler(async (req, res) => {
    await requireOpsDb().delete(staffInvites).where(eq(staffInvites.email, req.params.email.toLowerCase()));
    void audit(req, "staff.invite_removed", { type: "email", id: req.params.email });
    res.json({ ok: true });
  }),
);

const roleSchema = z.object({ role: z.enum(["admin", "ops", "customer"]) });

adminConsoleRouter.patch(
  "/api/admin/ops/team/:userId",
  owner,
  asyncHandler(async (req, res) => {
    const body = parse(roleSchema, req.body, res);
    if (!body) return;
    const db = requireOpsDb();
    if (req.params.userId === req.staff!.userId && body.role !== "admin") {
      return res.status(409).json({ error: "You can't remove your own Owner role. Ask another Owner." });
    }
    await setRole(req.params.userId, body.role);
    // removed or changed: their admin sessions end now
    await db.delete(staffElevations).where(eq(staffElevations.userId, req.params.userId));
    void audit(req, "staff.role_set", { type: "user", id: req.params.userId }, { role: body.role });
    res.json({ ok: true });
  }),
);

adminConsoleRouter.post(
  "/api/admin/ops/team/:userId/reset-2fa",
  owner,
  asyncHandler(async (req, res) => {
    const db = requireOpsDb();
    await db.delete(staffFactors).where(eq(staffFactors.userId, req.params.userId));
    await db.delete(staffElevations).where(eq(staffElevations.userId, req.params.userId));
    void audit(req, "staff.2fa_reset", { type: "user", id: req.params.userId });
    res.json({ ok: true });
  }),
);

adminConsoleRouter.get(
  "/api/admin/ops/audit",
  owner,
  asyncHandler(async (req, res) => {
    const db = requireOpsDb();
    const list = await db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(Math.min(500, Number(req.query.limit) || 200));
    res.json({ list });
  }),
);

/* ── export (Owner, audited) ────────────────────────────────────── */

const csvCell = (v: unknown) => {
  const s = v instanceof Date ? v.toISOString() : String(v ?? "");
  // neutralise spreadsheet formulas (=, +, -, @) as well as quoting
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

adminConsoleRouter.get(
  "/api/admin/ops/export/orders.csv",
  owner,
  asyncHandler(async (req, res) => {
    const db = requireOpsDb();
    const r = periodRange(req.query.period ?? "90d");
    const list = await db.select().from(orders).where(sql`${orders.createdAt} >= ${r.from} AND ${liveOnly(req)}`).orderBy(desc(orders.createdAt));
    const head = ["order", "status", "created", "paid", "customer", "phone", "email", "city", "binding", "pages", "qty", "total_pkr", "payment", "courier", "tracking"];
    const lines = list.map((o) => {
      const a = o.shippingAddress as { fullName?: string; city?: string };
      return [o.orderNumber, o.status, o.createdAt, o.paidAt, a.fullName, o.contactPhone, o.contactEmail, a.city, o.binding, o.pageCount, o.qty, (o.totalMinor / 100).toFixed(0), o.paymentProvider, o.courier, o.trackingNumber].map(csvCell).join(",");
    });
    void audit(req, "export.orders_csv", null, { rows: list.length, from: r.from.toISOString() });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="truekeeps-orders-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.setHeader("Cache-Control", "no-store");
    res.send([head.join(","), ...lines].join("\n"));
  }),
);

/* ── daily summary (9:00 Pakistan time) ─────────────────────────── */

register(
  "notify.daily",
  async () => {
    const db = requireOpsDb();
    const today = pktMidnight(Date.now());
    const [y] = await rows(
      db,
      sql`SELECT count(*)::int AS n, coalesce(sum(total_minor),0)::bigint AS minor FROM orders
          WHERE livemode = true AND status IN ('paid','in_production','shipped','delivered') AND paid_at >= ${new Date(today - DAY)} AND paid_at < ${new Date(today)}`,
    );
    const actions = await needsAction(db);
    await notifyEvent("daily_summary", {
      key: new Date(today).toISOString().slice(0, 10),
      vars: { paidCount: num(y.n), revenue: formatPKR(num(y.minor)), actionCount: actions.length },
    });
    log.info({ paid: num(y.n), actions: actions.length }, "[notify] daily summary queued");
  },
  { retryLimit: 2 },
);
schedule("notify.daily", "0 9 * * *", 24 * 3600_000);

/* ── promo codes (owner) ───────────────────────────────────────── */

/** Every code with how many standing orders used it and what it took off. */
adminConsoleRouter.get(
  "/api/admin/promos",
  owner,
  asyncHandler(async (_req, res) => {
    const db = requireOpsDb();
    const list = await db.select().from(promoCodes).orderBy(desc(promoCodes.createdAt));
    const used = await db
      .select({ code: orders.promoCode, n: sql<number>`count(*)::int`, off: sql<number>`coalesce(sum(${orders.discountMinor}), 0)::int` })
      .from(orders)
      .where(and(sql`${orders.promoCode} IS NOT NULL`, inArray(orders.status, LIVE_ORDER_STATUSES)))
      .groupBy(orders.promoCode);
    const byCode = new Map(used.map((u) => [u.code, u]));
    res.json(list.map((p) => ({ ...p, uses: byCode.get(p.code)?.n ?? 0, discountGivenMinor: byCode.get(p.code)?.off ?? 0 })));
  }),
);

const promoRow = (b: ReturnType<typeof promoInputSchema.parse>) => ({
  code: b.code,
  kind: b.kind,
  value: b.value,
  startsAt: b.startsAt ? new Date(b.startsAt) : null,
  endsAt: b.endsAt ? new Date(b.endsAt) : null,
  maxUses: b.maxUses ?? null,
  perCustomer: b.perCustomer === undefined ? 1 : b.perCustomer,
  minSubtotalMinor: b.minSubtotalMinor ?? null,
  active: b.active ?? true,
  note: b.note ?? null,
});

adminConsoleRouter.post(
  "/api/admin/promos",
  owner,
  asyncHandler(async (req, res) => {
    const body = parse(promoInputSchema, req.body, res);
    if (!body) return;
    const db = requireOpsDb();
    const [clash] = await db.select({ id: promoCodes.id }).from(promoCodes).where(eq(promoCodes.code, body.code)).limit(1);
    if (clash) return res.status(409).json({ error: `There is already a code ${body.code}.` });
    const [row] = await db
      .insert(promoCodes)
      .values({ ...promoRow(body), createdBy: req.staff?.userId ?? null })
      .returning();
    void audit(req, "promo.create", { type: "promo", id: row.id }, { code: row.code, kind: row.kind, value: row.value });
    res.status(201).json(row);
  }),
);

adminConsoleRouter.patch(
  "/api/admin/promos/:id",
  owner,
  asyncHandler(async (req, res) => {
    const body = parse(promoInputSchema, req.body, res);
    if (!body) return;
    const db = requireOpsDb();
    const [clash] = await db.select({ id: promoCodes.id }).from(promoCodes).where(eq(promoCodes.code, body.code)).limit(1);
    if (clash && clash.id !== req.params.id) return res.status(409).json({ error: `There is already a code ${body.code}.` });
    const [row] = await db
      .update(promoCodes)
      .set({ ...promoRow(body), updatedAt: new Date() })
      .where(eq(promoCodes.id, req.params.id))
      .returning();
    if (!row) return res.status(404).json({ error: "No such code" });
    void audit(req, "promo.update", { type: "promo", id: row.id }, { code: row.code, active: row.active, kind: row.kind, value: row.value });
    res.json(row);
  }),
);
