/**
 * How customers can pay, and how they reach us (2026-11-21).
 *
 * What: the two payment methods, the bank account a transfer goes to, the
 * WhatsApp number for payment screenshots and help, and the stored setting
 * that turns each method on or off.
 *
 * Why: Safepay (cards and Google Pay) is still being set up, and some
 * customers won't pay by card at all. A bank transfer works today: the
 * customer places the order, transfers the total, sends the screenshot on
 * WhatsApp, and the team marks it paid from the admin, which confirms the
 * order and starts the print files. The owner switches card payments on
 * from the admin once Safepay is live (admin "Payment methods").
 *
 * Shared so the checkout, the order page, the emails and the admin all show
 * the same account and number.
 */

import { z } from "zod";

export type PaymentMethod = "card" | "bank_transfer";

/** `orders.payment_provider` for a bank transfer order (card orders carry the gateway's name). */
export const BANK_TRANSFER_PROVIDER = "bank_transfer";

/** The account a transfer goes to. Shown to customers, so nothing here is secret. */
export const BANK_DETAILS = {
  bankName: "Dubai Islamic Bank",
  accountTitle: "The Truekeeps",
  accountNumber: "1112622001",
  iban: "PK75DUIB0000001112622001",
} as const;

/** WhatsApp for payment screenshots and help, as people read it and as wa.me needs it. */
export const SUPPORT_WHATSAPP = { display: "+92 300 2249456", digits: "923002249456" } as const;

/** A WhatsApp link that opens a chat with us, the message already typed. */
export const whatsappLink = (text: string): string => `https://wa.me/${SUPPORT_WHATSAPP.digits}?text=${encodeURIComponent(text)}`;

/** How long we hold a bank transfer order for its payment (a card order: 24 hours). */
export const BANK_TRANSFER_WINDOW_DAYS = 3;

/**
 * Which methods checkout offers. Stored in `app_settings` under
 * "payments"; the admin changes it. At least one must stay on.
 */
export const paymentSettingsSchema = z
  .object({
    card: z.boolean(),
    bankTransfer: z.boolean(),
  })
  .refine((s) => s.card || s.bankTransfer, { message: "Keep at least one way to pay switched on" });
export type PaymentSettings = z.infer<typeof paymentSettingsSchema>;

/** Until the owner changes it: bank transfer only, while Safepay is being set up. */
export const DEFAULT_PAYMENT_SETTINGS: PaymentSettings = { card: false, bankTransfer: true };

/** Body of POST /api/admin/orders/:id/mark-paid */
export const markPaidSchema = z.object({
  /** the bank's reference for the transfer, if the team noted it */
  reference: z.string().trim().max(120).optional(),
});
