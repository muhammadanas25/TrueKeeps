/**
 * Order service — creating orders, confirming payments, background sweeps.
 *
 * Route handlers stay thin; everything that decides money lives here.
 *
 * Creating an order (createOrder):
 *  1. idempotency: the client sends a key per checkout attempt; a second
 *     request with the same key (double-click, network retry) returns the
 *     FIRST order instead of making a second one
 *  2. price is re-quoted from shared/pricing.ts — the browser's total is
 *     never used
 *  3. the book document is frozen onto the order (what we print)
 *  4. a gateway session is opened for the exact total; if the gateway is
 *     down, the order stays pending without a session and a retry with the
 *     same key opens one
 *
 * Confirming a payment (confirmPayment) — the ONLY path to "paid":
 *  1. ask the gateway for the session's status (redirects are unsigned,
 *     webhooks can be lost — both just call this)
 *  2. require paid AND amount == order total AND currency PKR AND the
 *     gateway's order number (when present) == ours
 *  3. compare-and-set pending/expired → paid; only the winner of a race
 *     records the payment row and sends the confirmation email
 *
 * Sweeps (startOrderJobs): every few minutes, re-check pending orders
 * (catches payments whose webhook AND redirect were both lost) and expire
 * ones older than 24h. In-process timer — fine at one replica; transitions
 * are compare-and-set so overlapping runs are harmless.
 */

import { randomInt } from "crypto";
import type { Order } from "@shared/schema";
import { quote } from "@shared/pricing";
import { PAYABLE, type CreateOrderBody, type OrderStatus } from "@shared/orders";
import { storage } from "../storage";
import { config } from "../config";
import { log } from "../logger";
import { paymentProvider } from "../payments";
import { emailProvider } from "../email";
import { orderConfirmedEmail } from "../email/templates";

/** How long a customer has to pay before the order is expired. */
export const PAYMENT_WINDOW_MS = 24 * 60 * 60 * 1000;

export class OrderError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}

/* ── order numbers ─────────────────────────────────────────────── */

