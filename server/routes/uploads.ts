/**
 * Media upload flow (docs/adr/002, docs/adr/011), plus the upload library
 * read/delete and the private media read route.
 *
 * The builder uploads each photo in two stages, because a customer's phone
 * connection is the bottleneck and the two copies serve different moments:
 *
 *   1. POST /api/uploads/prepare → signed PUTs for the display and thumbnail
 *      copies the browser made. These are about 250 KB together.
 *      POST /api/uploads/complete → registers the photo, usable straight away.
 *   2. POST /api/uploads/:id/original/presign → signed PUT, asked for only
 *      when that file's turn comes, because a link would expire in the queue.
 *      POST /api/uploads/:id/original/complete → checks the object really is
 *      there, then marks the photo printable.
 *
 * The canvas editor (/create) still does the one-stage flow: presign →
 * PUT original → complete with no display copy, and the server makes the
 * derivatives.
 *
 * Ownership: every route resolves to a project the requester owns, and media
 * reads are no exception. The bucket is private; /media/* is the only way to
 * see a photo and it redirects to a short-lived signed link.
 *
 * Bytes never pass through express.json(); the PUT /api/media/* route (local
 * dev only) uses express.raw with its own limit.
 */

import { createHash } from "crypto";
import express, { Router, type Request, type Response } from "express";
import { z } from "zod";
import { insertUploadedPhotoSchema } from "@shared/schema";
import { storage } from "../storage";
import { allDerivativeKeys, buildPhotoKey, derivativeKey, isSafeKey, LocalDiskMediaStore, mediaStore, mediaUrl, projectIdOfKey } from "../media";
import { enqueue } from "../jobs";
import { currentUser, optionalUser, requireUser } from "../middleware/auth";
import { loadOwnedProject, loadOwnedUpload } from "../middleware/ownership";
import { uploadLimiter, writeLimiter } from "../middleware/rate-limit";
import { asyncHandler, parse } from "./helpers";

export const uploadsRouter = Router();

/* Upload constraints enforced at presign time (the media store itself
   accepts whatever it's told — this is the policy layer). The browser
   re-encodes anything larger than this before sending it. */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/gif"]);

const contentType = z.string().refine((t) => ALLOWED_CONTENT_TYPES.has(t), "Unsupported content type");

const presignSchema = z.object({
  projectId: z.string().min(1),
  filename: z.string().min(1).max(255),
  contentType: z.string(),
  sizeBytes: z.number().int().positive().max(MAX_UPLOAD_BYTES),
});

const prepareSchema = z.object({
  projectId: z.string().min(1),
  /** Named by the client, so pages can reference the photo before any network. */
  id: z.string().uuid(),
  filename: z.string().min(1).max(255),
  /** Safari can't encode WebP, so it sends JPEG copies. */
  displayType: z.enum(["image/webp", "image/jpeg"]),
});

