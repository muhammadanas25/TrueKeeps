# ADR 005 — Orders, PKR pricing, and Safepay v3 hosted checkout

**Status:** accepted · 2026-10-18

## Context

TrueKeep sells to Pakistan only, prepaid, in PKR (decided 2026-09-13).
Stripe is unavailable in Pakistan; Safepay was chosen over PayFast for its
fees, API and sandbox. The order screen previously faked an order ("Place
my order" → a confirmation screen) with USD prices hard-coded in three
places.

Facts established against the Safepay sandbox before writing code:

1. **The browser return is unsigned.** After payment Safepay redirects to
   `redirect_url` with only `?tracker=…` (v3) or `?order_id&tracker` (legacy).
   Anyone can forge that URL, so it can never mark an order paid.
2. **Safepay appends `?tracker=` blindly.** A return URL that already has a
   query string gets a second `?`, corrupting our parameter. The order id
   therefore lives in the path: `/api/payments/return/:orderId`.
3. **Legacy trackers can't be verified server-side.** Trackers made by the
   SDK's `/order/v1/init` + `/checkout` flow are invisible to the reporter
   API ("cannot find tracker", even after payment). v3 trackers
   (`POST /order/payments/v3/`) are visible: `state = TRACKER_ENDED`,
   `charge.amount` in paisa, and our order number in metadata.
4. **Amounts are paisa** in v3 (Rs 1,500 → `150000`).
5. **Webhooks** are HMAC-SHA512 hex in `X-SFPY-SIGNATURE` with the
   endpoint's shared secret. The SDK signs `JSON.stringify(body.data)`;
   the docs sign the whole payload — both are accepted.
6. The sandbox account currently offers **cards and Google Pay** on the
   hosted page; Raast reports disabled. UI copy claims only that.

## Decision

- **One price list**, `shared/pricing.ts`, integer paisa, imported by the
  client (display) and server (authoritative re-quote). Orders store the
  quoted amounts and `price_list_version`.
  Launch prices are placeholders pending the owner's confirmation:
  Softcover Rs 4,499 · Hardcover Rs 6,499 · Layflat Rs 9,499 · shipping
  Rs 299, free from Rs 10,000.
- **Schema** (`migrations/0002`): `orders` (frozen book snapshot, address,
  totals, `livemode`, unique `(user_id, idempotency_key)` and
  `provider_ref`), `order_events` (customer-visible timeline), `payments`
  (audit, unique `provider_event_id`).
- **Gateway seam**: `server/payments/provider.ts` with a Safepay v3
  implementation (plain `fetch`, no SDK) and a dev-only fake gateway when
  no keys are configured. In production without keys, checkout returns
  503 instead of faking.
- **Only `confirmPayment()` can mark an order paid**, and only after the
  reporter API says `TRACKER_ENDED` with amount == order total, currency
  PKR, and matching order number. The return redirect, the webhook, the
  status-page poll and a 5-minute background sweep all just call it. The
  status change is compare-and-set, so concurrent confirmers produce one
  transition, one payment row and one email.
- **Mismatches are refused and recorded** (`amount_mismatch` event + error
  log) for a human to look at.
- **Expiry**: unpaid orders expire after 24 h (after a last gateway
  check); a payment that lands later still moves `expired → paid`.
- **Test mode is explicit**: `livemode=false` orders (sandbox keys) show
  a banner at checkout, on the order page, in the email subject, carry a
  TEST tag in lists, and the admin console refuses to move them to
  production.
- The legacy `/wizard-classic` route (USD prices, fake "Order placed")
  now redirects to `/wizard`.

## Consequences

- Going live = Safepay approves the merchant account, then swap Railway
  vars to live keys and `SAFE_PAY_API_URL=https://api.getsafepay.com`.
  The live hosted-checkout base defaults to `https://getsafepay.com/embedded/`
  (from a third-party integration; unverified) — set
  `SAFE_PAY_CHECKOUT_URL` if Safepay documents otherwise, and run one real
  low-value payment before announcing.
- Webhooks must be subscribed in the Safepay dashboard for
  `payment.succeeded` (and `payment.failed`) at
  `https://thetruekeeps.com/api/payments/webhook/safepay`. Without them,
  the redirect, poll and sweep still confirm payments.
- The sweep is an in-process timer; correct at one replica, and safe at
  more because transitions are compare-and-set.
- Not built yet: shipped/delivered emails, refunds via API, discount codes.
