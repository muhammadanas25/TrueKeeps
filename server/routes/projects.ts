/**
 * /api/projects — books owned by the requesting user.
 *
 * Every handler runs behind requireUser (guests included — an anonymous
 * session owns its drafts) and loads rows through the ownership helpers,
 * so a project id from someone else's browser is a 404 here.
 *
 * Creation hands back a one-time `claimToken` alongside the row. The
 * client keeps it in its local draft; if the session cookie is later
 * lost (cleared site data, private window) it can POST it to /claim
 * and re-attach the project to its new session. Only the sha256 is
 * stored, so a DB read can't mint claims.
 *
 * Document saves are versioned (see storage.updateProjectDocument):
 * the client sends the version it last saw and gets 409 + the current
 * row when another tab saved in between.
 */

import { createHash, randomBytes } from "crypto";
import { Router } from "express";
import { z } from "zod";
import { insertProjectSchema, updateProjectSchema } from "@shared/schema";
import { DOCUMENT_MAX_BYTES, saveDocumentSchema } from "@shared/document";
import { storage } from "../storage";
import { requireUser, currentUser } from "../middleware/auth";
import { loadOwnedProject } from "../middleware/ownership";
import { createProjectLimiter, saveLimiter, writeLimiter } from "../middleware/rate-limit";
import { asyncHandler, parse } from "./helpers";

export const projectsRouter = Router();

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Never send the claim-token hash (or reminder bookkeeping) to clients. */
function publicProject<T extends { claimTokenHash?: unknown; lastReminderAt?: unknown; reminderStage?: unknown }>(p: T) {
  const { claimTokenHash: _h, lastReminderAt: _r, reminderStage: _s, ...rest } = p;
  return rest;
}

/* ── list / read ─────────────────────────────────────────────── */

projectsRouter.get(
  "/api/projects",
  requireUser,
  asyncHandler(async (req, res) => {
    res.json(await storage.listProjectSummaries(currentUser(req).id));
  }),
);

projectsRouter.get(
  "/api/projects/:id",
  requireUser,
  asyncHandler(async (req, res) => {
    const project = await loadOwnedProject(req, res, req.params.id);
    if (!project) return;
    res.json(publicProject(project));
  }),
);

/** Whole book in one round trip (canvas editor) — fixed query count. */
projectsRouter.get(
  "/api/projects/:id/full",
  requireUser,
  asyncHandler(async (req, res) => {
    const project = await loadOwnedProject(req, res, req.params.id);
    if (!project) return;
    const full = await storage.getProjectFull(project.id);
    if (!full) return res.status(404).json({ error: "Project not found" });
    res.json({ ...full, project: publicProject(full.project) });
  }),
);

/* ── create ──────────────────────────────────────────────────── */

projectsRouter.post(
  "/api/projects",
  requireUser,
  createProjectLimiter,
  asyncHandler(async (req, res) => {
    const body = parse(insertProjectSchema, req.body, res);
    if (!body) return;
    const claimToken = randomBytes(24).toString("base64url");
    const project = await storage.createProject({
      ...body,
      userId: currentUser(req).id,
      claimTokenHash: sha256(claimToken),
    });
    res.status(201).json({ ...publicProject(project), claimToken });
  }),
);

/* ── update metadata (name/status/theme…) ────────────────────── */

projectsRouter.patch(
  "/api/projects/:id",
  requireUser,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const project = await loadOwnedProject(req, res, req.params.id);
    if (!project) return;
    const body = parse(updateProjectSchema, req.body, res);
    if (!body) return;
    const updated = await storage.updateProject(project.id, body);
    if (!updated) return res.status(404).json({ error: "Project not found" });
    res.json(publicProject(updated));
  }),
);

/* ── versioned document autosave ─────────────────────────────── */

projectsRouter.put(
  "/api/projects/:id/document",
  requireUser,
  saveLimiter,
  asyncHandler(async (req, res) => {
    const project = await loadOwnedProject(req, res, req.params.id);
    if (!project) return;
    const body = parse(saveDocumentSchema, req.body, res);
    if (!body) return;
    if (Buffer.byteLength(JSON.stringify(body.document)) > DOCUMENT_MAX_BYTES) {
      return res.status(413).json({ error: "Book is too large to save" });
    }
    const result = await storage.updateProjectDocument(project.id, body.document, body.documentVersion);
    if (result.ok) return res.json({ documentVersion: result.project.documentVersion, updatedAt: result.project.updatedAt });
    if (result.reason === "conflict") {
      return res.status(409).json({
        error: "This book was changed elsewhere",
        code: "VERSION_CONFLICT",
        documentVersion: result.project.documentVersion,
        document: result.project.document,
        updatedAt: result.project.updatedAt,
      });
    }
    res.status(404).json({ error: "Project not found" });
  }),
);

/* ── claim (session lost) ────────────────────────────────────── */

const claimSchema = z.object({ claimToken: z.string().min(16).max(128) });

projectsRouter.post(
  "/api/projects/:id/claim",
  requireUser,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const body = parse(claimSchema, req.body, res);
    if (!body) return;
    const project = await storage.claimProject(req.params.id, sha256(body.claimToken), currentUser(req).id);
    // same 404 whether the id or the token is wrong — no oracle
    if (!project) return res.status(404).json({ error: "Project not found" });
    res.json(publicProject(project));
  }),
);

/* ── delete (soft) ───────────────────────────────────────────── */

projectsRouter.delete(
  "/api/projects/:id",
  requireUser,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const project = await loadOwnedProject(req, res, req.params.id);
    if (!project) return;
    await storage.deleteProject(project.id);
    res.status(204).send();
  }),
);
