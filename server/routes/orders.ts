/**
 * Orders + payments HTTP surface.
 *
 *   GET  /api/pricing                    public price list + checkout mode
 *   POST /api/orders                     create order → hosted checkout URL   (member)
 *   GET  /api/orders                     my orders                            (member)
 *   GET  /api/orders/:id                 one order + timeline                 (owner/admin)
 *   POST /api/orders/:id/pay             fresh checkout URL for a pending order
 *   POST /api/orders/:id/refresh         re-check payment now (status page poll)
 *   GET  /api/payments/return/:id        Safepay redirect target → /orders/:id
 *   GET  /api/payments/cancel/:id        Safepay cancel target   → /orders/:id
 *   POST /api/payments/webhook/safepay   signed webhook (raw body, no cookies)
 *   GET  /api/admin/orders[/:id], PATCH /api/admin/orders/:id   (admin)
 *   POST /api/admin/orders/:id/mark-paid  bank transfer received      (admin)
 *   GET/PUT /api/admin/settings/payments  which methods checkout offers (admin)
 *   GET/POST /api/payments/fake/*        dev-only fake gateway
 *
 * None of the return/cancel/webhook endpoints can mark an order paid by
 * themselves — they all funnel into confirmPayment(), which asks the
 * gateway (see server/orders/service.ts).
 */

import express, { Router, type Response } from "express";
import type { Order } from "@shared/schema";
import { PRICE_LIST } from "@shared/pricing";
import { adminUpdateOrderSchema, canTransition, createOrderSchema, ORDER_STATUSES, type OrderStatus } from "@shared/orders";
import { storage } from "../storage";
import { config } from "../config";
import { log } from "../logger";
import { paymentProvider, FakeProvider } from "../payments";
import { applyPromo, PromoError } from "../orders/promo";
import { promoCheckSchema } from "@shared/promo";
import { availableMethods, checkoutUrlFor, confirmPayment, createOrder, getPaymentSettings, isBankTransfer, markBankTransferPaid, OrderError } from "../orders/service";
import { BANK_DETAILS, BANK_TRANSFER_WINDOW_DAYS, SUPPORT_WHATSAPP, markPaidSchema, paymentSettingsSchema } from "@shared/payments";
import { coverPhotoIdOf, type BuilderDocument } from "@shared/document";
import { mediaStore } from "../media";
import { readManifest } from "../print/render";
import { startPrintJob } from "../print/pipeline";
import { notifyOrder } from "../notify/outbox";
import { orderAffiliate } from "../affiliates/attribution";
import { syncCommissionSoon } from "../affiliates/commissions";
import { audit } from "../ops/audit";
import { requireMember, requireUser, currentUser } from "../middleware/auth";
import { isElevatedStaff, requireStaff } from "../middleware/staff";
import { loadOwnedProject } from "../middleware/ownership";
import { orderLimiter, writeLimiter } from "../middleware/rate-limit";
import { asyncHandler, parse } from "./helpers";

export const ordersRouter = Router();

/* ── helpers ───────────────────────────────────────────────────── */

/** What a customer may see. Internal keys and the full book snapshot stay server-side. */
function publicOrder(o: Order) {
  const { idempotencyKey: _k, documentSnapshot: _d, paymentProvider: _p, providerRef: _r, userId: _u, ...rest } = o;
  // how it is paid, so the order page can show bank details for a transfer
  return { ...rest, paymentMethod: isBankTransfer(o) ? ("bank_transfer" as const) : ("card" as const) };
}

/** The full order for the admin, plus how it is paid (the admin's buttons depend on it). */
const adminOrder = (o: Order) => ({ ...o, paymentMethod: isBankTransfer(o) ? ("bank_transfer" as const) : ("card" as const) });

async function loadOwnedOrder(req: express.Request, res: Response): Promise<Order | null> {
  const order = await storage.getOrder(req.params.id);
  // staff see any order only past the admin's second sign-in step
  if (!order || (order.userId !== req.user!.id && !(await isElevatedStaff(req)))) {
    res.status(404).json({ error: "Order not found" });
    return null;
  }
  return order;
}

