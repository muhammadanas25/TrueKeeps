# ADR 018 — Ops console: staff step-up, durable print PDFs, routed notifications, first-party analytics

**Status:** accepted · 2026-11-21 · design approved on the canvas (Round 4 and 4b)

## Context

The shop could take money but not run itself. The admin was one list of 200
orders. No PDF was ever made (print output was one JPEG per photo). The job
queue lived in memory, so a deploy during a render lost it and nothing
retried. Nobody was told a paid order existed. There was no analytics. And an
admin was anyone whose cookie said `role=admin`, signed in with a magic link,
so a stolen mailbox was a stolen admin, including every customer's photos
through `/media`.

The owner asked for a Shopify/Mixpanel-grade console, print files that can't
be lost, configurable email and WhatsApp alerts, and an admin nobody else can
reach.

## Decisions

### Security: a staff gate in front of everything
- One gate (`server/middleware/staff.ts`) is mounted on `/api/admin` before
  every router, so routes added later are covered without anyone remembering.
- It reads the role **fresh from the database** on every request (the session
  cookie caches the user for 5 minutes, and removing someone must take effect
  now), checks an optional IP allow-list (`ADMIN_IP_ALLOWLIST`), and requires
  the **second sign-in step** for this session.
- Non-staff get **404**, never 403. To a stranger the admin doesn't exist.
- Second step: our own TOTP (`server/security/totp.ts`, RFC 6238, tested
  against the RFC vectors). better-auth's two-factor plugin only challenges
  password sign-ins, and we sign in with magic links and Google, so it would
  never have asked.
  - The secret is AES-256-GCM sealed, with a key derived from
    `BETTER_AUTH_SECRET` or `STAFF_2FA_KEY`.
  - Ten single-use backup codes are stored hashed.
  - Five wrong codes lock that person for 15 minutes, on top of a per-IP
    limit.
  - A pass lasts 12 hours on one session (`staff_elevations`, which cascades
    when the session is deleted).
- Customer routes that let staff see any book, photo or order (`/media`, the
  project and order loaders) now require the passed step too. Without it,
  staff are ordinary customers there.
- `ADMIN_EMAILS` now applies at **every** sign-in. Before, it only applied when
  the account was created. Team invites apply at first sign-in
  (`server/ops/roles.ts`).
- Roles: `admin` (shown as Owner: everything) and `ops` (orders and printing;
  no revenue totals, exports, analytics or settings).
- Everything is in `audit_log`: role changes, rebuilds, every print download,
  CSV exports, step-ups and failures, refused requests.

### Durable queue: pg-boss (ADR 003's planned upgrade)
- `server/jobs.ts` keeps its `register` / `enqueue` surface. With a database
  it runs on pg-boss: jobs live in Postgres, retry with exponential backoff,
  and survive restarts. Without a database it falls back to the in-memory
  runner.
- Recurring work became pg-boss schedules, which run once per tick across any
  number of servers:
  - `orders.sweep` every 5 minutes (was a per-process timer)
  - `print.reconcile` every 10 minutes
  - `print.integrity` at 04:30
  - `notify.daily` at 09:00 Pakistan time
- SIGTERM lets running jobs finish. An unhandled rejection is logged instead of
  killing the site. Found in testing: a PDF stream error took the server down.

### Print PDFs that can't be lost (`server/print/pipeline.ts`)
- Every paid order gets a `print_jobs` row. The stages are each recorded on
  that row:
  1. render (the existing ADR 014 renderer)
  2. compose: `interior.pdf` and `cover.pdf` with PDFKit, streamed to disk
  3. upload to an **immutable versioned key** (`…/print/<order>/v<n>/`)
  4. read the copy back from storage and check its SHA-256, size and page count
  5. the same for the backup bucket (`S3_BACKUP_*`, optional)
  6. `checked`
- A rebuild is a new version, and old ones are kept. A downloaded file's
  checksum always proves what the printer got.
- Five failed attempts → `failed`, an order timeline note and a `print_failed`
  alert.
- The reconciler gives any paid order without a job a new one, and re-queues
  jobs stuck in a working state for 30 minutes. In testing, the reconciler
  picked up the seeded paid order by itself.
- The daily integrity check confirms every checked file of the last 60 days is
  still stored at its size, re-hashes a sample, and rebuilds anything missing.
