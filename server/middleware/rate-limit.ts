/**
 * Rate limits — cheap abuse ceilings on the endpoints that create rows
 * or cost money (uploads → R2 storage, emails → provider quota).
 *
 * Keyed by user id when a session exists (so one abusive account can't
 * hide behind a shared office/NAT IP) and by IP otherwise. Limits are
 * generous for real use: a person uploading a 200-photo book presigns
 * 200 times in a few minutes and never gets near the ceiling.
 *
 * In-memory store: fine at one replica (docs/deploy-railway.md keeps
 * us at one until pg-boss lands); move to a shared store when scaling out.
 */

import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { Request } from "express";

/** ipKeyGenerator collapses IPv6 to its /56 so a user can't rotate
 *  through a whole prefix to dodge the limit. */
function keyByUserOrIp(req: Request): string {
  return req.user?.id ? `u:${req.user.id}` : `ip:${ipKeyGenerator(req.ip ?? "unknown")}`;
}

const common = {
  standardHeaders: "draft-7" as const,
  legacyHeaders: false,
  keyGenerator: keyByUserOrIp,
  message: { error: "Too many requests, slow down a little", code: "RATE_LIMITED" },
};

/** Project creation — bots spinning up guest drafts. */
export const createProjectLimiter = rateLimit({ ...common, windowMs: 10 * 60 * 1000, limit: 30 });

/** Presign + complete — each presign reserves R2 storage. */
export const uploadLimiter = rateLimit({ ...common, windowMs: 10 * 60 * 1000, limit: 600 });

/** Document autosave — client debounces, but cap runaway loops. */
export const saveLimiter = rateLimit({ ...common, windowMs: 60 * 1000, limit: 120 });

/** Generic write ceiling for everything else under /api. */
export const writeLimiter = rateLimit({ ...common, windowMs: 60 * 1000, limit: 300 });
