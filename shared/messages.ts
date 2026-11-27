/**
 * Customer messages sent by hand: bank transfer pending, order confirmed,
 * shipped, review request
 * (owner, 2026-11-28; design approved on canvas M1–M5, docs/adr/025).
 *
 * Until the WhatsApp Cloud API is connected, the team sends these themselves:
 * every order has its messages ready-made in the owner's words, filled
 * in from the order, with "Open WhatsApp" (wa.me with the text typed in),
 * "Copy" and "Email" (mailto). The owner edits the words in Admin ›
 * Notifications › Customer messages; [Brackets] are filled in per order.
 *
 * When each is due (messageReady): bank while a bank-transfer order waits for
 * its money (the Overview lists it after BANK_REMIND_AFTER_HOURS, for anyone
 * who closed the page and missed the instructions), confirm once paid,
 * shipped once marked shipped, review REVIEW_AFTER_DAYS after delivery. A message is "sent" when
 * someone taps WhatsApp or Email for it (or ticks it), stored in
 * order_messages, so the Overview's "Messages to send" list empties.
 */

import { z } from "zod";

export const MESSAGE_KEYS = ["bank", "confirm", "shipped", "review"] as const;
export type MessageKey = (typeof MESSAGE_KEYS)[number];

export const MESSAGE_LABEL: Record<MessageKey, string> = {
  bank: "Bank transfer pending",
  confirm: "Order confirmed",
  shipped: "Shipped",
  review: "Ask for a review",
};

/** Hours a bank-transfer order waits before the Overview lists its reminder. */
export const BANK_REMIND_AFTER_HOURS = 24;

/** Days after delivery before the review request is due. */
export const REVIEW_AFTER_DAYS = 3;

/** In words, for the editor and the order card. */
export const MESSAGE_WHEN: Record<MessageKey, string> = {
  bank: `For bank-transfer orders waiting for their money. Listed on the Overview after ${BANK_REMIND_AFTER_HOURS} hours.`,
  confirm: "Ready when the order is paid.",
  shipped: "Ready when the order is marked shipped with a tracking number.",
  review: `Ready ${REVIEW_AFTER_DAYS} days after the order is marked delivered.`,
};

export interface MessageTemplate {
  subject: string;
  body: string;
}
export type MessageTemplates = Record<MessageKey, MessageTemplate>;

/** The owner's words, as sent on WhatsApp on 28 Nov 2026 (kept exactly, emoji included). */
export const DEFAULT_MESSAGES: MessageTemplates = {
  // written 28 Nov 2026 in the owner's style for "order received, bank transfer pending"
  bank: {
    subject: "Your TrueKeeps order [Order ID] is waiting for your bank transfer",
    body:
      "Hey [Name]!\n\nWe have received your order [Order ID] 😊\n\nIt is waiting for your bank transfer of [Amount]. Here are our bank details:\n\n[Bank details]\n\n" +
      "Once you transfer, please send the payment screenshot on WhatsApp at [Our WhatsApp]. We will start printing your album as soon as we confirm it.\n\n" +
      "We will hold your order until [Pay by].\n\nThank you for trusting The Truekeeps with your memories 💛",
  },
  confirm: {
    subject: "Your TrueKeeps order [Order ID] is confirmed",
    body:
      "Hey [Name]!\n\nYour order [Order ID] is confirmed ✅\n\nWe have received your payment. Your album will be printed and shipped soon.\n\n" +
      "It should reach you in 4 to 7 working days. We will send you the tracking number once it ships.\n\nThank you for trusting The Truekeeps with your memories 💛",
  },
  shipped: {
    subject: "Your TrueKeeps order [Order ID] has been shipped",
    body:
      "Hey [Name]!\n\nYour order [Order ID] has been shipped 📦\n\nCourier: [Courier]\nTracking number: [Tracking ID]\nTrack here: [Tracking link]\n\n" +
      "It should reach you in 2 to 4 working days.\n\nThank you for trusting The Truekeeps with your memories 💛",
  },
  review: {
    subject: "How did you find your TrueKeeps album?",
    body:
      "[Name], hope you're doing well! 😊\n\nIt's been a few days since your album arrived. How did you find it?\n\n" +
      "If you loved it, please leave us a quick review: [Review link]\n\nIf anything was not right, just reply here. We want to know.\n\n" +
      "Thank you for trusting The Truekeeps with your memories 💛",
  },
};

/** The words the editor offers to insert; each is filled in from the order. */
export const PLACEHOLDERS = ["[Name]", "[Order ID]", "[Amount]", "[Bank details]", "[Pay by]", "[Our WhatsApp]", "[Courier]", "[Tracking ID]", "[Tracking link]", "[Review link]"] as const;

