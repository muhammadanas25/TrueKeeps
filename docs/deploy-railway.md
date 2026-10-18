# Deploying TrueKeep to Railway

**What / why:** production runs as one long-lived Node process (`npm run build`
→ `npm start`) that serves the API, the built React client, and the in-process
image-derivative jobs (sharp). That rules out serverless hosts; Railway runs
the process 24/7, reads `railway.json` for build/start/healthcheck, and injects
`PORT` (which `server/index.ts` already honors).

**Architecture in prod:**

- App process → Railway service (this repo)
- Database → Postgres via `DATABASE_URL` (Railway Postgres plugin, or Neon —
  use Neon's *pooled* connection string)
- Photo bytes → Cloudflare R2 via `S3_*` vars. **Required in prod**: Railway's
  filesystem is ephemeral, so the local-disk fallback loses every upload on
  each deploy. The server logs a loud warning if prod boots without `S3_*`.

## One-time setup

1. **Push the repo to GitHub** (Railway deploys from GitHub; the CLI works too).

2. **Create the Railway project**: railway.com → New Project → Deploy from
   GitHub repo → pick this repo. It detects Node and uses `railway.json`.

3. **Add Postgres**: in the project, `+ New` → Database → PostgreSQL.
   In the app service → Variables, add a reference:
   `DATABASE_URL = ${{Postgres.DATABASE_URL}}`
   (Or paste a Neon pooled URL instead.)

4. **Create the R2 bucket** (Cloudflare dashboard → R2):
   - Bucket: `truekeep-media`
   - R2 API token with Object Read & Write on that bucket
   - Enable public access for the bucket (r2.dev domain or a custom
     `media.<yourdomain>` domain) — that's `S3_PUBLIC_BASE_URL`
   - CORS on the bucket must allow `PUT` from your app origin (the client
     uploads directly with presigned PUTs):
     ```json
     [{ "AllowedOrigins": ["https://<your-app>.up.railway.app"],
        "AllowedMethods": ["PUT", "GET"],
        "AllowedHeaders": ["content-type"] }]
     ```

5. **Set service variables** (app service → Variables):

   | Variable | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `DATABASE_URL` | reference to Railway Postgres, or Neon pooled URL |
   | `S3_ENDPOINT` | `https://<account-id>.r2.cloudflarestorage.com` |
   | `S3_REGION` | `auto` |
   | `S3_BUCKET` | `truekeep-media` |
   | `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | from the R2 API token |
   | `S3_PUBLIC_BASE_URL` | the bucket's public domain |
   | `APP_URL` | `https://thetruekeeps.com` — public origin. Drives OAuth callbacks, magic-link URLs, CORS and the CSRF origin check. **Required.** (`FRONTEND_URL` still works as an alias.) |
   | `BETTER_AUTH_SECRET` | `openssl rand -base64 48` — signs session cookies. **Required.** Rotating it signs everyone out. |
   | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | from Google Cloud → APIs & Services → Credentials (OAuth client, type "Web application"). Authorised redirect URI: `https://thetruekeeps.com/api/auth/callback/google`. Omit both to hide the Google button. |
   | `ADMIN_EMAILS` | comma-separated; these get `role=admin` on first sign-in |
   | `RESEND_API_KEY` / `EMAIL_FROM` | transactional email (magic links). Without a key, emails are only logged — sign-in by email will NOT work in prod. |
   | `API_KEY_SAFE_PAY` / `SAFE_PAY_SECRET_KEY` / `SAFE_PAY_WEBHOOK_SECRET` | Safepay public key, secret key, and the endpoint's shared secret (Developer → Endpoints → View shared secret). All three or checkout is disabled. |
   | `SAFE_PAY_API_URL` | `https://sandbox.api.getsafepay.com` while testing (orders are marked TEST and can't be sent to print); `https://api.getsafepay.com` when live. |

   Don't set `PORT` — Railway injects it.

6. **Migrations run before every deploy** (`railway.json` →
   `preDeployCommand: npm run db:migrate:prod`, which runs the bundled `dist/migrate.js`). The first deploy after Phase 2A
   applies `migrations/0000_baseline.sql` (idempotent on an existing DB) and
   `0001_phase2a_auth_ownership.sql`, which also backfills pre-auth rows under
   a "legacy" user. To run by hand instead:
   ```
   DATABASE_URL=<prod-url> npm run db:migrate
   ```
   Never use `db:push` against production — it diffs interactively and can
   drop columns (docs/adr/007).

7. **Deploy** happens automatically on push to `main`. The healthcheck
   (`/api/health`) gates the cutover, so a failed boot never replaces the
   running version.

## Verifying a deploy

- `https://<app>/api/health` → `{"status":"ok"}`
- `curl -I https://<app>/` shows `strict-transport-security`, `x-content-type-options: nosniff`
  and NO `x-powered-by`.
- `curl -s https://<app>/api/projects` → `401` (was an open list before Phase 2A).
- `curl -sI -H "Origin: https://evil.example" https://<app>/api/projects | grep -i access-control`
  → no `access-control-allow-origin` header.
- Sign in with Google and with a magic link; both must land back on the site
  signed in. Check Resend's log for the magic-link email.
- Boot logs must show `[media] using S3-compatible store` — if you see the
  local-disk WARNING, the `S3_*` vars are missing/incomplete.
- Run the wizard end-to-end: quiz → upload a photo → generate → preview.
  The photo URL should point at `S3_PUBLIC_BASE_URL`, not `/media/…`.

## Payments (Safepay) checklist

1. Safepay dashboard → Developer → Endpoints → add
   `https://thetruekeeps.com/api/payments/webhook/safepay`, subscribe to
   `payment.succeeded` and `payment.failed`, copy the shared secret into
   `SAFE_PAY_WEBHOOK_SECRET`.
2. Sandbox test: order a book on the site, pay with test card
   `4456 5300 0000 1005` (any future expiry, CVC 111); the order page should
   turn "confirmed" within seconds and `/admin/orders` shows it tagged TEST.
3. Going live: swap the three keys for live ones, set
   `SAFE_PAY_API_URL=https://api.getsafepay.com`, place one real low-value
   order and refund it from the Safepay dashboard. If the live hosted page
   404s, set `SAFE_PAY_CHECKOUT_URL` to the URL Safepay gives you
   (docs/adr/005).

## Notes / future

- Jobs (sharp derivatives) run in-process, so keep the service at exactly
  1 replica until the queue moves to real pg-boss (docs/adr/003).
- Custom domain: service → Settings → Networking → Custom Domain, then update
  `APP_URL`, the Google OAuth redirect URI and the R2 CORS origin to match.
- Put Cloudflare's proxy (orange cloud) in front of the Railway domain: free
  WAF/DDoS protection, and the R2 bucket is on the same account anyway.
- Email deliverability: add Resend's SPF/DKIM/DMARC records for
  thetruekeeps.com before enabling magic links for real users.