function sendOrderError(res: Response, err: unknown) {
  if (err instanceof OrderError) return res.status(err.status).json({ error: err.message, code: err.code });
  throw err;
}

/* ── pricing ───────────────────────────────────────────────────── */

ordersRouter.get(
  "/api/pricing",
  asyncHandler(async (_req, res) => {
    const methods = await availableMethods();
    res.json({
      priceList: PRICE_LIST,
      checkout: {
        enabled: methods.card || methods.bankTransfer,
        livemode: paymentProvider?.livemode ?? false,
        provider: paymentProvider?.name ?? null,
        // which ways to pay checkout offers (owner switch, shared/payments.ts)
        methods,
      },
      bankTransfer: { bank: BANK_DETAILS, holdDays: BANK_TRANSFER_WINDOW_DAYS },
      support: { whatsapp: SUPPORT_WHATSAPP },
    });
  }),
);

/* ── customer endpoints ────────────────────────────────────────── */

ordersRouter.post(
  "/api/orders",
  requireMember,
  orderLimiter,
  asyncHandler(async (req, res) => {
    const body = parse(createOrderSchema, req.body, res);
    if (!body) return;
    const project = await loadOwnedProject(req, res, body.projectId);
    if (!project) return;
    const user = await storage.getUser(currentUser(req).id);
    if (!user) return res.status(401).json({ error: "Sign-in required", code: "UNAUTHENTICATED" });
    try {
      const credit = await orderAffiliate(req, { id: user.id, email: user.email, phone: body.gift?.phone ?? body.address.phone }).catch(() => null);
      const { order, checkoutUrl } = await createOrder(user, body, credit);
      res.status(201).json({ order: publicOrder(order), checkoutUrl });
    } catch (err) {
      sendOrderError(res, err);
    }
  }),
);

/** The checkout's preview of a promo code (placing the order checks it again). */
ordersRouter.post(
  "/api/promo/check",
  requireMember,
  orderLimiter,
  asyncHandler(async (req, res) => {
    const body = parse(promoCheckSchema, req.body, res);
    if (!body) return;
    try {
      const r = await applyPromo(body.code, currentUser(req).id, body.subtotalMinor);
      res.json({ code: r.promo.code, kind: r.promo.kind, value: r.promo.value, discountMinor: r.discountMinor, label: r.label });
    } catch (err) {
      if (err instanceof PromoError) return res.status(400).json({ error: err.message, code: err.code });
      throw err;
    }
  }),
);

ordersRouter.get(
  "/api/orders",
  requireMember,
  asyncHandler(async (req, res) => {
    const list = await storage.listOrdersForUser(currentUser(req).id);
    res.json(list.map(publicOrder));
  }),
);

ordersRouter.get(
  "/api/orders/:id",
  requireUser,
  asyncHandler(async (req, res) => {
    const order = await loadOwnedOrder(req, res);
    if (!order) return;
    const events = await storage.listOrderEvents(order.id);
    res.json({ order: publicOrder(order), events });
  }),
);

ordersRouter.post(
  "/api/orders/:id/pay",
  requireMember,
  orderLimiter,
  asyncHandler(async (req, res) => {
    const order = await loadOwnedOrder(req, res);
    if (!order) return;
    try {
      const { checkoutUrl } = await checkoutUrlFor(order);
      res.json({ checkoutUrl });
    } catch (err) {
      sendOrderError(res, err);
    }
  }),
);

ordersRouter.post(
  "/api/orders/:id/refresh",
  requireUser,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const order = await loadOwnedOrder(req, res);
    if (!order) return;
    const fresh = (await confirmPayment(order.id, "poll").catch((err) => {
      log.warn({ err, orderId: order.id }, "[orders] poll: status check failed");
      return order;
    })) ?? order;
    res.json({ order: publicOrder(fresh) });
  }),
);

/* ── gateway return / cancel (browser redirects, unsigned) ─────── */

/**
 * Order id from the path (/return/:id). Also accepts the older
 * `?order=<id>` form, trimming anything Safepay glued on after a second
 * "?", so a checkout started before a deploy still lands correctly.
 */
