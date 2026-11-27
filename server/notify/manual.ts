/**
 * Customer messages sent by hand (shared/messages.ts, docs/adr/025).
 *
 * What lives here:
 *  - the owner's templates (app_settings "customer_messages", falling back to
 *    DEFAULT_MESSAGES key by key)
 *  - messagesForOrder: the messages for one order (the bank-transfer reminder
 *    only on bank-transfer orders), filled in, each with
 *    whether it is due, whether it was sent (order_messages), and ready-made
 *    WhatsApp (wa.me) and email (mailto) links
 *  - messagesToSend: the Overview's list. Due messages nobody has sent yet,
 *    for recent live orders only, so turning this on doesn't list every old
 *    order: bank-transfer reminders once an order has waited 24 hours,
 *    confirmations for orders paid in the last 7 days, shipped notes
 *    for orders shipped in the last 14 days, review requests 3–14 days after
 *    delivery
 *  - confirmWhatsappUrl: the one-tap link in the staff "new order" email
 *
 * Links are built on the server so the order page, the Overview and the
 * email all send exactly the same words.
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import { orderEvents, orderMessages, orders, type Order, type OrderMessage } from "@shared/schema";
import {
  BANK_REMIND_AFTER_HOURS,
  MESSAGE_KEYS,
  MESSAGE_LABEL,
  MESSAGE_WHEN,
  fillMessage,
  firstNameOf,
  mailtoUrl,
  messageReady,
  templatesFrom,
  whatsappUrl,
  type MessageKey,
  type MessageTemplates,
} from "@shared/messages";
import { BANK_DETAILS, BANK_TRANSFER_PROVIDER, SUPPORT_WHATSAPP } from "@shared/payments";
import { formatPKR } from "@shared/pricing";
import { storage } from "../storage";
import { config } from "../config";
import type { OpsDb } from "../ops/db";

export const TEMPLATES_SETTING = "customer_messages";

export async function getTemplates(): Promise<MessageTemplates> {
  return templatesFrom(await storage.getSetting(TEMPLATES_SETTING));
}

export interface OrderMessageView {
  key: MessageKey;
  label: string;
  when: string;
  ready: boolean;
  subject: string;
  text: string;
  whatsappUrl: string | null;
  mailtoUrl: string;
  sent: { channel: string; by: string | null; at: Date } | null;
}

type MsgOrder = Pick<
  Order,
  "id" | "orderNumber" | "status" | "courier" | "trackingNumber" | "contactEmail" | "contactPhone" | "shippingAddress" | "totalMinor" | "expiresAt" | "paymentProvider"
>;

const BANK_LINES = [`Bank: ${BANK_DETAILS.bankName}`, `Account title: ${BANK_DETAILS.accountTitle}`, `Account number: ${BANK_DETAILS.accountNumber}`, `IBAN: ${BANK_DETAILS.iban}`].join("\n");

/** "Sunday 30 November", in Pakistan time. */
const longDay = (d: Date | null) => (d ? d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Karachi" }) : "");

const isBank = (o: Pick<Order, "paymentProvider">) => o.paymentProvider === BANK_TRANSFER_PROVIDER;

/** The fill-in values for one order. */
function varsOf(o: MsgOrder) {
  const addr = o.shippingAddress as { fullName?: string; phone?: string } | null;
  return {
    name: firstNameOf(addr?.fullName),
    orderNumber: o.orderNumber,
    courier: o.courier ?? "",
    tracking: o.trackingNumber ?? "",
    reviewUrl: `${config.appUrl}/review?order=${encodeURIComponent(o.orderNumber)}`,
    orderUrl: `${config.appUrl}/orders/${o.id}`,
    amount: formatPKR(o.totalMinor),
    bankDetails: BANK_LINES,
    payBy: longDay(o.expiresAt),
    ourWhatsapp: SUPPORT_WHATSAPP.display,
  };
}

/** The phone to WhatsApp: the delivery address's, else the order's contact phone. */
const phoneOf = (o: MsgOrder) => (o.shippingAddress as { phone?: string } | null)?.phone || o.contactPhone;

/** One message for one order, filled in, with its links. */
export function buildMessage(key: MessageKey, o: MsgOrder, t: MessageTemplates) {
  const v = varsOf(o);
  const text = fillMessage(t[key].body, v);
  const subject = fillMessage(t[key].subject, v);
  return { key, label: MESSAGE_LABEL[key], subject, text, whatsappUrl: whatsappUrl(phoneOf(o), text), mailtoUrl: mailtoUrl(o.contactEmail, subject, text) };
}

/** When each order was marked delivered and shipped (from its timeline). */
async function statusTimes(db: OpsDb, ids: string[]): Promise<Map<string, { delivered: Date | null; shipped: Date | null }>> {
  const out = new Map<string, { delivered: Date | null; shipped: Date | null }>();
  if (!ids.length) return out;
  const rows = await db
    .select({ id: orderEvents.orderId, to: orderEvents.toStatus, at: sql<Date>`max(${orderEvents.createdAt})` })
    .from(orderEvents)
    .where(and(inArray(orderEvents.orderId, ids), inArray(orderEvents.toStatus, ["delivered", "shipped"])))
    .groupBy(orderEvents.orderId, orderEvents.toStatus);
  for (const r of rows) {
    const cur = out.get(r.id) ?? { delivered: null, shipped: null };
    cur[r.to as "delivered" | "shipped"] = new Date(r.at);
    out.set(r.id, cur);
  }
  return out;
}

/** The order page's messages (the bank reminder only on bank-transfer orders). */
export async function messagesForOrder(db: OpsDb, o: Order, now = new Date()): Promise<OrderMessageView[]> {
  const [t, sentRows, times] = await Promise.all([getTemplates(), db.select().from(orderMessages).where(eq(orderMessages.orderId, o.id)), statusTimes(db, [o.id])]);
  const sent = new Map<string, OrderMessage>(sentRows.map((r) => [r.key, r]));
  const delivered = times.get(o.id)?.delivered ?? null;
  return MESSAGE_KEYS.filter((key) => key !== "bank" || isBank(o)).map((key) => {
    const s = sent.get(key);
    return {
      ...buildMessage(key, o, t),
      when: MESSAGE_WHEN[key],
      ready: messageReady(key, o, delivered, now),
      sent: s ? { channel: s.channel, by: s.sentBy, at: s.sentAt } : null,
    };
  });
}

export interface ToSendRow {
  orderId: string;
  orderNumber: string;
  name: string;
  phone: string;
  key: MessageKey;
  label: string;
  since: string;
  sinceAt: Date;
  whatsappUrl: string | null;
  mailtoUrl: string;
  text: string;
}

/** Due, unsent messages for recent live orders, oldest first. */
export async function messagesToSend(db: OpsDb, now = new Date()): Promise<ToSendRow[]> {
  const candidates = await db
    .select()
    .from(orders)
    .where(
      sql`${orders.livemode} = true AND (
        (${orders.status} = 'pending_payment' AND ${orders.paymentProvider} = ${BANK_TRANSFER_PROVIDER}
          AND ${orders.createdAt} < now() - make_interval(hours => ${BANK_REMIND_AFTER_HOURS}))
        OR (${orders.status} IN ('paid','in_production') AND ${orders.paidAt} > now() - interval '7 days')
        OR (${orders.status} IN ('shipped','delivered') AND ${orders.updatedAt} > now() - interval '21 days'))`,
    )
    .limit(500);
  if (!candidates.length) return [];
  const ids = candidates.map((o) => o.id);
  const [t, sentRows, times] = await Promise.all([getTemplates(), db.select({ id: orderMessages.orderId, key: orderMessages.key }).from(orderMessages).where(inArray(orderMessages.orderId, ids)), statusTimes(db, ids)]);
  const sent = new Set(sentRows.map((r) => `${r.id}|${r.key}`));
  const DAY = 86_400_000;
  const out: ToSendRow[] = [];
  for (const o of candidates) {
    const tm = times.get(o.id) ?? { delivered: null, shipped: null };
    const add = (key: MessageKey, sinceAt: Date, since: string) => {
      if (sent.has(`${o.id}|${key}`)) return;
      const m = buildMessage(key, o, t);
      const addr = o.shippingAddress as { fullName?: string; phone?: string } | null;
      out.push({ orderId: o.id, orderNumber: o.orderNumber, name: addr?.fullName ?? "", phone: addr?.phone || o.contactPhone, key, label: m.label, since, sinceAt, whatsappUrl: m.whatsappUrl, mailtoUrl: m.mailtoUrl, text: m.text });
    };
    if (o.status === "pending_payment" && isBank(o)) add("bank", o.createdAt, `Ordered, transfer not received${o.expiresAt ? ` · held until ${longDay(o.expiresAt)}` : ""} ·`);
    // confirmations only while the order hasn't moved on (shipping says the rest)
    if (["paid", "in_production"].includes(o.status) && o.paidAt) add("confirm", o.paidAt, "Paid");
    if (o.status === "shipped" && tm.shipped && now.getTime() - tm.shipped.getTime() < 14 * DAY) add("shipped", tm.shipped, `Shipped${o.trackingNumber ? ` · ${o.courier || "TCS"} ${o.trackingNumber}` : " · no tracking number yet"}`);
    if (o.status === "delivered" && tm.delivered && messageReady("review", o, tm.delivered, now) && now.getTime() - tm.delivered.getTime() < 14 * DAY) add("review", tm.delivered, "Delivered");
  }
  return out.sort((a, b) => a.sinceAt.getTime() - b.sinceAt.getTime());
}

/** The staff "new order" email's one-tap link: WhatsApp to the customer with the confirmation typed in. */
export async function confirmWhatsappUrl(o: Order): Promise<string | null> {
  return buildMessage("confirm", o, await getTemplates()).whatsappUrl;
}