// Crockford-ish alphabet: no I/L/O/U/0/1 — readable over the phone.
const ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
function newOrderNumber(): string {
  let s = "";
  for (let i = 0; i < 6; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return `TK-${s}`;
}

const isUniqueViolation = (e: unknown) => (e as { code?: string })?.code === "23505";

/* ── checkout URLs ─────────────────────────────────────────────── */

/**
 * The order id goes in the PATH: Safepay appends `?tracker=…` to the
 * return URL without checking for an existing query string (observed in
 * the sandbox), which would corrupt a `?order=` parameter.
 */
function returnUrls(order: Order) {
  return {
    redirectUrl: `${config.appUrl}/api/payments/return/${order.id}`,
    cancelUrl: `${config.appUrl}/api/payments/cancel/${order.id}`,
  };
}

/** Fresh hosted-checkout URL for a payable order (opens a session if missing). */
export async function checkoutUrlFor(order: Order): Promise<{ order: Order; checkoutUrl: string }> {
  if (!paymentProvider) throw new OrderError("Payments are not available right now", 503, "PAYMENTS_DISABLED");
  if (!PAYABLE.includes(order.status as OrderStatus)) {
    throw new OrderError("This order can't be paid any more", 409, "NOT_PAYABLE");
  }
  let current = order;
  if (!current.providerRef) {
    const { providerRef } = await paymentProvider.createSession({
      orderNumber: current.orderNumber,
      amountMinor: current.totalMinor,
      currency: "PKR",
    });
    current = (await storage.updateOrder(current.id, { providerRef })) ?? current;
  }
  const checkoutUrl = await paymentProvider.checkoutUrl(current.providerRef!, returnUrls(current));
  return { order: current, checkoutUrl };
}

/* ── create ────────────────────────────────────────────────────── */

export async function createOrder(
  user: { id: string; email: string; phone?: string | null },
  body: CreateOrderBody,
): Promise<{ order: Order; checkoutUrl: string }> {
  if (!paymentProvider) throw new OrderError("Payments are not available right now", 503, "PAYMENTS_DISABLED");

  // 1. idempotency
  const existing = await storage.getOrderByIdempotencyKey(user.id, body.idempotencyKey);
  if (existing) return checkoutUrlFor(existing);

  // the book must actually be designed: title page + at least one photo page
  const doc = body.document;
  if (doc.pages.length < 2 || doc.photos.length === 0) {
    throw new OrderError("Finish designing your book before ordering", 400, "BOOK_INCOMPLETE");
  }

  // 2. authoritative price
  const q = quote({ binding: body.binding, qty: body.qty });

  // 3. insert (retry on the astronomically rare order-number collision)
  let order: Order | undefined;
  for (let attempt = 0; attempt < 5 && !order; attempt++) {
    try {
      order = await storage.createOrder(
        {
          orderNumber: newOrderNumber(),
          userId: user.id,
          projectId: body.projectId,
          status: "pending_payment",
          currency: q.currency,
          unitMinor: q.unitMinor,
          subtotalMinor: q.subtotalMinor,
          shippingMinor: q.shippingMinor,
          totalMinor: q.totalMinor,
          priceListVersion: q.priceListVersion,
          binding: q.binding,
          qty: q.qty,
          pageCount: doc.pages.length,
          title: doc.title.trim() || "Untitled book",
          occasion: doc.occasion,
          themeKey: doc.themeId,
          documentSnapshot: doc,
          shippingAddress: body.address,
          contactEmail: user.email,
          contactPhone: body.address.phone,
          paymentProvider: paymentProvider.name,
          livemode: paymentProvider.livemode,
          idempotencyKey: body.idempotencyKey,
          expiresAt: new Date(Date.now() + PAYMENT_WINDOW_MS),
        },
        { kind: "created", actor: "user", toStatus: "pending_payment", note: null },
      );
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      // same idempotency key racing in from a second tab → return that one
      const raced = await storage.getOrderByIdempotencyKey(user.id, body.idempotencyKey);
      if (raced) return checkoutUrlFor(raced);
    }
  }
  if (!order) throw new OrderError("Could not create the order, please try again", 500, "ORDER_CREATE_FAILED");

  // remember the phone for next time (profile convenience, not required)
  if (!user.phone) void storage.updateUser(user.id, { phone: body.address.phone }).catch(() => undefined);

  // 4. gateway session + checkout URL
  try {
    return await checkoutUrlFor(order);
  } catch (err) {
    log.error({ err, orderId: order.id }, "[orders] gateway session failed");
    throw new OrderError("The payment page couldn't be opened. Please try again in a moment.", 502, "GATEWAY_UNAVAILABLE");
  }
}

/* ── confirm ───────────────────────────────────────────────────── */

export type ConfirmActor = "webhook" | "redirect" | "poll" | "reconcile";

/**
 * Ask the gateway whether this order is paid and, if so, mark it paid.
 * Safe to call any number of times from anywhere.
 */
export async function confirmPayment(orderId: string, actor: ConfirmActor, providerEventId?: string): Promise<Order | undefined> {
  const order = await storage.getOrder(orderId);
  if (!order || !order.providerRef || !paymentProvider) return order;
  if (order.status !== "pending_payment" && order.status !== "expired") return order;
  if (order.paymentProvider !== paymentProvider.name) return order; // config changed mid-flight

  const status = await paymentProvider.fetchStatus(order.providerRef);
  if (!status.paid) return order;

  const amountOk = status.amountMinor === order.totalMinor && (status.currency ?? "PKR") === order.currency;
  const numberOk = !status.orderNumber || status.orderNumber === order.orderNumber;
  if (!amountOk || !numberOk) {
    log.error(
      { orderId, expected: order.totalMinor, got: status.amountMinor, gotNumber: status.orderNumber },
      "[orders] PAYMENT MISMATCH — not marking paid",
    );
    await storage.addOrderEvent({
      orderId,
      kind: "amount_mismatch",
      actor,
      note: `Gateway reported ${status.amountMinor} ${status.currency} for ${status.orderNumber}; expected ${order.totalMinor} ${order.currency}`,
    });
    return order;
  }

  const paid = await storage.transitionOrder(
    orderId,
    ["pending_payment", "expired"],
    "paid",
    { kind: "status", actor, note: `Payment confirmed with ${paymentProvider.name}` },
    { paidAt: new Date() },
  );
  if (!paid) return storage.getOrder(orderId); // someone else confirmed first

  await storage.recordPayment({
    orderId,
    provider: paymentProvider.name,
    providerRef: order.providerRef,
    // one row per captured session even if several confirmers race
    providerEventId: providerEventId ?? `${order.providerRef}:captured`,
    amountMinor: status.amountMinor!,
    currency: status.currency ?? "PKR",
    status: "succeeded",
    source: actor,
    raw: { state: status.state },
  });

  log.info({ orderId, orderNumber: order.orderNumber, actor, livemode: order.livemode }, "[orders] paid");
  void sendConfirmation(paid);
  return paid;
}

async function sendConfirmation(order: Order) {
  try {
    const tpl = orderConfirmedEmail({
      orderNumber: order.orderNumber,
      title: order.title,
      totalMinor: order.totalMinor,
      qty: order.qty,
      binding: order.binding,
      orderUrl: `${config.appUrl}/orders/${order.id}`,
      testMode: !order.livemode,
    });
    await emailProvider.send({ to: order.contactEmail, ...tpl, idempotencyKey: `order-confirmed-${order.id}` });
  } catch (err) {
    log.error({ err, orderId: order.id }, "[orders] confirmation email failed");
  }
}

/* ── sweeps ────────────────────────────────────────────────────── */

let sweeping = false;

/** One pass: re-check pending orders, then expire the ones past their window. */
export async function sweepOrders(now = new Date()): Promise<{ checked: number; paid: number; expired: number }> {
  if (sweeping) return { checked: 0, paid: 0, expired: 0 };
  sweeping = true;
  let checked = 0,
    paid = 0,
    expired = 0;
  try {
    // give the customer 3 minutes on the payment page before polling
    const pending = await storage.listPendingOrders(new Date(now.getTime() - 3 * 60 * 1000), 100);
    for (const o of pending) {
      checked++;
      try {
        const after = await confirmPayment(o.id, "reconcile");
        if (after?.status === "paid") {
          paid++;
          continue;
        }
        if (o.expiresAt && o.expiresAt < now) {
          const ex = await storage.transitionOrder(o.id, ["pending_payment"], "expired", {
            kind: "status",
            actor: "system",
            note: "No payment within 24 hours",
          });
          if (ex) expired++;
        }
      } catch (err) {
        log.warn({ err, orderId: o.id }, "[orders] sweep: status check failed");
      }
    }
  } finally {
    sweeping = false;
  }
  if (paid || expired) log.info({ checked, paid, expired }, "[orders] sweep");
  return { checked, paid, expired };
}

export function startOrderJobs(intervalMs = 5 * 60 * 1000) {
  const t = setInterval(() => void sweepOrders().catch((err) => log.error({ err }, "[orders] sweep crashed")), intervalMs);
  t.unref();
}
