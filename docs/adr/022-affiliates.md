# ADR 022: Affiliates (links, commissions, monthly payouts, partner page)

- Status: accepted (owner approved canvas Round 6 on 2026-11-26)
- Design: canvas boards R6Affiliates, R6Affiliate, R6Partner, R6How
- Migration: `0010_affiliates` (additive: four tables, four nullable columns)

## Context

The owner is starting affiliate marketing: people and businesses share a
link, and the owner needs to know which orders came through it, what each
affiliate is owed, and to pay them. Owner decisions:

- link only: the customer pays the normal price (no affiliate discount)
- commission type not decided, so each affiliate is set to either a
  percentage of the order or a fixed amount per order
- monthly payouts, and affiliates get their own dashboard

## Decision

**Rules** (`shared/affiliates.ts`, one constant each, the owner's to change):

| Rule | Value |
|---|---|
| A tap counts for | 30 days, last affiliate tapped wins |
| Commission base | book total the customer paid (subtotal − promo), never shipping |
| Payable | 7 days after delivery |
| Payout | 5th of each month, for everything approved by the end of last month |
| Cancelled/refunded before payout | reversed (earns nothing) |
| Refunded after payout | a negative "taken back" line in the next payout |
| Test (sandbox) orders | never earn |
| Own link | not credited: same account, same email, or the order phone is their JazzCash/Easypaisa number |

**Attribution** (`server/affiliates/attribution.ts`):

1. Any page request with `?ref=code` for an active affiliate sets an httpOnly
   cookie `tk_ref=code.time` (30 days) and records one visit per visitor per
   day. It runs on the server before static files, so prerendered pages work
   too, and the browser can't forge the time. Crawlers and link previews
   (WhatsApp, Facebook…) are not counted as visitors.
2. The next API request with a session (guests have anonymous sessions)
   saves the tap onto the account (`users.affiliate_id/at`), so a tap on a
   phone still counts on a laptop. A guest's tap moves to their real account
   at sign-in.
3. At checkout the newer of the cookie and the account's tap, if in the
   window, for an active affiliate, and not self-referral, is written onto
   the order (`orders.affiliate_id`, `affiliate_source = link`). Only the
   owner changes it afterwards (`admin`, audited, noted on the timeline).

**Commissions** (`server/affiliates/commissions.ts`): `syncCommission(order)`
derives the lines from the order's current state and is idempotent. It is
called after payment, every admin status change and every attribution
change, and a job (`affiliates.sync`, every 30 minutes) re-runs it for recent
credited orders, so a missed call is repaired, the same way the print
reconciler works. The rate is frozen on the line when the order is paid.

**Payouts:** "Mark paid" (owner, from the 1st of the next month) takes every
approved, unpaid line up to the end of that month, carried-over months and
taken-back lines included, in one transaction with row locks. A double click
finds nothing left. The reference is stored and emailed to the affiliate.

**Screens:** Admin › Affiliates (list, add, edit, pause), one affiliate's
page (link, 30-day numbers, credited orders with commission state, payouts),
and an Affiliate card on the admin order page (owner only).
`/partners` is the affiliate's phone page: they sign in with the email they
were added with (verified email only). It never carries a customer's name,
phone, email or address, and shows the payout account masked.

## Alternatives considered

- **Client-side capture** (localStorage + beacon): blocked by tracking
  preferences and forgeable. The server cookie is simpler and holds up.
- **A third-party affiliate platform** (Rewardful, Tapfiliate and similar):
  built for Stripe and card payouts, not JazzCash/Easypaisa, monthly fees,
  and customer data leaves us. Our volume is small.
- **Counters on the affiliate row:** they drift. Everything is summed from
  the lines, and the lines are derived from orders.

## Consequences

- Commission is per order, not per copy (`qty`). A fixed amount is paid once
  per order.
- Visitors are counted from cookies: a visitor who clears cookies counts again.
- Paused affiliates stop new credit immediately. Orders already credited
  still pay out.
- Owner to-do: decide the commission rates per affiliate; change the 30/7/5
  defaults in `shared/affiliates.ts` if wanted.
