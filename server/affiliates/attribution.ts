/**
 * Affiliate attribution: who gets the credit for an order (docs/adr/022,
 * rules in shared/affiliates.ts).
 *
 * Approach, in the order things happen:
 *  1. refCapture: a page request with ?ref=CODE for an active affiliate sets
 *     the `tk_ref` cookie (code + time, 30 days, httpOnly) and counts one visit
 *     per visitor per day. A newer tap replaces an older one: last click wins.
 *     Done on the server, so it works on every page (prerendered ones too)
 *     and the browser can't forge the time.
 *  2. refAttach: the first API request that has both the cookie and a session
 *     (guests have anonymous sessions) writes the tap onto the account
 *     (users.affiliate_id / affiliate_at), so a link tapped on a phone still
 *     counts when they order on a laptop. A second cookie remembers that it was
 *     saved, so this is one write per tap, not one per request.
 *     carryAffiliate moves it when a guest signs in (server/auth.ts).
 *  3. orderAffiliate: at checkout, the newer of the cookie and the account's
 *     tap, if still within ATTRIBUTION_DAYS, for an affiliate that is still
 *     active, and not the buyer themselves (isSelfReferral). The result is
 *     written onto the order; nothing later changes it except an owner by hand.
 *
 * Without a database (local memory storage) all of this quietly does nothing.
 */

import { randomBytes } from "crypto";
import type { NextFunction, Request, Response } from "express";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { affiliates, affiliateVisits, users, type Affiliate } from "@shared/schema";
import { AFFILIATE_CODE_RE, ATTRIBUTION_DAYS, REF_COOKIE, isSelfReferral, normalizeRef, parseRefCookie, refCookieValue, withinWindow } from "@shared/affiliates";
import { opsDb } from "../ops/db";
import { resolve } from "../middleware/auth";
import { config } from "../config";
import { log } from "../logger";

const VISITOR_COOKIE = "tk_vid";
const SAVED_COOKIE = "tk_ref_saved";
const DAY_MS = 86_400_000;

/** Link previews and crawlers fetch shared links too; they aren't visitors. */
const BOT_RE = /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegram|preview|curl|wget|headless|python|axios|node-fetch/i;

/* ── cookies ───────────────────────────────────────────────────── */

/** One cookie from the request header (no cookie-parser in this app). */
export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

const cookieOpts = (maxAgeMs: number) => ({ httpOnly: true, sameSite: "lax" as const, secure: config.isProd, path: "/", maxAge: maxAgeMs });

/* ── affiliate lookup (small cache: every ?ref page view asks) ─── */

const cache = new Map<string, { at: number; row: Affiliate | null }>();
const CACHE_MS = 60_000;

/** The affiliate with this link name, cached for a minute; null when unknown. */
export async function affiliateByCode(code: string): Promise<Affiliate | null> {
  const hit = cache.get(code);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.row;
  const db = opsDb();
  if (!db) return null;
  const [row] = await db.select().from(affiliates).where(eq(affiliates.code, code)).limit(1);
  cache.set(code, { at: Date.now(), row: row ?? null });
  if (cache.size > 500) cache.delete(cache.keys().next().value!);
  return row ?? null;
}

/** Forget cached rows after an admin edit, so a pause applies at once. */
export const forgetAffiliate = (code?: string) => (code ? cache.delete(code) : cache.clear());

/* ── 1. the tap ────────────────────────────────────────────────── */

/** "2026-11-26" in Pakistan time, for the one-visit-per-day row. */
const pktDay = (d: Date) => new Date(d.getTime() + 5 * 3_600_000).toISOString().slice(0, 10);

/**
 * Page GETs carrying ?ref=CODE. Never blocks or fails the page: the cookie is
 * set before the page is served, and the visit row is written in the background.
 */
