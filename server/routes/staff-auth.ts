/**
 * The admin's second sign-in step (docs/adr/018).
 *
 *   GET  /api/staff/me            who am I, is the step set up, is it passed
 *   POST /api/staff/2fa/setup     start setup: secret + QR code (first time only)
 *   POST /api/staff/2fa/enroll    first code from the app → setup done, backup codes shown once
 *   POST /api/staff/2fa/verify    code (or a backup code) → this session is let in for 12 hours
 *   POST /api/staff/lock          end this session's admin access now
 *
 * These sit outside /api/admin on purpose: the /api/admin gate demands the
 * step to be passed, and these are how it gets passed. They still answer 404
 * to anyone who isn't staff.
 *
 * Brute force: a 6-digit code has a million values. Five wrong codes lock the
 * step for 15 minutes (per person, stored, so restarting the server doesn't
 * reset it), on top of a per-IP rate limit, and every failure is audited.
 */

import { Router, type Request } from "express";
import rateLimit from "express-rate-limit";
import QRCode from "qrcode";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { staffElevations, staffFactors } from "@shared/schema";
import { STAFF_ELEVATION_HOURS } from "@shared/ops";
import { requireStaff } from "../middleware/staff";
import { requireOpsDb } from "../ops/db";
import { audit } from "../ops/audit";
import { notifyEvent } from "../notify/outbox";
import { newBackupCodes, newSecret, openSecret, otpauthUrl, sealSecret, useBackupCode, verifyCode } from "../security/totp";
import { asyncHandler, parse } from "./helpers";

export const staffAuthRouter = Router();

const MAX_FAILS = 5;
const LOCK_MINUTES = 15;

const stepUpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many tries. Wait a few minutes.", code: "RATE_LIMITED" },
});

const staffNoStep = requireStaff(undefined, { stepUp: false });

async function factorOf(userId: string) {
  const db = requireOpsDb();
  const [row] = await db.select().from(staffFactors).where(eq(staffFactors.userId, userId)).limit(1);
  return row ?? null;
}

/** Let this session into the admin for 12 hours. */
async function elevate(req: Request): Promise<Date> {
  const db = requireOpsDb();
  const s = req.staff!;
  const expiresAt = new Date(Date.now() + STAFF_ELEVATION_HOURS * 3600_000);
  const row = { sessionId: s.sessionId, userId: s.userId, expiresAt, ip: req.ip ?? null, userAgent: String(req.headers["user-agent"] ?? "").slice(0, 300) };
  await db.insert(staffElevations).values(row).onConflictDoUpdate({ target: staffElevations.sessionId, set: { expiresAt, ip: row.ip, userAgent: row.userAgent } });
  return expiresAt;
}

staffAuthRouter.get(
  "/api/staff/me",
  staffNoStep,
  asyncHandler(async (req, res) => {
    const s = req.staff!;
    const factor = await factorOf(s.userId);
    res.json({
      email: s.email,
      name: s.name,
      role: s.role,
      enrolled: Boolean(factor?.enrolledAt),
      elevatedUntil: s.elevatedUntil,
      lockedUntil: factor?.lockedUntil && factor.lockedUntil > new Date() ? factor.lockedUntil : null,
      backupCodesLeft: factor?.enrolledAt ? (factor.backupCodes ?? []).length : 0,
    });
  }),
);

staffAuthRouter.post(
  "/api/staff/2fa/setup",
  staffNoStep,
  stepUpLimiter,
  asyncHandler(async (req, res) => {
    const s = req.staff!;
    const db = requireOpsDb();
    const existing = await factorOf(s.userId);
    if (existing?.enrolledAt) return res.status(409).json({ error: "Already set up. Ask the owner to reset it if you lost your phone." });
    // reuse an unfinished setup so a reload doesn't invalidate a QR already scanned
    const secret = existing ? openSecret(existing.secretEnc) : newSecret();
    if (!existing) await db.insert(staffFactors).values({ userId: s.userId, secretEnc: sealSecret(secret) });
    const url = otpauthUrl(secret, s.email);
    const qrSvg = await QRCode.toString(url, { type: "svg", margin: 1, color: { dark: "#2A1E5C", light: "#FFFFFF" } });
    void audit(req, "staff.2fa_setup_started", { type: "user", id: s.userId });
    res.json({ secret, otpauthUrl: url, qrSvg });
  }),
);

const codeSchema = z.object({ code: z.string().trim().min(6).max(12) });

