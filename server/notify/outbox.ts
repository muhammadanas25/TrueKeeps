/**
 * The notification outbox: decide who hears about an event, write one row per
 * message, then send each through the durable queue.
 *
 * Flow for notifyEvent(event, …):
 *   1. read the rule (server/notify/rules.ts); disabled → nothing
 *   2. list recipients: staff emails, staff WhatsApp numbers, and — when the
 *      rule says so — the customer's email and WhatsApp (from the order)
 *   3. render each message now and store it in the row (so "Resend" sends
 *      exactly what was sent, and the log shows it)
 *   4. INSERT … ON CONFLICT (dedupe_key) DO NOTHING: the key is
 *      event + the caller's key + channel + recipient, so a webhook that
 *      fires twice, a retry or a reconciler pass never messages anyone twice
 *   5. queue `notify.send` for each new row; the worker sends, marks the row
 *      sent (or failed with the error), and retries with growing waits
 *
 * Without a database the messages are sent straight away, best effort.
 */

import { eq, sql } from "drizzle-orm";
import { notifications, type NewNotification, type Order } from "@shared/schema";
import type { NotifyEvent } from "@shared/ops";
import { formatPKR } from "@shared/pricing";
import { config } from "../config";
import { log } from "../logger";
import { emailProvider } from "../email";
import { enqueue, register } from "../jobs";
import { opsDb } from "../ops/db";
import { getRule } from "./rules";
import { confirmWhatsappUrl } from "./manual";
import { renderEmail, whatsappParams, type Audience, type EmailBody, type Vars } from "./templates";
import { toWhatsappNumber, whatsapp } from "./whatsapp";

export interface NotifyInput {
  /** what makes this occurrence unique (an order id, a session id, a date) */
  key: string;
  orderId?: string | null;
  vars: Vars;
  customer?: { email?: string | null; phone?: string | null } | null;
}

type EmailPayload = { kind: "email"; email: EmailBody; idempotencyKey?: string };
type WhatsAppPayload = { kind: "whatsapp"; template: string | null; lang: string; params: string[] };

/** Variables every order event can use. */
export function orderVars(order: Order): Vars {
  const addr = order.shippingAddress as { fullName?: string; city?: string } | null;
  // the buyer's name: on a gift the address is the recipient's
  const firstName = (order.contactName ?? addr?.fullName ?? "").trim().split(/\s+/)[0] || "there";
  return {
    orderNumber: order.orderNumber,
    title: order.title,
    total: formatPKR(order.totalMinor),
    totalMinor: order.totalMinor,
    qty: order.qty,
    binding: order.binding,
    finish: order.finish,
    book: `${order.binding} · ${order.pageCount} pages${order.qty > 1 ? ` · ${order.qty} copies` : ""}`,
    city: addr?.city ?? "",
    firstName,
    courier: order.courier ?? "",
    tracking: order.trackingNumber ?? "",
    status: order.status.replace(/_/g, " "),
    testMode: !order.livemode,
    orderUrl: `${config.appUrl}/orders/${order.id}`,
    adminUrl: `${config.appUrl}/admin/orders/${order.id}`,
    reviewUrl: `${config.appUrl}/review?order=${encodeURIComponent(order.orderNumber)}`,
  };
}

/** Send `event` about an order to whoever its rule names. */
export async function notifyOrder(event: NotifyEvent, order: Order, extra: Vars = {}): Promise<number> {
  // the staff "new order" email carries a one-tap WhatsApp to the customer
  // with the owner's confirmation typed in (docs/adr/025)
  if (event === "order_paid" && extra.waConfirm === undefined) {
    extra = { ...extra, waConfirm: await confirmWhatsappUrl(order).catch(() => null) };
  }
  return notifyEvent(event, {
    key: order.id,
    orderId: order.id,
    vars: { ...orderVars(order), ...extra },
    customer: { email: order.contactEmail, phone: order.contactPhone },
  });
}

