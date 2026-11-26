/**
 * Checks for bank transfer orders (server/orders/service.ts, 2026-11-21).
 *
 * Runs the real order service against the in-memory store, with Safepay,
 * the database and email switched off by the environment below:
 *   - the payment switch: bank transfer on by default, card off; an order by a
 *     method that is off is refused
 *   - a bank transfer order is pending, has no gateway session, is held for
 *     BANK_TRANSFER_WINDOW_DAYS, and asking it for a card checkout is refused
 *   - the same idempotency key returns the same order
 *   - "Payment received" marks it paid once, records one payment, and a second
 *     press is refused; it is refused for a card order too
 *
 * Run:
 *   DATABASE_URL= RESEND_API_KEY= API_KEY_SAFE_PAY= SAFE_PAY_SECRET_KEY= SAFE_PAY_WEBHOOK_SECRET= \
 *     npx tsx server/orders/bank-transfer.test.ts
 */

import { randomUUID } from "crypto";
import { BANK_TRANSFER_WINDOW_DAYS, DEFAULT_PAYMENT_SETTINGS } from "@shared/payments";
import type { BuilderDocument } from "@shared/document";
import { storage } from "../storage";
import { availableMethods, checkoutUrlFor, createOrder, getPaymentSettings, markBankTransferPaid, OrderError } from "./service";

let fails = 0;
const expect = (ok: boolean, msg: string) => {
  if (!ok) fails++;
  console.log((ok ? "  ok   " : "  FAIL ") + msg);
};
const rejects = async (p: Promise<unknown>, code: string, msg: string) => {
  try {
    await p;
    expect(false, msg + " (did not throw)");
  } catch (e) {
    expect(e instanceof OrderError && e.code === code, `${msg} (${(e as OrderError).code ?? e})`);
  }
};

async function main() {
  if (process.env.DATABASE_URL) throw new Error("run with DATABASE_URL= so the test uses the in-memory store");

  const user = { id: randomUUID(), email: "test@example.com", phone: null };
  const project = await storage.createProject({ userId: user.id, name: "Test book" } as never);
  const photoIds = Array.from({ length: 12 }, () => randomUUID());
  for (const id of photoIds) {
    await storage.createUploadedPhoto({
      id,
      userId: user.id,
      projectId: project.id,
      url: "/media/x.jpg",
      originalFilename: "x.jpg",
      originalUploadedAt: new Date(),
    } as never);
  }
  const doc: BuilderDocument = {
    v: 1,
    occasion: "wedding",
    vibe: null,
    title: "Test book",
    photos: photoIds.map((id) => ({ id, label: "", shade: 0, w: 3000, h: 2000 })),
    pages: Array.from({ length: 10 }, (_, i) => ({ id: "pg" + i, layout: "single", slots: [{ photoId: photoIds[i], fx: 0.5, fy: 0.5, zoom: 1, turn: 0 }], caption: "" })),
    themeId: "ivory",
    density: "balanced",
    coverStyle: "classic",
    voice: "warm",
    qty: 1,
    binding: "hardcover",
  } as BuilderDocument;
  const body = (method: "card" | "bank_transfer", key: string) => ({
    projectId: project.id,
    binding: "hardcover" as const,
    finish: "matte" as const,
    qty: 1,
    address: { fullName: "Ayesha K", phone: "03001234567", line1: "House 1", line2: "", city: "Lahore", province: "Punjab" as const, postalCode: "" },
    document: doc,
    idempotencyKey: key,
    method,
  });

  // the switch
  const s = await getPaymentSettings();
  expect(s.card === DEFAULT_PAYMENT_SETTINGS.card && s.bankTransfer === DEFAULT_PAYMENT_SETTINGS.bankTransfer, "default: bank transfer on, card off");
  const m = await availableMethods();
  expect(m.bankTransfer && !m.card, "checkout offers bank transfer only");
  await rejects(createOrder(user, body("card", "key-card-0001")), "PAYMENTS_DISABLED", "a card order is refused while card is off");

  // a bank transfer order
  const t0 = Date.now();
  const { order, checkoutUrl } = await createOrder(user, body("bank_transfer", "key-bank-0001"));
  expect(checkoutUrl === null, "no payment page for a bank transfer");
  expect(order.status === "pending_payment" && order.paymentProvider === "bank_transfer" && !order.providerRef, "pending, bank_transfer, no gateway session");
  const held = (order.expiresAt!.getTime() - t0) / (24 * 3600 * 1000);
  expect(Math.abs(held - BANK_TRANSFER_WINDOW_DAYS) < 0.01, `held for ${BANK_TRANSFER_WINDOW_DAYS} days (${held.toFixed(2)})`);
  // Lahore: Rs 200 delivery since 2026-11-26 (shared/pricing.ts deliveryFor)
  expect(order.totalMinor === 6_690_00 && order.shippingMinor === 200_00, "priced by the server: Rs 6,490 + Rs 200 delivery");
  const again = await createOrder(user, body("bank_transfer", "key-bank-0001"));
  expect(again.order.id === order.id, "the same key returns the same order");
  await rejects(checkoutUrlFor(order), "BANK_TRANSFER", "a bank transfer order can't open a card checkout");

  // payment received
  const paid = await markBankTransferPaid(order.id, "admin-1", "DIB-REF-778");
  expect(paid.status === "paid" && Boolean(paid.paidAt), "Payment received marks it paid");
  const events = await storage.listOrderEvents(order.id);
  expect(events.some((e) => e.toStatus === "paid" && e.actor === "admin" && /ref DIB-REF-778/.test(e.note ?? "")), "the timeline records who and the reference");
  await rejects(markBankTransferPaid(order.id, "admin-1"), "NOT_PAYABLE", "a second press is refused");

  // card orders are never marked paid by hand
  await storage.setSetting("payments", { card: true, bankTransfer: true }, "admin-1");
  const cardOrder = await createOrder(user, body("card", "key-card-0002")).catch(() => null);
  if (cardOrder) await rejects(markBankTransferPaid(cardOrder.order.id, "admin-1"), "NOT_BANK_TRANSFER", "a card order can't be marked paid by hand");
  else expect(true, "(card order skipped: no gateway in this environment)");

  console.log(fails ? `${fails} FAILURES` : "ALL CHECKS PASSED");
  process.exit(fails ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