function orderIdFrom(req: express.Request): string {
  const raw = req.params.id ?? (typeof req.query.order === "string" ? req.query.order : "");
  return raw.split("?")[0].trim();
}

ordersRouter.get(
  ["/api/payments/return/:id", "/api/payments/return"],
  asyncHandler(async (req, res) => {
    const id = orderIdFrom(req);
    const order = id ? await storage.getOrder(id) : undefined;
    if (!order) return res.redirect(302, "/orders");
    // Best effort: usually the payment is already captured by now. If the
    // gateway is slow, the status page keeps polling.
    await confirmPayment(order.id, "redirect").catch((err) => log.warn({ err, orderId: order.id }, "[orders] return: status check failed"));
    res.redirect(302, `/orders/${order.id}?from=checkout`);
  }),
);

ordersRouter.get(["/api/payments/cancel/:id", "/api/payments/cancel"], (req, res) => {
  const id = orderIdFrom(req);
  res.redirect(302, id ? `/orders/${encodeURIComponent(id)}?cancelled=1` : "/orders");
});

/* ── Safepay webhook ───────────────────────────────────────────── */

ordersRouter.post(
  "/api/payments/webhook/safepay",
  express.raw({ type: () => true, limit: "256kb" }),
  asyncHandler(async (req, res) => {
    if (!paymentProvider || paymentProvider.name !== "safepay") return res.status(404).end();
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
    if (!paymentProvider.verifyWebhook(raw, req.headers)) {
      log.warn({ ip: req.ip }, "[webhook] bad signature — rejected");
      return res.status(401).json({ error: "invalid signature" });
    }
    let evt: { token?: string; type?: string; data?: { tracker?: string; message?: string; code?: unknown } };
    try {
      evt = JSON.parse(raw.toString("utf8"));
    } catch {
      return res.status(400).json({ error: "invalid json" });
    }
    // Acknowledge first (Safepay retries if we take >10s), then act.
    res.status(200).json({ received: true });

    const tracker = evt.data?.tracker;
    const order = tracker ? await storage.getOrderByProviderRef(tracker) : undefined;
    log.info({ type: evt.type, tracker: tracker?.slice(0, 14), matched: Boolean(order) }, "[webhook] safepay event");
    if (!order) return;
    try {
      if (evt.type === "payment.succeeded") {
        await confirmPayment(order.id, "webhook", evt.token);
      } else if (evt.type === "payment.failed") {
        await storage.addOrderEvent({
          orderId: order.id,
          kind: "payment_failed",
          actor: "webhook",
          note: String(evt.data?.message ?? "Payment was declined").slice(0, 300),
        });
      }
    } catch (err) {
      log.error({ err, orderId: order.id }, "[webhook] processing failed (reconcile sweep will retry)");
    }
  }),
);

/* ── admin ─────────────────────────────────────────────────────── */

ordersRouter.get(
  "/api/admin/orders",
  requireStaff(),
  asyncHandler(async (req, res) => {
    const status = ORDER_STATUSES.includes(req.query.status as OrderStatus) ? (req.query.status as OrderStatus) : undefined;
    const list = await storage.listOrdersAdmin({ status, limit: 200 });
    res.json(list.map((o) => ({ ...publicOrder(o), userId: o.userId, providerRef: o.providerRef })));
  }),
);

ordersRouter.get(
  "/api/admin/orders/:id",
  requireStaff(),
  asyncHandler(async (req, res) => {
    const order = await storage.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });
    res.json({ order: adminOrder(order), events: await storage.listOrderEvents(order.id) });
  }),
);

/** Bank transfer arrived: confirm the order, email the customer, start the print files. */
ordersRouter.post(
  "/api/admin/orders/:id/mark-paid",
  requireStaff(),
  writeLimiter,
  asyncHandler(async (req, res) => {
    const body = parse(markPaidSchema, req.body ?? {}, res);
    if (!body) return;
    try {
      const order = await markBankTransferPaid(req.params.id, currentUser(req).id, body.reference);
      void audit(req, "order.bank_transfer_paid", { type: "order", id: order.id }, { reference: body.reference ?? null });
      res.json({ order: adminOrder(order), events: await storage.listOrderEvents(order.id) });
    } catch (err) {
      sendOrderError(res, err);
    }
  }),
);

