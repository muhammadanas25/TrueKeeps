/**
 * /api/me — the signed-in user's own profile and account settings.
 *
 * Sign-in / sign-out / OAuth callbacks are handled by better-auth under
 * /api/auth/*; this module only covers what better-auth doesn't know
 * about (marketing preference, phone) plus a convenience read the
 * client polls on boot. `GET /api/me` answers 200 `{user:null}` when
 * signed out instead of 401 so the app shell doesn't treat "guest" as
 * an error.
 */

import { Router } from "express";
import { z } from "zod";
import { config } from "../config";
import { storage } from "../storage";
import { optionalUser, requireMember, currentUser } from "../middleware/auth";
import { asyncHandler, parse } from "./helpers";

export const meRouter = Router();

/** Public projection of a user row — never leak internal columns. */
export function publicUser(u: Record<string, unknown>) {
  return {
    id: u.id,
    email: u.isAnonymous ? null : u.email,
    name: u.name ?? "",
    image: u.image ?? null,
    isAnonymous: Boolean(u.isAnonymous),
    role: u.role ?? "customer",
    marketingOptOut: Boolean(u.marketingOptOut),
    phone: u.phone ?? null,
  };
}

meRouter.get(
  "/api/me",
  optionalUser,
  asyncHandler(async (req, res) => {
    // which sign-in buttons the client should render
    const providers = { google: Boolean(config.auth.google) };
    if (!req.user) return res.json({ user: null, providers });
    // The session middleware may serve the user from better-auth's signed
    // cookie cache (up to 5 min old). Profile fields are editable, so
    // read the row itself — this endpoint is what the UI trusts.
    const fresh = await storage.getUser(req.user.id);
    if (!fresh) return res.json({ user: null, providers });
    // cheap "last seen" heartbeat — used by the reminder job to avoid
    // nagging someone who was here an hour ago
    void storage.updateUser(fresh.id, { lastSeenAt: new Date() }).catch(() => undefined);
    res.json({ user: publicUser(fresh as unknown as Record<string, unknown>), providers });
  }),
);

const updateMeSchema = z.object({
  name: z.string().trim().max(80).optional(),
  marketingOptOut: z.boolean().optional(),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ()-]{7,20}$/, "Enter a valid phone number")
    .nullable()
    .optional(),
});

meRouter.patch(
  "/api/me",
  requireMember,
  asyncHandler(async (req, res) => {
    const body = parse(updateMeSchema, req.body, res);
    if (!body) return;
    const user = await storage.updateUser(currentUser(req).id, body);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ user: publicUser(user as unknown as Record<string, unknown>) });
  }),
);