export const messageTemplatesSchema = z.object(
  Object.fromEntries(
    MESSAGE_KEYS.map((k) => [k, z.object({ subject: z.string().trim().min(1, "Add a subject").max(200), body: z.string().trim().min(1, "Write the message").max(2000) })]),
  ) as Record<MessageKey, z.ZodObject<{ subject: z.ZodString; body: z.ZodString }>>,
);

/** Saved templates, falling back to the defaults key by key. */
export function templatesFrom(saved: unknown): MessageTemplates {
  const out = { ...DEFAULT_MESSAGES };
  const s = (saved ?? {}) as Partial<Record<MessageKey, Partial<MessageTemplate>>>;
  for (const k of MESSAGE_KEYS) {
    const t = s[k];
    if (t && typeof t.subject === "string" && typeof t.body === "string" && t.body.trim()) out[k] = { subject: t.subject, body: t.body };
  }
  return out;
}

/* ── filling in ────────────────────────────────────────────────── */

export const DEFAULT_COURIER = "TCS";

/**
 * Where a customer tracks a parcel. TCS's is the owner's link; for any other
 * courier, the customer's own order page (it shows the courier and number).
 */
export const TCS_TRACKING = "https://www.tcsexpress.com/track";
export const trackingPage = (courier: string, orderUrl: string) => (/tcs/i.test(courier) ? TCS_TRACKING : orderUrl);

export interface MessageVars {
  name: string;
  orderNumber: string;
  courier: string;
  tracking: string;
  reviewUrl: string;
  /** the customer's order page, the tracking link for couriers other than TCS */
  orderUrl: string;
  /** what the order costs, "Rs 6,490" */
  amount: string;
  /** our account, one line each (shared/payments.ts BANK_DETAILS) */
  bankDetails: string;
  /** the last day we hold an unpaid order, "Sunday 30 November" */
  payBy: string;
  /** our WhatsApp for payment screenshots */
  ourWhatsapp: string;
}

/** Fill in the [Brackets]. Unknown brackets are left as typed. */
export function fillMessage(text: string, v: MessageVars): string {
  const courier = v.courier.trim() || DEFAULT_COURIER;
  const map: Record<string, string> = {
    "[Name]": v.name,
    "[Order ID]": v.orderNumber,
    "[Courier]": courier,
    "[Tracking ID]": v.tracking.trim() || "[Tracking ID]",
    "[Tracking link]": trackingPage(courier, v.orderUrl),
    "[Review link]": v.reviewUrl,
    "[Amount]": v.amount,
    "[Bank details]": v.bankDetails,
    "[Pay by]": v.payBy,
    "[Our WhatsApp]": v.ourWhatsapp,
  };
  return text.replace(/\[(Name|Order ID|Courier|Tracking ID|Tracking link|Review link|Amount|Bank details|Pay by|Our WhatsApp)\]/g, (m) => map[m] ?? m);
}

/** First name from the delivery address ("Sara Khan" → "Sara"). */
export const firstNameOf = (fullName: string | null | undefined) => (fullName ?? "").trim().split(/\s+/)[0] || "there";

/* ── links ─────────────────────────────────────────────────────── */

/** Pakistani mobile → 92XXXXXXXXXX for wa.me; null when it doesn't look like one. */
export function waNumber(phone: string | null | undefined): string | null {
  let d = (phone ?? "").replace(/\D/g, "");
  if (d.startsWith("0092")) d = d.slice(2);
  if (d.startsWith("0")) d = "92" + d.slice(1);
  if (d.startsWith("3") && d.length === 10) d = "92" + d;
  return /^92\d{10}$/.test(d) ? d : null;
}

/** Opens WhatsApp (app or web) to this number with the message typed in. */
export function whatsappUrl(phone: string | null | undefined, text: string): string | null {
  const n = waNumber(phone);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : null;
}

/** Opens the email app with the subject and message filled in. */
export function mailtoUrl(email: string, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(email).replace(/%40/g, "@")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body.replace(/\n/g, "\r\n"))}`;
}

/* ── when each is due ──────────────────────────────────────────── */

const DAY = 86_400_000;

/**
 * Is this message due for an order now? `deliveredAt` comes from the order's
 * timeline. Cancelled, refunded and expired orders get none; an unpaid order
 * only the bank-transfer reminder.
 */
export function messageReady(key: MessageKey, o: { status: string; trackingNumber: string | null; paymentProvider?: string }, deliveredAt: Date | null, now: Date): boolean {
  if (key === "bank") return o.status === "pending_payment" && o.paymentProvider === "bank_transfer";
  if (key === "confirm") return ["paid", "in_production", "shipped", "delivered"].includes(o.status);
  if (key === "shipped") return ["shipped", "delivered"].includes(o.status);
  return o.status === "delivered" && deliveredAt !== null && now.getTime() - deliveredAt.getTime() >= REVIEW_AFTER_DAYS * DAY;
}

/** Body of POST /api/admin/ops/orders/:id/messages/:key. */
export const markMessageSchema = z.object({ channel: z.enum(["whatsapp", "email", "other"]) });
