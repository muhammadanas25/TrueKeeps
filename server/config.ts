/**
 * Runtime configuration — every environment variable the server reads,
 * validated once at boot.
 *
 * Why: the env surface grew past what ad-hoc `process.env.X` reads can
 * keep honest (auth secrets, OAuth, payments, email). A typo in Railway
 * should fail the deploy at startup with a clear message, not surface
 * as a broken login an hour later. Import `config` instead of touching
 * `process.env` anywhere else.
 *
 * Rules:
 *  - dev (NODE_ENV !== production) loads `.env` via dotenv and tolerates
 *    missing optional integrations (auth falls back to a dev secret,
 *    email logs to the console, Google is simply not offered)
 *  - production REQUIRES the secrets that guard user data and refuses
 *    to boot without them
 */

import { z } from "zod";
import { config as loadDotenv } from "dotenv";

if (process.env.NODE_ENV !== "production") {
  // dotenv is a dev convenience only; Railway injects real env vars
  loadDotenv({ quiet: true });
}

const isProd = process.env.NODE_ENV === "production";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5002),

  /** Public origin of the app, e.g. https://thetruekeeps.com — used for
   *  OAuth callbacks, magic-link URLs, CORS and cookie security. */
  APP_URL: z.string().url().optional(),
  /** Legacy alias for APP_URL (kept so existing Railway config works). */
  FRONTEND_URL: z.string().url().optional(),

  DATABASE_URL: z.string().optional(),

  /** ≥32 random bytes (openssl rand -base64 48). Signs session cookies. */
  BETTER_AUTH_SECRET: z.string().min(32).optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  /** comma-separated emails that get role=admin on first sign-in */
  ADMIN_EMAILS: z.string().default(""),

  /** Safepay (Phase 2B). Names match the existing .env / Railway vars.
   *  API key = "sec_…" from Developer → API; secret key = the v1 secret;
   *  webhook secret = Developer → Endpoints → "View shared secret". */
  API_KEY_SAFE_PAY: z.string().optional(),
  SAFE_PAY_SECRET_KEY: z.string().optional(),
  SAFE_PAY_WEBHOOK_SECRET: z.string().optional(),
  /** https://sandbox.api.getsafepay.com (sandbox) or https://api.getsafepay.com (live) */
  SAFE_PAY_API_URL: z.string().url().default("https://sandbox.api.getsafepay.com"),
  /** Hosted checkout base. Default: <API>/embedded/ in sandbox,
   *  https://getsafepay.com/embedded/ live — override if Safepay says otherwise. */
  SAFE_PAY_CHECKOUT_URL: z.string().url().optional(),

  /** Email delivery (Resend when a key is set; console otherwise) */
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("TrueKeeps <hello@thetruekeeps.com>"),

  /** Media store (see server/media.ts) */
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),

  /** Second copy of every print PDF (optional; any S3-compatible bucket) */
  S3_BACKUP_ENDPOINT: z.string().optional(),
  S3_BACKUP_REGION: z.string().optional(),
  S3_BACKUP_BUCKET: z.string().optional(),
  S3_BACKUP_ACCESS_KEY_ID: z.string().optional(),
  S3_BACKUP_SECRET_ACCESS_KEY: z.string().optional(),

  /** Ops console (docs/adr/018) */
  /** comma-separated IPs or prefixes ("203.0.113.", "2001:db8:") allowed into /api/admin; empty = anywhere */
  ADMIN_IP_ALLOWLIST: z.string().default(""),
  /** key for staff authenticator secrets; defaults to one derived from BETTER_AUTH_SECRET */
  STAFF_2FA_KEY: z.string().min(32).optional(),
  /** comma-separated emails for staff alerts when a rule lists none (falls back to every Owner) */
  ALERT_EMAILS: z.string().default(""),

  /** WhatsApp Cloud API (Meta). All four set → WhatsApp on; otherwise it's skipped and logged. */
  WHATSAPP_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  /** App secret: verifies X-Hub-Signature-256 on status webhooks */
  WHATSAPP_APP_SECRET: z.string().optional(),
  /** any string you also type into Meta's webhook settings */
  WHATSAPP_VERIFY_TOKEN: z.string().optional(),
  WHATSAPP_API_VERSION: z.string().default("v21.0"),

  /** pino level; `silent` in tests */
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default(isProd ? "info" : "debug"),
});