staffAuthRouter.post(
  "/api/staff/2fa/enroll",
  staffNoStep,
  stepUpLimiter,
  asyncHandler(async (req, res) => {
    const body = parse(codeSchema, req.body, res);
    if (!body) return;
    const s = req.staff!;
    const db = requireOpsDb();
    const factor = await factorOf(s.userId);
    if (!factor) return res.status(400).json({ error: "Start the setup first" });
    if (factor.enrolledAt) return res.status(409).json({ error: "Already set up" });
    const step = verifyCode(openSecret(factor.secretEnc), body.code);
    if (step === null) {
      void audit(req, "staff.2fa_setup_wrong_code", { type: "user", id: s.userId });
      return res.status(400).json({ error: "That code didn't match. Check the phone's clock and try the newest code." });
    }
    const codes = newBackupCodes();
    await db
      .update(staffFactors)
      .set({ enrolledAt: new Date(), lastStep: step, backupCodes: codes.hashes, failedCount: 0, lockedUntil: null, updatedAt: new Date() })
      .where(eq(staffFactors.userId, s.userId));
    const until = await elevate(req);
    void audit(req, "staff.2fa_enrolled", { type: "user", id: s.userId });
    void notifyEvent("staff_sign_in", { key: `${s.sessionId}:${until.getTime()}`, vars: { name: s.name || s.email, email: s.email, ip: req.ip ?? "", when: new Date().toISOString(), first: true } });
    res.json({ elevatedUntil: until, backupCodes: codes.plain });
  }),
);

staffAuthRouter.post(
  "/api/staff/2fa/verify",
  staffNoStep,
  stepUpLimiter,
  asyncHandler(async (req, res) => {
    const body = parse(codeSchema, req.body, res);
    if (!body) return;
    const s = req.staff!;
    const db = requireOpsDb();
    const factor = await factorOf(s.userId);
    if (!factor?.enrolledAt) return res.status(400).json({ error: "Set up your authenticator app first", code: "NOT_ENROLLED" });
    if (factor.lockedUntil && factor.lockedUntil > new Date()) {
      return res.status(429).json({ error: `Too many wrong codes. Try again after ${factor.lockedUntil.toLocaleTimeString("en-PK", { timeZone: "Asia/Karachi" })}.`, code: "LOCKED" });
    }

    let ok = false;
    let usedBackup = false;
    const step = verifyCode(openSecret(factor.secretEnc), body.code);
    if (step !== null && step > (factor.lastStep ?? -1)) {
      ok = true;
      await db.update(staffFactors).set({ lastStep: step, failedCount: 0, lockedUntil: null, updatedAt: new Date() }).where(eq(staffFactors.userId, s.userId));
    } else if (step === null) {
      const left = useBackupCode(factor.backupCodes ?? [], body.code);
      if (left) {
        ok = true;
        usedBackup = true;
        await db.update(staffFactors).set({ backupCodes: left, failedCount: 0, lockedUntil: null, updatedAt: new Date() }).where(eq(staffFactors.userId, s.userId));
      }
    }

    if (!ok) {
      const fails = factor.failedCount + 1;
      const lockedUntil = fails >= MAX_FAILS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null;
      await db.update(staffFactors).set({ failedCount: lockedUntil ? 0 : fails, lockedUntil, updatedAt: new Date() }).where(eq(staffFactors.userId, s.userId));
      void audit(req, lockedUntil ? "staff.2fa_locked" : "staff.2fa_wrong_code", { type: "user", id: s.userId }, { fails });
      return res.status(lockedUntil ? 429 : 400).json({
        error: lockedUntil ? `Too many wrong codes. Locked for ${LOCK_MINUTES} minutes.` : "That code didn't match. Try the newest one.",
        code: lockedUntil ? "LOCKED" : "WRONG_CODE",
      });
    }

    const until = await elevate(req);
    void audit(req, usedBackup ? "staff.step_up_backup_code" : "staff.step_up", { type: "user", id: s.userId });
    void notifyEvent("staff_sign_in", { key: `${s.sessionId}:${until.getTime()}`, vars: { name: s.name || s.email, email: s.email, ip: req.ip ?? "", when: new Date().toISOString(), first: false } });
    res.json({ elevatedUntil: until, backupCodesLeft: usedBackup ? (factor.backupCodes ?? []).length - 1 : undefined });
  }),
);

staffAuthRouter.post(
  "/api/staff/lock",
  staffNoStep,
  asyncHandler(async (req, res) => {
    const s = req.staff!;
    await requireOpsDb()
      .delete(staffElevations)
      .where(and(eq(staffElevations.sessionId, s.sessionId), eq(staffElevations.userId, s.userId)));
    void audit(req, "staff.locked_session", { type: "user", id: s.userId });
    res.json({ ok: true });
  }),
);
