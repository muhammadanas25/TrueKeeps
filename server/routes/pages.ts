/**
 * Canvas-editor rows: /api/projects/:projectId/pages, /api/pages/:id,
 * /api/pages/:pageId/photos, /api/photos/:id.
 *
 * Ownership walks page → project (and photo → page → project) via the
 * helpers in middleware/ownership.ts. Bodies are zod-validated with the
 * update schemas (previously raw `req.body` went straight to storage).
 */

import { Router } from "express";
import {
  insertPagePhotoSchema,
  insertProjectPageSchema,
  updatePagePhotoSchema,
  updateProjectPageSchema,
} from "@shared/schema";
import { storage } from "../storage";
import { requireUser } from "../middleware/auth";
import { loadOwnedPage, loadOwnedPagePhoto, loadOwnedProject } from "../middleware/ownership";
import { writeLimiter } from "../middleware/rate-limit";
import { asyncHandler, parse } from "./helpers";

export const pagesRouter = Router();

/* ── pages ───────────────────────────────────────────────────── */

pagesRouter.get(
  "/api/projects/:projectId/pages",
  requireUser,
  asyncHandler(async (req, res) => {
    const project = await loadOwnedProject(req, res, req.params.projectId);
    if (!project) return;
    res.json(await storage.getProjectPages(project.id));
  }),
);

pagesRouter.post(
  "/api/projects/:projectId/pages",
  requireUser,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const project = await loadOwnedProject(req, res, req.params.projectId);
    if (!project) return;
    const body = parse(insertProjectPageSchema, { ...req.body, projectId: project.id }, res);
    if (!body) return;
    res.status(201).json(await storage.createProjectPage(body));
  }),
);

pagesRouter.patch(
  "/api/pages/:id",
  requireUser,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const page = await loadOwnedPage(req, res, req.params.id);
    if (!page) return;
    const body = parse(updateProjectPageSchema, req.body, res);
    if (!body) return;
    const updated = await storage.updateProjectPage(page.id, body);
    if (!updated) return res.status(404).json({ error: "Page not found" });
    res.json(updated);
  }),
);

pagesRouter.delete(
  "/api/pages/:id",
  requireUser,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const page = await loadOwnedPage(req, res, req.params.id);
    if (!page) return;
    await storage.deleteProjectPage(page.id);
    res.status(204).send();
  }),
);

/* ── placed photos ───────────────────────────────────────────── */

pagesRouter.get(
  "/api/pages/:pageId/photos",
  requireUser,
  asyncHandler(async (req, res) => {
    const page = await loadOwnedPage(req, res, req.params.pageId);
    if (!page) return;
    res.json(await storage.getPagePhotos(page.id));
  }),
);

pagesRouter.post(
  "/api/pages/:pageId/photos",
  requireUser,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const page = await loadOwnedPage(req, res, req.params.pageId);
    if (!page) return;
    const body = parse(insertPagePhotoSchema, { ...req.body, pageId: page.id }, res);
    if (!body) return;
    res.status(201).json(await storage.createPagePhoto(body));
  }),
);

pagesRouter.patch(
  "/api/photos/:id",
  requireUser,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const photo = await loadOwnedPagePhoto(req, res, req.params.id);
    if (!photo) return;
    const body = parse(updatePagePhotoSchema, req.body, res);
    if (!body) return;
    const updated = await storage.updatePagePhoto(photo.id, body);
    if (!updated) return res.status(404).json({ error: "Photo not found" });
    res.json(updated);
  }),
);

pagesRouter.delete(
  "/api/photos/:id",
  requireUser,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const photo = await loadOwnedPagePhoto(req, res, req.params.id);
    if (!photo) return;
    await storage.deletePagePhoto(photo.id);
    res.status(204).send();
  }),
);
