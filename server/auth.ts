/**
 * Authentication — better-auth instance + Express glue.
 *
 * What: Google sign-in, passwordless email magic links, and ANONYMOUS
 * sessions (so a visitor can build a whole book before ever signing
 * in). Sessions are rows in `sessions` referenced by an HttpOnly cookie.
 *
 * Why better-auth (docs/adr/004): it ships every flow we need — OAuth
 * dance, one-time token issue/consume, session cookies with secure
 * attributes, origin/CSRF checks and per-route rate limits — against
 * our own Postgres via the Drizzle adapter. The previously installed
 * passport/express-session stack was never wired and would have needed
 * all of that hand-built.
 *
 * Guest → member promotion: the anonymous plugin creates a throwaway
 * user (placeholder email, is_anonymous=true). When that browser later
 * signs in with Google or a magic link, `onLinkAccount` fires with BOTH
 * users; we move every project/upload the guest owns to the real user
 * (storage.reassignOwner) and the plugin then deletes the guest row.
 * If the guest's email matches an EXISTING member, better-auth links to
 * that member — so a returning customer who started a book on a new
 * phone gets it merged into their account, not a duplicate account.
 *
 * Dev mode without DATABASE_URL uses better-auth's memory adapter over
 * the same object MemStorage reads (server/mem-db.ts).
 */

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { memoryAdapter } from "better-auth/adapters/memory";
import { anonymous, magicLink } from "better-auth/plugins";
import { fromNodeHeaders } from "better-auth/node";
import type { IncomingHttpHeaders } from "http";
import { config } from "./config";
import { getDb } from "./db";
import { emailProvider } from "./email";
import { magicLinkEmail } from "./email/templates";
import { log } from "./logger";
import { memDb } from "./mem-db";
import { storage } from "./storage";
import * as schema from "@shared/schema";

const MAGIC_LINK_MINUTES = 15;

function makeDatabase() {
  if (config.databaseUrl) {
    // getDb() creates the pg Pool lazily, so importing it is free in no-DB mode
    return drizzleAdapter(getDb(), {
      provider: "pg",
      usePlural: true, // our tables are users/sessions/accounts/verifications
      schema,
    });
  }
  log.warn("[auth] no DATABASE_URL — sessions are in-memory and vanish on restart");
  return memoryAdapter(memDb);
}

export const auth = betterAuth({
  appName: "TrueKeep",
  baseURL: config.appUrl,
  basePath: "/api/auth",
  secret: config.auth.secret,
  database: makeDatabase(),
  trustedOrigins: [config.appUrl],

  // Only these origins may complete cookie-authenticated requests; the
  // Express layer adds the same check for our own /api routes.
  advanced: {
    database: { generateId: "uuid" }, // keep ids uniform with the rest of the schema
    useSecureCookies: config.isProd,
    defaultCookieAttributes: { sameSite: "lax", httpOnly: true, secure: config.isProd },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days — a book can take a while
    updateAge: 60 * 60 * 24, // refresh expiry at most once a day
    cookieCache: { enabled: true, maxAge: 5 * 60 }, // 5-min signed cache → far fewer session lookups
  },

  user: {
    additionalFields: {
      role: { type: "string", defaultValue: "customer", input: false },
      marketingOptOut: { type: "boolean", defaultValue: false, input: false },
      phone: { type: "string", required: false, input: false },
      lastSeenAt: { type: "date", required: false, input: false },
    },
  },

  account: {
    accountLinking: {
      enabled: true,
      // Google verifies emails; a magic link proves inbox control. Both
      // are safe to auto-link on matching email.
      trustedProviders: ["google", "magic-link"],
    },
  },

  socialProviders: config.auth.google
    ? {
        google: {
          clientId: config.auth.google.clientId,
          clientSecret: config.auth.google.clientSecret,
          // we only need identity; no calendar/drive scopes
          scope: ["openid", "email", "profile"],
        },
      }
    : {},

  rateLimit: {
    enabled: true,
    window: 60,
    max: 60,
    customRules: {
      "/sign-in/magic-link": { window: 60, max: 3 },
      "/sign-in/anonymous": { window: 60, max: 10 },
    },
  },

  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          // Bootstrap admins from env so the first deploy has one
          const email = String(user.email ?? "").toLowerCase();
          if (email && config.auth.adminEmails.includes(email)) {
            return { data: { ...user, role: "admin" } };
          }
        },
      },
    },
  },

  plugins: [
    magicLink({
      expiresIn: MAGIC_LINK_MINUTES * 60,
      storeToken: "hashed", // DB leak ≠ usable links
      sendMagicLink: async ({ email, url }) => {
        const tpl = magicLinkEmail({ url, expiresMinutes: MAGIC_LINK_MINUTES });
        await emailProvider.send({ to: email, ...tpl });
      },
    }),
    anonymous({
      emailDomainName: "guest.thetruekeeps.com",
      onLinkAccount: async ({ anonymousUser, newUser }) => {
        const moved = await storage.reassignOwner(anonymousUser.user.id, newUser.user.id);
        log.info({ from: anonymousUser.user.id, to: newUser.user.id, moved }, "[auth] guest promoted");
      },
    }),
  ],
});

export type AuthSession = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;
export type AuthUser = AuthSession["user"];

/** Resolve the session for a Node request (null when signed out). */
export async function getSessionFromHeaders(headers: IncomingHttpHeaders): Promise<AuthSession | null> {
  return auth.api.getSession({ headers: fromNodeHeaders(headers) });
}
