/**
 * Media upload flow: presign → PUT bytes → complete (docs/adr/002),
 * plus the upload library read/delete and the local-disk byte routes.
 *
 * Ownership: presign/complete/list require the project to belong to the
 * requester; delete requires the upload row to. The legacy data-URL
 * route (POST /api/uploads) is kept for the classic wizard but now
 * also requires ownership of the target project.
 *
 * Bytes never pass through express.json(); the PUT /api/media/* route
 * (local dev only) uses express.raw with its own 30 MB limit — the
 * global JSON limit is 1 MB.
 */

import express, { Router } from "express";
import { z } from "zod";
import { insertUploadedPhotoSchema } from "@shared/schema";
import { storage } from "../storage";
import { buildPhotoKey, derivativeKey, isSafeKey, mediaStore, LocalDiskMediaStore } from "../media";
import { enqueue } from "../jobs";
import { requireUser, currentUser } from "../middleware/auth";
import { loadOwnedProject, loadOwnedUpload } from "../middleware/ownership";
import { uploadLimiter, writeLimiter } from "../middleware/rate-limit";
import { asyncHandler, parse } from "./helpers";

export const uploadsRouter = Router();

/* Upload constraints enforced at presign time (the media store itself
   accepts whatever it's told — this is the policy layer). */
export const MAX_UPLOAD_BYTES = 30 * 1024 * 1024; // 30MB per photo
const ALLOWED_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/gif"]);

const presignSchema = z.object({
  projectId: z.string().min(1),
  filename: z.string().min(1).max(255),
  contentType: z.string(),
  sizeBytes: z.number().int().positive().max(MAX_UPLOAD_BYTES),
});

const completeSchema = z.object({
  projectId: z.string().min(1),
  key: z.string().min(1),
  originalFilename: z.string().min(1).max(255),
  sizeBytes: z.number().int().positive().optional(),
});

uploadsRouter.get(
  "/api/projects/:projectId/uploads",
  requireUser,
  asyncHandler(async (req, res) => {
    const project = await loadOwnedProject(req, res, req.params.projectId);
    if (!project) return;
    res.json(await storage.getUploadedPhotos(project.id));
  }),
);

uploadsRouter.post(
  "/api/uploads/presign",
  requireUser,
  uploadLimiter,
  asyncHandler(async (req, res) => {
    const body = parse(presignSchema, req.body, res);
    if (!body) return;
    if (!ALLOWED_CONTENT_TYPES.has(body.contentType)) {
      return res.status(415).json({ error: `Unsupported content type: ${body.contentType}` });
    }
    const project = await loadOwnedProject(req, res, body.projectId);
    if (!project) return;
    const key = buildPhotoKey(project.id, body.filename);
    res.json(await mediaStore.presignUpload(key, body.contentType));
  }),
);

uploadsRouter.post(
  "/api/uploads/complete",
  requireUser,
  uploadLimiter,
  asyncHandler(async (req, res) => {
    const body = parse(completeSchema, req.body, res);
    if (!body) return;
    const project = await loadOwnedProject(req, res, body.projectId);
    if (!project) return;
    if (!isSafeKey(body.key) || !body.key.startsWith(`projects/${project.id}/`)) {
      return res.status(400).json({ error: "Key does not belong to this project" });
    }
    const photo = await storage.createUploadedPhoto({
      userId: currentUser(req).id,
      projectId: project.id,
      url: mediaStore.publicUrl(body.key),
      originalFilename: body.originalFilename,
      storageKey: body.key,
      sizeBytes: body.sizeBytes ?? null,
    });
    // derivatives (thumb/preview/dimensions) attach asynchronously
    enqueue("media.derivatives", { photoId: photo.id, storageKey: body.key });
    res.status(201).json(photo);
  }),
);

/** Legacy data-URL upload (classic wizard). Kept, but owner-checked. */
uploadsRouter.post(
  "/api/uploads",
  requireUser,
  uploadLimiter,
  asyncHandler(async (req, res) => {
    const body = parse(insertUploadedPhotoSchema.omit({ userId: true }), req.body, res);
    if (!body) return;
    const project = await loadOwnedProject(req, res, body.projectId);
    if (!project) return;
    res.status(201).json(await storage.createUploadedPhoto({ ...body, userId: currentUser(req).id, status: "ready" }));
  }),
);

uploadsRouter.delete(
  "/api/uploads/:id",
  requireUser,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const photo = await loadOwnedUpload(req, res, req.params.id);
    if (!photo) return;
    await storage.deleteUploadedPhoto(photo.id);
    // best-effort media cleanup — the row is the source of truth
    if (photo.storageKey) {
      void Promise.allSettled([
        mediaStore.delete(photo.storageKey),
        mediaStore.delete(derivativeKey(photo.storageKey, "thumb")),
        mediaStore.delete(derivativeKey(photo.storageKey, "preview")),
      ]);
    }
    res.status(204).send();
  }),
);

/* ── Local-store byte endpoints (dev only) ───────────────────── */
// In S3/R2 mode the client PUTs to the presigned URL directly and GETs
// from the public/CDN domain, so these routes don't exist.
if (mediaStore.kind === "local") {
  const local = mediaStore as LocalDiskMediaStore;

  uploadsRouter.put(
    "/api/media/*",
    express.raw({ type: () => true, limit: MAX_UPLOAD_BYTES }),
    asyncHandler(async (req, res) => {
      const key = (req.params as Record<string, string>)[0] ?? "";
      if (!isSafeKey(key)) return res.status(400).json({ error: "Invalid media key" });
      const contentType = req.headers["content-type"] || "application/octet-stream";
      if (!ALLOWED_CONTENT_TYPES.has(contentType)) return res.status(415).json({ error: "Unsupported content type" });
      await local.put(key, req.body as Buffer, contentType);
      res.status(200).json({ key });
    }),
  );

  // serve originals + derivatives; immutable keys → cache hard
  uploadsRouter.use("/media", express.static(local.root, { immutable: true, maxAge: "365d", index: false }));
}