/** Which ways to pay checkout offers. Card also needs Safepay configured (`gatewayReady`). */
ordersRouter.get(
  "/api/admin/settings/payments",
  requireStaff(["admin"]),
  asyncHandler(async (_req, res) => {
    res.json({ settings: await getPaymentSettings(), gatewayReady: Boolean(paymentProvider), provider: paymentProvider?.name ?? null, livemode: paymentProvider?.livemode ?? false });
  }),
);

ordersRouter.put(
  "/api/admin/settings/payments",
  requireStaff(["admin"]),
  writeLimiter,
  asyncHandler(async (req, res) => {
    const body = parse(paymentSettingsSchema, req.body, res);
    if (!body) return;
    if (body.card && !paymentProvider) {
      return res.status(409).json({ error: "Card payments need Safepay set up on the server first" });
    }
    await storage.setSetting("payments", body, currentUser(req).id);
    log.info({ settings: body, by: currentUser(req).id }, "[admin] payment methods changed");
    void audit(req, "settings.payments", null, body as unknown as Record<string, unknown>);
    res.json({ settings: body, gatewayReady: Boolean(paymentProvider) });
  }),
);

/**
 * Everything the printer needs for an order, as signed links (two hours):
 *   - `files`: each placed photo cut from its HD original with the customer's
 *     framing applied, at up to 300 DPI (server/print/render.ts)
 *   - `cover`: the cover photo's original; covers carry no framing
 *   - `originals`: every printed photo's untouched original, as a fallback
 * `status` is `pending` until the render job has written its manifest.
 */
ordersRouter.get(
  "/api/admin/orders/:id/print-files",
  requireStaff(),
  asyncHandler(async (req, res) => {
    const order = await storage.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });
    const doc = order.documentSnapshot as BuilderDocument;
    const printed = new Set(doc.pages.flatMap((pg) => pg.slots.map((s) => s.photoId)));
    const cover = coverPhotoIdOf(doc);
    if (cover) printed.add(cover);
    const rows = await storage.getUploadedPhotos(order.projectId);
    const sign = async (key: string) => (await mediaStore.signedRead(key)).url;
    const originals = await Promise.all(
      rows
        .filter((r) => printed.has(r.id) && r.storageKey)
        .map(async (r) => ({ photoId: r.id, filename: r.originalFilename, width: r.width, height: r.height, sizeBytes: r.sizeBytes, url: await sign(r.storageKey!) })),
    );
    const manifest = await readManifest(order.projectId, order.id);
    if (!manifest) return res.json({ status: "pending", files: [], cover: null, problems: [], originals });
    res.json({
      status: "ready",
      renderedAt: manifest.renderedAt,
      pageInches: manifest.pageInches,
      files: await Promise.all(manifest.items.map(async (i) => ({ ...i, url: await sign(i.key) }))),
      cover: manifest.cover ? { ...manifest.cover, url: await sign(manifest.cover.originalKey) } : null,
      problems: manifest.problems,
      originals,
    });
  }),
);

/** Rebuild an order's print file as a new version (the old one is kept). */
ordersRouter.post(
  "/api/admin/orders/:id/print-files/render",
  requireStaff(),
  writeLimiter,
  asyncHandler(async (req, res) => {
    const order = await storage.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });
    const job = await startPrintJob(order.id, { force: true, requestedBy: req.staff?.email ?? "admin" });
    void audit(req, "print.rebuild", { type: "order", id: order.id }, { version: job?.version });
    res.status(202).json({ queued: true, version: job?.version ?? null });
  }),
);