export function refCapture(req: Request, res: Response, next: NextFunction) {
  const raw = req.query.ref;
  if (req.method !== "GET" || typeof raw !== "string" || req.path.startsWith("/api/") || !opsDb()) return next();
  const code = normalizeRef(raw);
  if (!AFFILIATE_CODE_RE.test(code)) return next();
  affiliateByCode(code)
    .then((a) => {
      if (!a?.active) return;
      const now = new Date();
      res.cookie(REF_COOKIE, refCookieValue(code, now), cookieOpts(ATTRIBUTION_DAYS * DAY_MS));
      if (BOT_RE.test(req.headers["user-agent"] ?? "")) return;
      let vid = readCookie(req, VISITOR_COOKIE);
      if (!vid || !/^[A-Za-z0-9_-]{16,40}$/.test(vid)) {
        vid = randomBytes(16).toString("base64url");
        res.cookie(VISITOR_COOKIE, vid, cookieOpts(365 * DAY_MS));
      }
      void opsDb()!
        .insert(affiliateVisits)
        .values({ affiliateId: a.id, visitorId: vid, day: pktDay(now) })
        .onConflictDoNothing()
        .catch((err) => log.warn({ err }, "[affiliates] visit not recorded"));
    })
    .catch((err) => log.warn({ err }, "[affiliates] ref lookup failed"))
    .finally(() => next());
}

/* ── 2. onto the account ───────────────────────────────────────── */

/** API requests: save a remembered tap onto the signed-in (or guest) account, once. */
export function refAttach(req: Request, res: Response, next: NextFunction) {
  const value = readCookie(req, REF_COOKIE);
  if (!value || readCookie(req, SAVED_COOKIE) === value || !opsDb()) return next();
  const tap = parseRefCookie(value);
  if (!tap) return next();
  resolve(req)
    .then(async (user) => {
      if (!user) return;
      const a = await affiliateByCode(tap.code);
      if (!a?.active) return;
      // only a newer tap replaces the one already saved (last click wins)
      await opsDb()!
        .update(users)
        .set({ affiliateId: a.id, affiliateAt: tap.at })
        .where(and(eq(users.id, user.id), or(isNull(users.affiliateAt), lt(users.affiliateAt, tap.at))));
      res.cookie(SAVED_COOKIE, value, cookieOpts(ATTRIBUTION_DAYS * DAY_MS));
    })
    .catch((err) => log.warn({ err }, "[affiliates] tap not saved to account"))
    .finally(() => next());
}

/** A guest signed in: keep their tap on the real account if it is newer. */
export async function carryAffiliate(fromUserId: string, toUserId: string): Promise<void> {
  const db = opsDb();
  if (!db) return;
  await db.execute(sql`
    UPDATE users u SET affiliate_id = g.affiliate_id, affiliate_at = g.affiliate_at
    FROM users g
    WHERE g.id = ${fromUserId} AND u.id = ${toUserId} AND g.affiliate_id IS NOT NULL
      AND (u.affiliate_at IS NULL OR u.affiliate_at < g.affiliate_at)`);
}

/* ── 3. at checkout ────────────────────────────────────────────── */

export interface OrderCredit {
  affiliateId: string;
  source: "link";
}

/**
 * The affiliate to credit with an order about to be placed, or null. Reasons
 * for "no" (expired, paused, self-referral) are logged, never shown to the buyer.
 */
export async function orderAffiliate(req: Request, buyer: { id: string; email: string; phone: string | null }): Promise<OrderCredit | null> {
  const db = opsDb();
  if (!db) return null;
  const now = new Date();
  const candidates: Array<{ at: Date; find: () => Promise<Affiliate | null> }> = [];
  const tap = parseRefCookie(readCookie(req, REF_COOKIE));
  if (tap) candidates.push({ at: tap.at, find: () => affiliateByCode(tap.code) });
  const [u] = await db.select({ id: users.affiliateId, at: users.affiliateAt }).from(users).where(eq(users.id, buyer.id)).limit(1);
  if (u?.id && u.at) {
    const id = u.id;
    candidates.push({
      at: u.at,
      find: async () => (await db.select().from(affiliates).where(eq(affiliates.id, id)).limit(1))[0] ?? null,
    });
  }
  const best = candidates.filter((c) => withinWindow(c.at, now)).sort((x, y) => y.at.getTime() - x.at.getTime())[0];
  if (!best) return null;
  const a = await best.find();
  if (!a || !a.active) return null;
  if (isSelfReferral(a, { userId: buyer.id, email: buyer.email, phone: buyer.phone })) {
    log.info({ affiliate: a.code, userId: buyer.id }, "[affiliates] own link, not credited");
    return null;
  }
  return { affiliateId: a.id, source: "link" };
}
