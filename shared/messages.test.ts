/**
 * Unit checks for the hand-sent customer messages (shared/messages.ts,
 * docs/adr/025). Run: npx tsx shared/messages.test.ts
 *
 * Covers: the owner's words kept exactly, filling in every [Bracket], TCS vs
 * other couriers, Pakistani numbers for wa.me, the mailto link, when each
 * message is due, and saved templates falling back key by key.
 */

import assert from "node:assert/strict";
import { DEFAULT_MESSAGES, fillMessage, firstNameOf, mailtoUrl, messageReady, templatesFrom, waNumber, whatsappUrl, TCS_TRACKING, type MessageVars } from "./messages";

const v: MessageVars = {
  name: "Sara",
  orderNumber: "TK-8F2KQ7",
  courier: "",
  tracking: "7712345678",
  reviewUrl: "https://thetruekeeps.com/review?order=TK-8F2KQ7",
  orderUrl: "https://thetruekeeps.com/orders/abc",
  amount: "Rs 6,490",
  bankDetails: "Bank: X\nIBAN: PK00",
  payBy: "Sunday 30 November",
  ourWhatsapp: "+92 300 2249456",
};

// the owner's words, exactly (28 Nov 2026)
const shipped = fillMessage(DEFAULT_MESSAGES.shipped.body, v);
assert.equal(
  shipped,
  "Hey Sara!\n\nYour order TK-8F2KQ7 has been shipped 📦\n\nCourier: TCS\nTracking number: 7712345678\nTrack here: https://www.tcsexpress.com/track\n\nIt should reach you in 2 to 4 working days.\n\nThank you for trusting The Truekeeps with your memories 💛",
);
assert.ok(fillMessage(DEFAULT_MESSAGES.confirm.body, v).startsWith("Hey Sara!\n\nYour order TK-8F2KQ7 is confirmed ✅"));
assert.ok(fillMessage(DEFAULT_MESSAGES.review.body, v).includes("please leave us a quick review: https://thetruekeeps.com/review?order=TK-8F2KQ7"));
const bank = fillMessage(DEFAULT_MESSAGES.bank.body, v);
for (const part of ["Rs 6,490", "Bank: X\nIBAN: PK00", "until Sunday 30 November", "WhatsApp at +92 300 2249456"]) assert.ok(bank.includes(part), part);
for (const k of ["bank", "confirm", "shipped", "review"] as const) {
  const all = fillMessage(DEFAULT_MESSAGES[k].body, v) + fillMessage(DEFAULT_MESSAGES[k].subject, v);
  assert.ok(!/\[(Name|Order ID|Amount|Bank details|Pay by|Our WhatsApp|Courier|Tracking link|Review link)\]/.test(all), `${k} left a bracket`);
  assert.ok(!all.includes("—"), `${k} has an em dash`);
}

// another courier: its name, and the customer's order page as the tracking link
const leo = fillMessage("Courier: [Courier] / [Tracking link]", { ...v, courier: "Leopards" });
assert.equal(leo, "Courier: Leopards / https://thetruekeeps.com/orders/abc");
assert.equal(fillMessage("[Tracking link]", { ...v, courier: "tcs express" }), TCS_TRACKING);
// no tracking number yet: the bracket stays so nobody sends it by mistake
assert.equal(fillMessage("[Tracking ID]", { ...v, tracking: " " }), "[Tracking ID]");
// unknown brackets are left alone
assert.equal(fillMessage("[Gift note]", v), "[Gift note]");

assert.equal(firstNameOf("  Sara  Khan "), "Sara");
assert.equal(firstNameOf(""), "there");

// numbers for wa.me
assert.equal(waNumber("0321 4567890"), "923214567890");
assert.equal(waNumber("+92 321 4567890"), "923214567890");
assert.equal(waNumber("0092-321-4567890"), "923214567890");
assert.equal(waNumber("3214567890"), "923214567890");
assert.equal(waNumber("12345"), null);
assert.equal(whatsappUrl("03214567890", "Hi & bye 💛"), "https://wa.me/923214567890?text=Hi%20%26%20bye%20%F0%9F%92%9B");
assert.equal(whatsappUrl(null, "x"), null);

// mailto keeps the @ readable and line breaks as CRLF
const m = mailtoUrl("sara.k@example.com", "Your order", "a\nb");
assert.equal(m, "mailto:sara.k@example.com?subject=Your%20order&body=a%0D%0Ab");

// when each message is due
const now = new Date("2026-11-28T12:00:00Z");
const days = (n: number) => new Date(now.getTime() - n * 86_400_000);
assert.ok(messageReady("bank", { status: "pending_payment", trackingNumber: null, paymentProvider: "bank_transfer" }, null, now));
assert.ok(!messageReady("bank", { status: "pending_payment", trackingNumber: null, paymentProvider: "safepay" }, null, now));
assert.ok(!messageReady("bank", { status: "paid", trackingNumber: null, paymentProvider: "bank_transfer" }, null, now));
assert.ok(messageReady("confirm", { status: "paid", trackingNumber: null }, null, now));
assert.ok(!messageReady("confirm", { status: "pending_payment", trackingNumber: null }, null, now));
assert.ok(!messageReady("confirm", { status: "refunded", trackingNumber: null }, null, now));
assert.ok(messageReady("shipped", { status: "shipped", trackingNumber: "1" }, null, now));
assert.ok(!messageReady("review", { status: "delivered", trackingNumber: "1" }, days(2), now));
assert.ok(messageReady("review", { status: "delivered", trackingNumber: "1" }, days(3), now));

// saved templates fall back key by key (an old save has no "bank")
const t = templatesFrom({ confirm: { subject: "S", body: "B" } });
assert.equal(t.confirm.body, "B");
assert.equal(t.bank.body, DEFAULT_MESSAGES.bank.body);
assert.equal(templatesFrom(null).shipped.body, DEFAULT_MESSAGES.shipped.body);
assert.equal(templatesFrom({ review: { subject: "x", body: "  " } }).review.body, DEFAULT_MESSAGES.review.body);

console.log("messages: all checks passed");