/** Write and queue the messages for one event. Returns how many new messages were queued. */
export async function notifyEvent(event: NotifyEvent, input: NotifyInput): Promise<number> {
  try {
    const rule = await getRule(event);
    if (!rule.enabled) return 0;
    const rows: NewNotification[] = [];
    const add = (audience: Audience, channel: "email" | "whatsapp", recipient: string, payload: EmailPayload | WhatsAppPayload) =>
      rows.push({
        event,
        audience,
        channel,
        recipient,
        orderId: input.orderId ?? null,
        payload,
        dedupeKey: `${event}:${input.key}:${channel}:${recipient}`,
      });

    const staffEmail = renderEmail(event, "staff", input.vars);
    if (staffEmail) for (const to of rule.staffEmails) add("staff", "email", to, { kind: "email", email: staffEmail });
    for (const to of rule.staffWhatsapp) {
      add("staff", "whatsapp", to, { kind: "whatsapp", template: rule.staffTemplate, lang: rule.templateLang, params: whatsappParams(event, "staff", input.vars) });
    }
    const customer = input.customer;
    if (customer?.email && rule.customerEmail) {
      const email = renderEmail(event, "customer", input.vars);
      // keep the confirmation's old provider key so a deploy mid-send can't double it
      if (email) add("customer", "email", customer.email, { kind: "email", email, idempotencyKey: event === "order_paid" ? `order-confirmed-${input.key}` : undefined });
    }
    const phone = toWhatsappNumber(customer?.phone);
    if (phone && rule.customerWhatsapp) {
      add("customer", "whatsapp", phone, { kind: "whatsapp", template: rule.customerTemplate, lang: rule.templateLang, params: whatsappParams(event, "customer", input.vars) });
    }
    if (!rows.length) return 0;

    const db = opsDb();
    if (!db) {
      // no database: send now, best effort
      for (const r of rows) await deliver(r.channel, r.recipient, r.payload as EmailPayload | WhatsAppPayload).catch((err) => log.warn({ err, event }, "[notify] send failed"));
      return rows.length;
    }
    const inserted = await db.insert(notifications).values(rows).onConflictDoNothing({ target: notifications.dedupeKey }).returning({ id: notifications.id });
    for (const r of inserted) enqueue("notify.send", { id: r.id });
    return inserted.length;
  } catch (err) {
    // a notification problem must never break the thing being notified about
    log.error({ err, event, key: input.key }, "[notify] could not queue");
    return 0;
  }
}

/** Hand one message to its provider. */
async function deliver(channel: string, recipient: string, payload: EmailPayload | WhatsAppPayload): Promise<{ providerId: string | null; skipped?: string }> {
  if (payload.kind === "email") {
    const r = await emailProvider.send({ to: recipient, ...payload.email, idempotencyKey: payload.idempotencyKey });
    return { providerId: r.providerMessageId };
  }
  if (!whatsapp) return { providerId: null, skipped: "WhatsApp is not connected yet (WHATSAPP_* settings)" };
  if (!payload.template) return { providerId: null, skipped: "No WhatsApp template named in this rule" };
  const r = await whatsapp.sendTemplate(recipient, payload.template, payload.lang, payload.params);
  return { providerId: r.messageId };
}

/** Worker: send one stored message. Throws on failure so the queue retries. */
async function sendOne(data: unknown): Promise<void> {
  const { id } = data as { id: string };
  const db = opsDb();
  if (!db) return;
  const [row] = await db.select().from(notifications).where(eq(notifications.id, id)).limit(1);
  if (!row || row.status === "sent" || row.status === "delivered" || row.status === "read" || row.status === "skipped") return;
  await db.update(notifications).set({ attempts: sql`${notifications.attempts} + 1`, updatedAt: new Date() }).where(eq(notifications.id, id));
  try {
    const r = await deliver(row.channel, row.recipient, row.payload as EmailPayload | WhatsAppPayload);
    await db
      .update(notifications)
      .set(r.skipped ? { status: "skipped", error: r.skipped, updatedAt: new Date() } : { status: "sent", providerId: r.providerId, error: null, sentAt: new Date(), updatedAt: new Date() })
      .where(eq(notifications.id, id));
  } catch (err) {
    await db
      .update(notifications)
      .set({ status: "failed", error: (err instanceof Error ? err.message : String(err)).slice(0, 500), updatedAt: new Date() })
      .where(eq(notifications.id, id));
    throw err;
  }
}

register("notify.send", sendOne, { retryLimit: 5, retryDelaySeconds: 60, concurrency: 2, expireInSeconds: 120 });

/** Send a stored message again (Admin → Notifications → Resend). */
export async function resendNotification(id: string): Promise<void> {
  const db = opsDb();
  if (!db) return;
  await db.update(notifications).set({ status: "queued", error: null, updatedAt: new Date() }).where(eq(notifications.id, id));
  enqueue("notify.send", { id });
}