const completeSchema = z.object({
  projectId: z.string().min(1),
  key: z.string().min(1),
  originalFilename: z.string().min(1).max(255),
  sizeBytes: z.number().int().positive().optional(),
  /** Present in the two-stage flow; means the original is still to come. */
  id: z.string().uuid().optional(),
  displayExt: z.enum(["webp", "jpg"]).optional(),
  /** Size of the original as displayed, measured by the browser. */
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

const originalPresignSchema = z.object({
  contentType,
  sizeBytes: z.number().int().positive().max(MAX_UPLOAD_BYTES),
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

/** Stage 1a: where to put a photo's display and thumbnail copies. Safe to repeat. */
uploadsRouter.post(
  "/api/uploads/prepare",
  requireUser,
  uploadLimiter,
  asyncHandler(async (req, res) => {
    const body = parse(prepareSchema, req.body, res);
    if (!body) return;
    const project = await loadOwnedProject(req, res, body.projectId);
    if (!project) return;
    const key = buildPhotoKey(project.id, body.filename, body.id);
    const ext = body.displayType === "image/webp" ? "webp" : "jpg";
    const [display, thumb] = await Promise.all([
      mediaStore.presignUpload(derivativeKey(key, "preview", ext), body.displayType),
      mediaStore.presignUpload(derivativeKey(key, "thumb", ext), body.displayType),
    ]);
    res.json({ key, ext, display, thumb });
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

    // Two-stage: the photo already has a client-chosen id, and a retried
    // request (the response was lost on a bad connection) must not fail.
    if (body.id) {
      const existing = await storage.getUploadedPhoto(body.id);
      if (existing) {
        if (existing.userId !== currentUser(req).id || existing.storageKey !== body.key) {
          return res.status(409).json({ error: "That photo id is already in use" });
        }
        return res.status(200).json(existing);
      }
      const ext = body.displayExt ?? "webp";
      const photo = await storage.createUploadedPhoto({
        id: body.id,
        userId: currentUser(req).id,
        projectId: project.id,
        url: mediaUrl(body.key),
        originalFilename: body.originalFilename,
        storageKey: body.key,
        previewUrl: mediaUrl(derivativeKey(body.key, "preview", ext)),
        thumbUrl: mediaUrl(derivativeKey(body.key, "thumb", ext)),
        width: body.width ?? null,
        height: body.height ?? null,
        status: "ready",
        originalUploadedAt: null,
      });
      return res.status(201).json(photo);
    }

    // One-stage (/create): the original is already up.
    const photo = await storage.createUploadedPhoto({
      userId: currentUser(req).id,
      projectId: project.id,
      url: mediaUrl(body.key),
      originalFilename: body.originalFilename,
      storageKey: body.key,
      sizeBytes: body.sizeBytes ?? null,
      originalUploadedAt: new Date(),
    });
    // derivatives (thumb/preview/dimensions) attach asynchronously
    enqueue("media.derivatives", { photoId: photo.id, storageKey: body.key });
    res.status(201).json(photo);
  }),
);

/** Stage 2a: a fresh signed PUT for the original, at the moment its turn comes. */
uploadsRouter.post(
  "/api/uploads/:id/original/presign",
  requireUser,
  uploadLimiter,
  asyncHandler(async (req, res) => {
    const body = parse(originalPresignSchema, req.body, res);
    if (!body) return;
    const photo = await loadOwnedUpload(req, res, req.params.id);
    if (!photo) return;
    if (!photo.storageKey) return res.status(409).json({ error: "This photo has no storage key" });
    res.json(await mediaStore.presignUpload(photo.storageKey, body.contentType));
  }),
);

/**
 * Stage 2b: mark the photo printable. Checks the object rather than trusting
 * the client, since this flag is what lets a customer pay for a printed book.
 */
uploadsRouter.post(
  "/api/uploads/:id/original/complete",
  requireUser,
  uploadLimiter,
  asyncHandler(async (req, res) => {
    const photo = await loadOwnedUpload(req, res, req.params.id);
    if (!photo) return;
    if (photo.originalUploadedAt) return res.json(photo);
    if (!photo.storageKey) return res.status(409).json({ error: "This photo has no storage key" });
    const size = await mediaStore.sizeOf(photo.storageKey);
    if (!size) return res.status(409).json({ error: "The original hasn't arrived yet", code: "ORIGINAL_MISSING" });
    const updated = await storage.updateUploadedPhoto(photo.id, { sizeBytes: size, originalUploadedAt: new Date() });
    res.json(updated);
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
    res.status(201).json(
      await storage.createUploadedPhoto({ ...body, userId: currentUser(req).id, status: "ready", originalUploadedAt: new Date() }),
    );
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
      const key = photo.storageKey;
      void Promise.allSettled([key, ...allDerivativeKeys(key)].map((k) => mediaStore.delete(k)));
    }
    res.status(204).send();
  }),
);

/* ── Private media reads ─────────────────────────────────────── */

/**
 * "May this session read this project's photos?", remembered for a minute.
 *
 * A 200-photo book asks this 200 times as a grid scrolls into view, and each
 * uncached answer costs a session lookup and a project lookup. A minute's
 * staleness is harmless here: it only delays a revoked or deleted book's
 * photos going dark by that minute, and the signed link lives an hour anyway.
 *
 * Keyed on a hash so the cache never holds a session cookie.
 */
const ACCESS_TTL_MS = 60_000;
const ACCESS_MAX_ENTRIES = 5000;
const accessCache = new Map<string, number>();

function accessKey(req: Request, projectId: string): string | null {
  const cookie = req.headers.cookie;
  if (!cookie) return null;
  return createHash("sha1").update(cookie).update(projectId).digest("base64");
}

function rememberAccess(key: string) {
  if (accessCache.size >= ACCESS_MAX_ENTRIES) accessCache.clear();
  accessCache.set(key, Date.now() + ACCESS_TTL_MS);
}

/** Resolve a /media request to its key after checking access; responds itself on failure. */
async function authorizedKey(req: Request, res: Response): Promise<string | null> {
  const key = (req.params as Record<string, string>)[0] ?? "";
  const projectId = isSafeKey(key) ? projectIdOfKey(key) : null;
  if (!projectId) {
    res.status(404).end();
    return null;
  }
  const cached = accessKey(req, projectId);
  if (cached && (accessCache.get(cached) ?? 0) > Date.now()) return key;

  // Same answer for "not signed in" as for "not yours": a photo's existence
  // is nobody else's business.
  await new Promise<void>((resolve, reject) => void optionalUser(req, res, (err?: unknown) => (err ? reject(err) : resolve())));
  const project = req.user ? await storage.getProject(projectId) : undefined;
  const isAdmin = (req.user as { role?: string } | undefined)?.role === "admin";
  if (!project || project.deletedAt || (project.userId !== req.user!.id && !isAdmin)) {
    res.status(404).end();
    return null;
  }
  if (cached) rememberAccess(cached);
  return key;
}

uploadsRouter.get(
  "/media/*",
  asyncHandler(async (req, res) => {
    const key = await authorizedKey(req, res);
    if (!key) return;
    // Per-user, so never in a shared cache, and the app must re-check after a
    // sign-out; the bytes themselves cache hard behind the redirect.
    if (mediaStore.kind === "local") {
      res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
      return res.sendFile((mediaStore as LocalDiskMediaStore).absolutePath(key), (err) => {
        if (err && !res.headersSent) res.status(404).end();
      });
    }
    const signed = await mediaStore.signedRead(key);
    res.setHeader("Cache-Control", `private, max-age=${signed.maxAge}`);
    res.redirect(302, signed.url);
  }),
);

/* ── Local-store byte upload (dev only) ──────────────────────── */
// In S3/R2 mode the client PUTs to the presigned URL directly, so this route
// doesn't exist. A presigned URL is its own authorization; this one has none,
// so it checks ownership itself.
if (mediaStore.kind === "local") {
  const local = mediaStore as LocalDiskMediaStore;

  uploadsRouter.put(
    "/api/media/*",
    requireUser,
    express.raw({ type: () => true, limit: MAX_UPLOAD_BYTES }),
    asyncHandler(async (req, res) => {
      const key = (req.params as Record<string, string>)[0] ?? "";
      const projectId = isSafeKey(key) ? projectIdOfKey(key) : null;
      if (!projectId) return res.status(400).json({ error: "Invalid media key" });
      if (!(await loadOwnedProject(req, res, projectId))) return;
      const type = req.headers["content-type"] || "application/octet-stream";
      if (!ALLOWED_CONTENT_TYPES.has(type)) return res.status(415).json({ error: "Unsupported content type" });
      await local.put(key, req.body as Buffer, type);
      res.status(200).json({ key });
    }),
  );
}
