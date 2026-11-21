/**
 * POST /api/events — the browser's analytics beacons (client/src/lib/track.ts).
 *
 * Accepts a small batch: page views, active time per page and builder step,
 * Google's speed readings (Web Vitals), JavaScript errors, rage taps, plus
 * once per visit the visit's context (screen width, connection type and the
 * measured download speed, campaign tags, referring site).
 *
 * Guard rails, because anyone can call this:
 *  - strict schema (shared/ops.ts beaconSchema): fixed event names, bounded
 *    strings and numbers, at most 40 events, 16 KB body
 *  - per-IP rate limit
 *  - nothing personal is stored: the device/OS/browser buckets are derived
 *    here and the raw User-Agent is dropped; paths have query strings and
 *    ids stripped; error messages are truncated
 *  - signed-in visitors are linked by user id only, so the funnel can follow
 *    a visitor to their order
 * Always answers 204 quickly; a bad batch is dropped silently (a beacon has
 * nobody to show an error to).
 */

import express, { Router } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { analyticsEvents } from "@shared/schema";
import { beaconSchema, type BeaconEvent } from "@shared/ops";
import { optionalUser } from "../middleware/auth";
import { opsDb } from "../ops/db";
import { log } from "../logger";
import { parseUA } from "./ua";

export const collectRouter = Router();

const beaconLimiter = rateLimit({
  windowMs: 60_000,
  limit: 120,
  keyGenerator: (req) => `ip:${ipKeyGenerator(req.ip ?? "unknown")}`,
  standardHeaders: false,
  legacyHeaders: false,
  handler: (_req, res) => res.status(204).end(),
});

/** /orders/3f2a…-uuid → /orders/:id, and no query string. */
export function cleanPath(p: string): string {
  return (p.split("?")[0] || "/")
    .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "/:id")
    .replace(/\/TK-[A-Z0-9]{4,}/g, "/:order")
    .slice(0, 200);
}

function propsOf(e: BeaconEvent): Record<string, unknown> {
  switch (e.name) {
    case "page_view":
      return e.referrer ? { referrer: e.referrer.slice(0, 120) } : {};
    case "page_time":
      return { activeMs: e.activeMs, ...(e.step ? { step: e.step } : {}) };
    case "step":
      return { step: e.step };
    case "vital":
      return { ...e.vital };
    case "error":
      return { message: e.message.slice(0, 300), ...(e.source ? { source: cleanPath(e.source) } : {}) };
    case "rage":
      return { target: e.target };
  }
}

collectRouter.post(
  "/api/events",
  beaconLimiter,
  express.json({ limit: "16kb", type: () => true }),
  optionalUser,
  async (req, res) => {
    res.status(204).end();
    const parsed = beaconSchema.safeParse(req.body);
    const db = opsDb();
    if (!parsed.success || !db) return;
    const b = parsed.data;
    const ua = parseUA(String(req.headers["user-agent"] ?? ""), { screenW: b.context?.screenW, touch: b.context?.touch });
    const user = req.user && !(req.user as { isAnonymous?: boolean }).isAnonymous ? req.user.id : null;
    const base = { anonId: b.anonId, visitId: b.visitId, userId: user, ...ua };
    const rows: Array<typeof base & { name: string; path: string | null; props: Record<string, unknown> }> = b.events.map((e) => ({
      ...base,
      name: e.name,
      path: cleanPath(e.path),
      props: propsOf(e),
    }));
    // once per visit: screen, connection and measured speed, campaign tags
    if (b.context) rows.push({ ...base, name: "visit", path: null, props: b.context as Record<string, unknown> });
    try {
      await db.insert(analyticsEvents).values(rows);
    } catch (err) {
      log.warn({ err }, "[events] insert failed");
    }
  },
);
