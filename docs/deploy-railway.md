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
   | `FRONTEND_URL` | the app's public URL (CORS allowlist) |

   Don't set `PORT` — Railway injects it.

6. **Create the tables**: from your machine, with `DATABASE_URL` pointing at
   the prod database:
   ```
   DATABASE_URL=<prod-url> npm run db:push
   ```
   (Neon URLs work directly; for Railway Postgres use the *public* connection
   string shown on the Postgres service.)

7. **Deploy** happens automatically on push to `main`. The healthcheck
   (`/api/health`) gates the cutover, so a failed boot never replaces the
   running version.

## Verifying a deploy

- `https://<app>/api/health` → `{"status":"ok"}`
- Boot logs must show `[media] using S3-compatible store` — if you see the
  local-disk WARNING, the `S3_*` vars are missing/incomplete.
- Run the wizard end-to-end: quiz → upload a photo → generate → preview.
  The photo URL should point at `S3_PUBLIC_BASE_URL`, not `/media/…`.

## Notes / future

- Jobs (sharp derivatives) run in-process, so keep the service at exactly
  1 replica until the queue moves to real pg-boss (docs/adr/003).
- Custom domain: service → Settings → Networking → Custom Domain, then update
  `FRONTEND_URL` and the R2 CORS origin to match.
