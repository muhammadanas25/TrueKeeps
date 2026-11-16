# ADR 015 — Customer feedback page and inbox

**Status:** accepted · 2026-11-16

## Context

The owner wanted a feedback page that follows the brand kit. Customers had no
way to tell the team what went well or wrong except WhatsApp, and nothing was
recorded.

## Decision

- **`/feedback`**, a public page in the landing's chrome (Nav, Footer, Paper
  ground, Indigo headings, one Rose button). The form asks what it's about
  (five topics, required), how it went (four plain answers, optional), the
  message (required, 5 to 2,000 characters), and optionally a name, an email
  or WhatsApp number for a reply, and an order number. The order link on
  `/orders/:id` opens it with the order number filled in. The footer links to
  it under "Your account".
- **Private.** Feedback is stored in a `feedback` table (migration 0006) and
  read on **`/admin/feedback`** (role admin), newest first, filterable by new
  or read, with a one-tap reply link (mailto, or wa.me for a Pakistani mobile
  number). Nothing is shown publicly: this is not a review system, and the
  page says "We don't publish what you write."
- **The team hears about it.** Each message is emailed to every
  `ADMIN_EMAILS` address. Sending is best effort: the message is stored first,
  so an email failure only logs.
- **Anyone can send**, signed in or not (linked to the user when there is a
  session). Abuse is contained by a per-visitor limit of 5 messages per 10
  minutes and a honeypot field; a filled honeypot gets the normal success
  reply and is dropped. Customer text is escaped in the alert email.
- **Rules shared** between the form and the server in `shared/feedback.ts`.
- `/feedback` and `/admin/feedback` are app routes: served with noindex and not
  in the sitemap.

## Consequences

- One new table and migration (`0006_feedback`), applied by the pre-deploy
  `db:migrate:prod` like the others.
- With no `ADMIN_EMAILS` set, messages are still stored; nobody is emailed.
- The copy makes no promise about reply times. If the team commits to one,
  add it to the page then.

## Alternatives rejected

- **Star ratings:** numbers invite review-style display and mean different
  things to different people; four words are quicker and clearer.
- **Email only, no table:** loses messages when email fails and leaves no
  inbox to work through.
- **Sign-in required:** stops the people most likely to have a problem.

## Update 2026-11-16: called "reviews", still private

The owner renamed the page for customers: **`/review`**, "Leave a review", a
"Send review" button, "Leave a review" in the footer and on order pages, and
the inbox at **`/admin/reviews`** titled "Reviews"; alert emails say "New
review". `/feedback` and `/admin/feedback` redirect, keeping any query string
so old prefilled links still carry their order number.

Reviews stay private: the page says "Your review stays private. We don't
publish what you write." If they are ever shown publicly, that line must
change first and customers must be told before they write. The API
(`/api/feedback`), the `feedback` table and the code keep their names, so
there is no migration.
