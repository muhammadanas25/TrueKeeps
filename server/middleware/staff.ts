/**
 * The staff gate — what stands between the internet and the admin.
 *
 * Every /api/admin/* request (mounted once in server/routes.ts, so a route
 * added later is covered without anyone remembering to) passes these checks
 * in order, and the first that fails answers:
 *
 *   1. signed in at all                        → else 404 (see below)
 *   2. the role, read FRESH from the database  → else 404
 *      (the session cookie caches the user for 5 minutes; a removed staff
 *      member must lose access now, not in 5 minutes)
 *   3. the IP allow-list, if ADMIN_IP_ALLOWLIST is set → else 404 + audit
 *   4. the second sign-in step passed for THIS session and not expired
 *      (12 hours)                              → else 403 STEP_UP_REQUIRED,
 *      which the admin UI turns into the code prompt
 *   5. the route's own role list (Owner-only pages) → else 403 + audit
 *
 * Why 404 for non-staff: to a customer or a stranger probing URLs, the admin
 * API is indistinguishable from a path that doesn't exist. Only people who
 * already are staff learn that a step is missing.
 *
 * `isElevatedStaff(req)` answers the same question for the few customer
 * routes that let staff see any customer's book, photos or order (/media,
 * project and order loaders): without a passed step-up, staff are just
 * customers there too.
 */

import type { NextFunction, Request, Response } from "express";
import { and, eq, gt } from "drizzle-orm";
import { staffElevations } from "@shared/schema";
import { STAFF_ROLES, isStaffRole, type StaffRole } from "@shared/ops";
import { resolve } from "./auth";
import { storage } from "../storage";
import { config } from "../config";
import { opsDb } from "../ops/db";
import { audit } from "../ops/audit";

export interface StaffContext {
  userId: string;
  email: string;
  name: string;
  role: StaffRole;
  sessionId: string;
  /** null until the second step is passed for this session */
  elevatedUntil: Date | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** set by the staff gate */
      staff?: StaffContext;
      /** memo: staff identity looked up for this request (null = not staff) */
      staffLookup?: StaffContext | null;
    }
  }
}

/** True when `ip` matches an allow-list entry (exact address or prefix ending in . or :). */
export function ipAllowed(ip: string | undefined, list: readonly string[]): boolean {
  if (!list.length) return true;
  if (!ip) return false;
  const bare = ip.replace(/^::ffff:/, "");
  return list.some((entry) => (/[.:]$/.test(entry) ? bare.startsWith(entry) : bare === entry));
}

/** Who this staff member is, with their elevation for this session; null if not staff. */
export async function lookupStaff(req: Request): Promise<StaffContext | null> {
  if (req.staffLookup !== undefined) return req.staffLookup;
  req.staffLookup = null;
  const user = await resolve(req);
  if (!user || !req.authSessionId) return null;
  const fresh = await storage.getUser(user.id);
  if (!fresh || !isStaffRole(fresh.role)) return null;

  let elevatedUntil: Date | null = null;
  const db = opsDb();
  if (db) {
    const [row] = await db
      .select({ expiresAt: staffElevations.expiresAt })
      .from(staffElevations)
      .where(and(eq(staffElevations.sessionId, req.authSessionId), eq(staffElevations.userId, fresh.id), gt(staffElevations.expiresAt, new Date())))
      .limit(1);
    elevatedUntil = row?.expiresAt ?? null;
  }
  req.staffLookup = {
    userId: fresh.id,
    email: fresh.email,
    name: fresh.name,
    role: fresh.role as StaffRole,
    sessionId: req.authSessionId,
    elevatedUntil,
  };
  return req.staffLookup;
}

/** Staff with the second step passed for this session (used by customer routes that admit staff). */
export async function isElevatedStaff(req: Request): Promise<boolean> {
  const s = await lookupStaff(req);
  return Boolean(s?.elevatedUntil) && ipAllowed(req.ip, config.ops.ipAllowlist);
}

const notFound = (res: Response) => res.status(404).json({ error: "Not found" });

/**
 * Gate a route to staff. `roles` narrows it (Owner-only pages);
 * `stepUp: false` is only for the step-up endpoints themselves.
 */
export function requireStaff(roles: readonly StaffRole[] = STAFF_ROLES, opts: { stepUp?: boolean } = {}) {
  const needStepUp = opts.stepUp ?? true;
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!opsDb()) return res.status(503).json({ error: "The admin console needs a database (DATABASE_URL)", code: "NO_DATABASE" });
      const staff = await lookupStaff(req);
      if (!staff) return notFound(res);
      if (!ipAllowed(req.ip, config.ops.ipAllowlist)) {
        void audit(req, "staff.ip_blocked", null, { path: req.path });
        return notFound(res);
      }
      req.staff = staff;
      if (needStepUp && !staff.elevatedUntil) {
        return res.status(403).json({ error: "Enter the code from your authenticator app", code: "STEP_UP_REQUIRED" });
      }
      if (!roles.includes(staff.role)) {
        void audit(req, "staff.forbidden", null, { path: req.path, method: req.method });
        return res.status(403).json({ error: "Only the owner can do this", code: "FORBIDDEN_ROLE" });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Owner-only check inside a handler (e.g. hiding money totals from Ops). */
export const isOwner = (req: Request) => req.staff?.role === "admin";