- The default spec (`PRINT_SPEC`): 12×12 in trim, 3 mm bleed, TrimBox and
  BleedBox set. The geometry is transcribed from builder.css (grid frames,
  named layouts, collage rotations, edge-touching slots run into the bleed),
  with colours from the client's own palette code.
- **Known approximation:** captions, the title page and the cover title use
  standard PDF fonts, and the cover is a full-bleed photo with a title band,
  not each cover style. The admin says so on every order. Exact typography
  would mean rendering the real React pages in headless Chromium, which is
  deferred until the printer confirms their spec.
- Downloads are signed 15-minute links issued per request after the gate, with
  `Content-Disposition` and Range support so broken downloads resume.
  Customers never receive files.

### Notifications: an outbox with rules the owner edits
- `notify_rules`, one row per event (`shared/ops.ts NOTIFY_EVENTS`), edited in
  Admin → Notifications. Each rule holds:
  - an on/off switch
  - staff emails and WhatsApp numbers
  - customer email and WhatsApp on/off
  - the Meta-approved template names, with the `{{n}}` meanings shown
- An unsaved rule defaults to `ALERT_EMAILS`, or else every Owner account. So
  alerts reach the owner from the first deploy, and no address is committed to
  the (public) repo.
- `notifications` is the outbox. Rows are rendered and stored before sending,
  with a unique `dedupe_key` (event + key + channel + recipient), so a retry,
  a duplicate webhook or a reconciler pass never messages anyone twice. They
  are sent by `notify.send` with retries.
- WhatsApp goes through the Meta Cloud API directly (the owner's choice; no
  Twilio markup):
  - Delivery and read receipts arrive at `/api/webhooks/whatsapp`, checked
    with X-Hub-Signature-256 against the raw body.
  - Rows only ever move forward.
  - Without `WHATSAPP_*` settings, WhatsApp rows are marked `skipped`, and
    email still works.
- The customer's order confirmation moved into the outbox, using the same
  template and provider idempotency key.

### Analytics: first-party, no personal data
- `client/src/lib/track.ts` sends batched beacons (sendBeacon) to
  `/api/events`:
  - page views
  - **active** time per page and builder step: the clock runs only while the
    tab is visible and touched in the last 30 s
  - Web Vitals
  - errors and rage taps
  - once per visit: screen, connection, download speed measured on the page,
    UTM tags and referrer
- It's off on /admin and under Do Not Track or GPC. The server derives
  device/OS/browser buckets and drops the user agent. Paths lose ids and query
  strings.
- Server latency: every API request and job is counted into a fixed-bucket
  histogram per route template per minute (`request_metrics`). Histograms
  merge exactly, so p50/p90/p95/p99 over any range are read from the sums.
- Funnel:
  - builder steps from events (the step ids are in `FUNNEL_STEPS`), with
    breakdowns by device, OS, browser, source and first or returning visit
  - books → paid from the database
  - time-to-paid and a weekly trend
- Mixpanel parity: funnels, breakdowns, time to convert, conversion trend,
  drop-off. Free-form flows and session replay are left to Clarity or PostHog
  if the owner adds one.

### Storage seam
- Ops tables are read and written with Drizzle directly (`server/ops/db.ts`),
  not through IStorage. This is reporting SQL (percentiles, funnels) that an
  in-memory twin would fake badly, and pg-boss needs Postgres anyway.
- Without `DATABASE_URL`, the admin answers 503, beacons are dropped and
  notifications are sent directly.

## Consequences
- Migration `0008_ops` adds tables only. It changes no existing table.
- New optional env:
  - `ADMIN_IP_ALLOWLIST`, `STAFF_2FA_KEY`, `ALERT_EMAILS`
  - `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`,
    `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_API_VERSION`
  - `S3_BACKUP_*`
- The first admin visit after deploy asks the owner to set up an authenticator
  app.
- `/admin/orders` is now the console. The previous page is kept at
  `/admin/legacy-orders` while its bank-transfer tools are folded in.
- Not built yet (A4Missed board):
  - courier API sync
  - address confirmation by WhatsApp reply
  - the frozen approved-preview image
  - a printer portal and printer role
  - cost settings for profit per order
  - discount codes
