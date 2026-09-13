# ADR 004 — Accounts via better-auth: Google + magic link + anonymous guests, owner-checked API

**Status:** accepted · 2026-09-13

## Context

The site was live with no authentication: every project, page, photo and
upload was readable and deletable by anyone who guessed an id, `POST
/api/themes` accepted priced rows from the public, and CORS reflected any
origin with credentials enabled. The product needs sign-in (Google, and a
route for people without Google), books that belong to a user, and a
checkout that can trust an email — while keeping the "build first, sign
in later" flow that the quiz-first builder is designed around.

`passport`, `express-session` and `connect-pg-simple` were installed but
never wired; using them would still have meant hand-building OAuth, one-
time tokens, session storage, CSRF checks and rate limits.

## Decision

- **better-auth** (`server/auth.ts`) with the Drizzle adapter over our own
  Postgres (`users`, `sessions`, `accounts`, `verifications` in
  `shared/schema.ts`). Plugins: `google` social provider, `magicLink`
  (15-minute, hashed at rest, sent through `server/email`), and
  `anonymous`.
- **Guests are users.** A visitor gets an anonymous user row + session on
  the first server write (the client mints it before its first POST —
  `client/src/lib/queryClient.ts`). `projects.user_id` is therefore NOT
  NULL and one ownership check (`server/middleware/ownership.ts`) covers
  guests and members alike. Rows resolve to an owner via
  project → user; pages and placed photos walk up to the project.
- **Promotion, not replacement.** When a guest signs in, better-auth's
  `onLinkAccount` hook calls `storage.reassignOwner(guest, member)`
  (projects + uploads, one transaction, claim tokens cleared) and the
  guest row is deleted. If the email already belongs to a member, the
  drafts merge into that account.
- **Claim tokens** for lost cookies: project creation returns a one-time
  token (sha256 stored). A fresh guest session may `POST /claim` it —
  but only while the project is still guest-owned. A member's book can
  never be pulled out of the account by a leaked localStorage.
- **Sessions**: 30-day DB-backed sessions, HttpOnly/SameSite=Lax/Secure
  cookies, 5-minute signed cookie cache to keep per-request DB lookups
  off the hot path. Because of that cache `/api/me` reads the user row
  fresh (editable profile fields must not lag).
- **Hardening shipped with it**: helmet headers (CSP report-only first),
  `trust proxy`, an Origin/Sec-Fetch-Site check on every mutating
  `/api` request (`server/middleware/security.ts`), fail-closed CORS,
  per-user/IP rate limits on creation and upload endpoints, zod on every
  body, `express.json` down to 1 MB, structured redacted logging (pino),
  validated env (`server/config.ts`) that refuses to boot production
  without `APP_URL`, `BETTER_AUTH_SECRET`, `DATABASE_URL`.
- **Client**: `features/auth/` (client, `useSession`, `SignInSheet`,
  `AccountMenu`), `/books` and `/account` pages. The builder gets a
  dismissible "save this book" prompt once after reveal and a hard
  sign-in gate on the order screen; both are mounted at the shell
  (`features/builder/index.tsx`) rather than inside the screens.

## Consequences

- Dev without `DATABASE_URL` uses better-auth's memory adapter over the
  same object `MemStorage` reads (`server/mem-db.ts`); sessions vanish on
  restart, which is fine for UI work.
- The `users` table is better-auth-shaped: `email` is NOT NULL (guests get
  a placeholder under `guest.thetruekeeps.com`), password is gone.
- Anonymous rows accumulate; a periodic purge of guest users with no
  projects/orders older than 30 days is scheduled for Phase 2C (needs the
  durable queue).
- Google sign-in requires the OAuth consent screen, which requires public
  privacy/terms pages — tracked as a launch prerequisite.