const parsed = envSchema.safeParse(process.env);
if (parsed.success && !/(^|\.)getsafepay\.com$/.test(new URL(parsed.data.SAFE_PAY_API_URL).hostname)) {
  console.warn(`[config] SAFE_PAY_API_URL host is not getsafepay.com — payments will fail (${new URL(parsed.data.SAFE_PAY_API_URL).hostname})`);
}
if (!parsed.success) {
  console.error("[config] invalid environment:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}
const env = parsed.data;

/** Resolved public origin (no trailing slash). */
const appUrl = (env.APP_URL ?? env.FRONTEND_URL ?? `http://localhost:${env.PORT}`).replace(/\/$/, "");

if (isProd) {
  const missing: string[] = [];
  if (!env.DATABASE_URL) missing.push("DATABASE_URL");
  if (!env.BETTER_AUTH_SECRET) missing.push("BETTER_AUTH_SECRET");
  if (!env.APP_URL && !env.FRONTEND_URL) missing.push("APP_URL");
  if (missing.length) {
    console.error(`[config] production boot refused — missing required env: ${missing.join(", ")}`);
    process.exit(1);
  }
}

export const config = {
  isProd,
  nodeEnv: env.NODE_ENV,
  port: env.PORT,
  appUrl,
  databaseUrl: env.DATABASE_URL,
  auth: {
    // dev-only fallback so `npm run dev` works with an empty .env;
    // production refuses to boot without a real secret (above)
    secret: env.BETTER_AUTH_SECRET ?? "dev-only-secret-change-me-0123456789abcdef",
    google:
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }
        : null,
    adminEmails: env.ADMIN_EMAILS.split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  },
  safepay:
    env.API_KEY_SAFE_PAY && env.SAFE_PAY_SECRET_KEY && env.SAFE_PAY_WEBHOOK_SECRET
      ? {
          apiKey: env.API_KEY_SAFE_PAY,
          v1Secret: env.SAFE_PAY_SECRET_KEY,
          webhookSecret: env.SAFE_PAY_WEBHOOK_SECRET,
          baseUrl: env.SAFE_PAY_API_URL.replace(/\/$/, ""),
          // the SDK wants an environment name, not a URL
          environment: /sandbox/.test(env.SAFE_PAY_API_URL) ? ("sandbox" as const) : ("production" as const),
          checkoutBase: (
            env.SAFE_PAY_CHECKOUT_URL ??
            (/sandbox/.test(env.SAFE_PAY_API_URL)
              ? env.SAFE_PAY_API_URL.replace(/\/$/, "") + "/embedded/"
              : "https://getsafepay.com/embedded/")
          ),
        }
      : null,
  email: {
    resendApiKey: env.RESEND_API_KEY ?? null,
    from: env.EMAIL_FROM,
  },
  s3: {
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    bucket: env.S3_BUCKET,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  },
  backupS3:
    env.S3_BACKUP_BUCKET && env.S3_BACKUP_ACCESS_KEY_ID && env.S3_BACKUP_SECRET_ACCESS_KEY
      ? {
          endpoint: env.S3_BACKUP_ENDPOINT,
          region: env.S3_BACKUP_REGION,
          bucket: env.S3_BACKUP_BUCKET,
          accessKeyId: env.S3_BACKUP_ACCESS_KEY_ID,
          secretAccessKey: env.S3_BACKUP_SECRET_ACCESS_KEY,
        }
      : null,
  ops: {
    ipAllowlist: env.ADMIN_IP_ALLOWLIST.split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    staffKey: env.STAFF_2FA_KEY ?? null,
    alertEmails: env.ALERT_EMAILS.split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  },
  whatsapp:
    env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID
      ? {
          token: env.WHATSAPP_TOKEN,
          phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
          appSecret: env.WHATSAPP_APP_SECRET ?? null,
          verifyToken: env.WHATSAPP_VERIFY_TOKEN ?? null,
          apiVersion: env.WHATSAPP_API_VERSION,
        }
      : null,
  logLevel: env.LOG_LEVEL,
} as const;

export type AppConfig = typeof config;