ordersRouter.patch(
  "/api/admin/orders/:id",
  requireStaff(),
  writeLimiter,
  asyncHandler(async (req, res) => {
    const body = parse(adminUpdateOrderSchema, req.body, res);
    if (!body) return;
    const order = await storage.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });
    const fields = {
      ...(body.courier !== undefined ? { courier: body.courier } : {}),
      ...(body.trackingNumber !== undefined ? { trackingNumber: body.trackingNumber } : {}),
    };
    let updated: Order | undefined = order;
    if (body.status && body.status !== order.status) {
      // "paid" must come with a recorded payment, the confirmation email and
      // the print files: the gateway (cards) or mark-paid (bank transfer)
      if (body.status === "paid") {
        return res.status(409).json({
          error: isBankTransfer(order) ? "Use Payment received to confirm a bank transfer" : "Card payments are confirmed by Safepay, not by hand",
        });
      }
      if (!canTransition(order.status as OrderStatus, body.status)) {
        return res.status(409).json({ error: `Can't move an order from ${order.status} to ${body.status}` });
      }
      if (body.status === "in_production" && !order.livemode) {
        return res.status(409).json({ error: "This is a test (sandbox) order — it must not be printed" });
      }
      updated = await storage.transitionOrder(
        order.id,
        [order.status as OrderStatus],
        body.status,
        { kind: "status", actor: "admin", note: body.note ?? null },
        fields,
      );
      if (!updated) return res.status(409).json({ error: "The order changed meanwhile — reload and try again" });
      void audit(req, "order.status", { type: "order", id: order.id }, { from: order.status, to: body.status });
      const event =
        body.status === "shipped" ? "order_shipped" : body.status === "delivered" ? "order_delivered" : body.status === "cancelled" || body.status === "refunded" ? "order_cancelled" : null;
      if (event) void notifyOrder(event, updated);
      if (updated.affiliateId) syncCommissionSoon(updated.id);
    } else {
      if (Object.keys(fields).length) {
        updated = await storage.updateOrder(order.id, fields);
        void audit(req, "order.update", { type: "order", id: order.id }, fields);
      }
      if (body.note) await storage.addOrderEvent({ orderId: order.id, kind: "note", actor: "admin", note: body.note });
    }
    res.json({ order: updated ? adminOrder(updated) : updated, events: await storage.listOrderEvents(order.id) });
  }),
);

/* ── dev-only fake gateway ─────────────────────────────────────── */

if (paymentProvider instanceof FakeProvider && !config.isProd) {
  const fake = paymentProvider;
  const safeTarget = (u: unknown) => (typeof u === "string" && u.startsWith(config.appUrl) ? u : "/books");

  ordersRouter.get("/api/payments/fake/checkout", (req, res) => {
    const ref = String(req.query.ref ?? "");
    const s = fake.sessions.get(ref);
    if (!s) return res.status(404).send("Unknown test payment session");
    const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, "");
    res.type("html").send(`<!doctype html><meta name="viewport" content="width=device-width">
<body style="font:16px system-ui;max-width:420px;margin:60px auto;padding:0 16px;color:#404442">
<p style="color:#A5324A;font-weight:600">LOCAL TEST GATEWAY — no real payment</p>
<h2 style="margin:.2em 0">Pay Rs ${(s.amountMinor / 100).toLocaleString("en-PK")}</h2>
<p>Order ${esc(s.orderNumber)}</p>
<form method="post" action="/api/payments/fake/complete">
<input type="hidden" name="ref" value="${esc(ref)}"><input type="hidden" name="redirect" value="${esc(req.query.redirect)}">
<button name="outcome" value="pay" style="padding:12px 20px;font-size:16px;background:#CA3A58;color:#fff;border:0;border-radius:99px">Pay (test)</button>
<a href="${esc(safeTarget(req.query.cancel))}" style="margin-left:14px">Cancel</a></form></body>`);
  });

  ordersRouter.post("/api/payments/fake/complete", (req, res) => {
    const ref = String(req.body?.ref ?? "");
    const s = fake.sessions.get(ref);
    if (s && req.body?.outcome === "pay") s.paid = true;
    const target = safeTarget(req.body?.redirect);
    res.redirect(303, target + (target.includes("?") ? "&" : "?") + "tracker=" + encodeURIComponent(ref));
  });
}
