# ADR 017 — Bank transfer, the payment-methods switch, and WhatsApp help

**Status:** accepted · 2026-11-21 (owner-approved design: canvas Round 3)

## Context

Safepay (cards, Google Pay) is still being set up, and some customers won't
pay by card. The owner wants to take orders by bank transfer now, confirm each
payment by hand from a WhatsApp screenshot, and switch card payments on from
the admin once Safepay is live. Customers also need one tap to reach the team
with enough context to find their book or order.

## Decision

- **Methods are an owner switch** (`app_settings` "payments", migration 0007;
  `shared/payments.ts`). Default: bank transfer on, card off. Card can only be
  switched on when Safepay is configured. At least one stays on.
- **A bank transfer order** is an ordinary order with
  `payment_provider = "bank_transfer"`, no gateway session, held for 3 days
  (cards: 24 hours), `livemode` true in production. The customer gets the bank
  details on the order page and by email, and a WhatsApp button with
  "Payment for order TK-…" typed.
- **Paid only through a payment.** An admin's "Payment received" calls
  `markBankTransferPaid`: the same compare-and-set to `paid`, a `payments`
  row (source `admin`, the bank reference if noted), the confirmation email and
  the print render. The generic admin status move can no longer set `paid`
  (it skipped the payment row, email and print files).
- **Account and number** (Dubai Islamic Bank, The Truekeeps, 1112622001,
  PK75DUIB0000001112622001; WhatsApp +92 300 2249456) live in
  `shared/payments.ts`, so checkout, order page, email and admin agree.
- **WhatsApp help** (`client/src/features/support/WhatsAppHelp.tsx`): a header
  button in the builder, a floating button on public and order pages. The
  message carries the order number, the first 8 characters of the book id and
  where the customer is. Not shown in admin.

## Consequences

- Tests: `server/orders/bank-transfer.test.ts` (run with the database, email
  and Safepay variables empty; see its header).
- Unpaid transfers expire after 3 days through the existing sweep; a transfer
  that arrives later can still be marked paid (expired → paid is allowed).
