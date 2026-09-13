/**
 * Request identity — attach the session user and gate routes on it.
 *
 * Three guards, from loosest to strictest:
 *  - optionalUser: resolves req.user if a session cookie is present;
 *    never rejects (public reads such as theme lists).
 *  - requireUser: 401 without a session. Guests (anonymous users) PASS —
 *    they are real user rows and own their drafts. The client obtains a
 *    guest session with signIn.anonymous() before its first write.
 *  - requireMember: like requireUser but rejects anonymous users with
 *    403 `{code:"SIGN_IN_REQUIRED"}` — used where a verified email is a
 *    hard requirement (placing an order, /books listing is fine either way).
 *  - requireAdmin: role === "admin".
 *
 * The session lookup is cached on the request so a route that stacks
 * guards never hits the DB twice.
 */

import type { NextFunction, Request, Response } from "express";
import { getSessionFromHeaders, type AuthUser } from "../auth";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Resolved session user (guest or member); set by the guards below. */
      user?: AuthUser;
      /** Marks that a session lookup already happened for this request. */
      sessionChecked?: boolean;
    }
  }
}

async function resolve(req: Request): Promise<AuthUser | undefined> {
  if (req.sessionChecked) return req.user;
  req.sessionChecked = true;
  if (!req.headers.cookie) return undefined;
  const session = await getSessionFromHeaders(req.headers);
  if (session) req.user = session.user;
  return req.user;
}

export async function optionalUser(req: Request, _res: Response, next: NextFunction) {
  try {
    await resolve(req);
    next();
  } catch (err) {
    next(err);
  }
}

export async function requireUser(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await resolve(req);
    if (!user) return res.status(401).json({ error: "Sign-in required", code: "UNAUTHENTICATED" });
    next();
  } catch (err) {
    next(err);
  }
}

export async function requireMember(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await resolve(req);
    if (!user) return res.status(401).json({ error: "Sign-in required", code: "UNAUTHENTICATED" });
    if ((user as { isAnonymous?: boolean | null }).isAnonymous) {
      return res.status(403).json({ error: "Please sign in to continue", code: "SIGN_IN_REQUIRED" });
    }
    next();
  } catch (err) {
    next(err);
  }
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await resolve(req);
    if (!user) return res.status(401).json({ error: "Sign-in required", code: "UNAUTHENTICATED" });
    if ((user as { role?: string }).role !== "admin") return res.status(403).json({ error: "Admin only" });
    next();
  } catch (err) {
    next(err);
  }
}

/** Typed accessor for handlers behind requireUser (never undefined there). */
export function currentUser(req: Request): AuthUser {
  if (!req.user) throw new Error("currentUser() called on a route without requireUser");
  return req.user;
}
