import express, { type Express } from "express";
import { createServer, type Server } from "http";
import { z } from "zod";
import { storage } from "./storage";
import { buildPhotoKey, derivativeKey, isSafeKey, mediaStore, LocalDiskMediaStore } from "./media";
import { enqueue } from "./jobs";
import {
  insertThemeSchema,
  insertProjectSchema,
  insertProjectPageSchema,
  insertPagePhotoSchema,
  insertUploadedPhotoSchema,
} from "@shared/schema";

/* Upload constraints enforced at presign time (the media store itself
   accepts whatever it's told — this is the policy layer). */
const MAX_UPLOAD_BYTES = 30 * 1024 * 1024; // 30MB per photo
const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/gif",
]);

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

export async function registerRoutes(app: Express): Promise<Server> {
  // Liveness probe — used by the hosting platform (Railway healthcheck)
  // to gate deploys and restart dead instances. Keep it dependency-free
  // (no DB call) so a slow DB doesn't get the process killed.
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", uptime: process.uptime() });
  });

  // Themes routes
  app.get("/api/themes", async (req, res) => {
    try {
      const { category } = req.query;
      const themes = category 
        ? await storage.getThemesByCategory(category as string)
        : await storage.getThemes();
      res.json(themes);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch themes" });
    }
  });

  app.get("/api/themes/:id", async (req, res) => {
    try {
      const theme = await storage.getTheme(req.params.id);
      if (!theme) {
        return res.status(404).json({ error: "Theme not found" });
      }
      res.json(theme);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch theme" });
    }
  });

  app.post("/api/themes", async (req, res) => {
    try {
      const validatedData = insertThemeSchema.parse(req.body);
      const theme = await storage.createTheme(validatedData);
      res.status(201).json(theme);
    } catch (error) {
      res.status(400).json({ error: "Invalid theme data" });
    }
  });

  // Projects routes
  app.get("/api/projects", async (req, res) => {
    try {
      const { userId } = req.query;
      const projects = userId
        ? await storage.getProjectsByUserId(userId as string)
        : [];
      res.json(projects);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch projects" });
    }
  });

  app.get("/api/projects/:id", async (req, res) => {
    try {
      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      res.json(project);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch project" });
    }
  });

  app.post("/api/projects", async (req, res) => {
    try {
      const validatedData = insertProjectSchema.parse(req.body);
      const project = await storage.createProject(validatedData);
      res.status(201).json(project);
    } catch (error) {
      res.status(400).json({ error: "Invalid project data" });
    }
  });

  app.patch("/api/projects/:id", async (req, res) => {
    try {
      const project = await storage.updateProject(req.params.id, req.body);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      res.json(project);
    } catch (error) {
      res.status(400).json({ error: "Failed to update project" });
    }
  });

  app.delete("/api/projects/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteProject(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Project not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete project" });
    }
  });

  // Project pages routes
  app.get("/api/projects/:projectId/pages", async (req, res) => {
    try {
      const pages = await storage.getProjectPages(req.params.projectId);
      res.json(pages);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch pages" });
    }
  });

  app.post("/api/projects/:projectId/pages", async (req, res) => {
    try {
      const validatedData = insertProjectPageSchema.parse({
        ...req.body,
        projectId: req.params.projectId,
      });
      const page = await storage.createProjectPage(validatedData);
      res.status(201).json(page);
    } catch (error) {
      res.status(400).json({ error: "Invalid page data" });
    }
  });

  app.patch("/api/pages/:id", async (req, res) => {
    try {
      const page = await storage.updateProjectPage(req.params.id, req.body);
      if (!page) {
        return res.status(404).json({ error: "Page not found" });
      }
      res.json(page);
    } catch (error) {
      res.status(400).json({ error: "Failed to update page" });
    }
  });

  app.delete("/api/pages/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteProjectPage(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Page not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete page" });
    }
  });

  // Page photos routes
  app.get("/api/pages/:pageId/photos", async (req, res) => {
    try {
      const photos = await storage.getPagePhotos(req.params.pageId);
      res.json(photos);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch photos" });
    }
  });

  app.post("/api/pages/:pageId/photos", async (req, res) => {
    try {
      const validatedData = insertPagePhotoSchema.parse({
        ...req.body,
        pageId: req.params.pageId,
      });
      const photo = await storage.createPagePhoto(validatedData);
      res.status(201).json(photo);
    } catch (error) {
      res.status(400).json({ error: "Invalid photo data" });
    }
  });

  app.patch("/api/photos/:id", async (req, res) => {
    try {
      const photo = await storage.updatePagePhoto(req.params.id, req.body);
      if (!photo) {
        return res.status(404).json({ error: "Photo not found" });
      }
      res.json(photo);
    } catch (error) {
      res.status(400).json({ error: "Failed to update photo" });
    }
  });

  app.delete("/api/photos/:id", async (req, res) => {
    try {
      const deleted = await storage.deletePagePhoto(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Photo not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete photo" });
    }
  });

  // Uploaded photos routes
  app.get("/api/projects/:projectId/uploads", async (req, res) => {
    try {
      const photos = await storage.getUploadedPhotos(req.params.projectId);
      res.json(photos);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch uploaded photos" });
    }
  });

  app.post("/api/uploads", async (req, res) => {
    try {
      const validatedData = insertUploadedPhotoSchema.parse(req.body);
      const photo = await storage.createUploadedPhoto(validatedData);
      res.status(201).json(photo);
    } catch (error) {
      res.status(400).json({ error: "Invalid upload data" });
    }
  });

  app.delete("/api/uploads/:id", async (req, res) => {
    try {
      const photo = await storage.getUploadedPhoto(req.params.id);
      const deleted = await storage.deleteUploadedPhoto(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Photo not found" });
      }
      // best-effort media cleanup — the row is the source of truth
      if (photo?.storageKey) {
        void Promise.allSettled([
          mediaStore.delete(photo.storageKey),
          mediaStore.delete(derivativeKey(photo.storageKey, "thumb")),
          mediaStore.delete(derivativeKey(photo.storageKey, "preview")),
        ]);
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete photo" });
    }
  });

  // ── Whole book in one round trip (no client-side N+1 fan-out) ──
  app.get("/api/projects/:id/full", async (req, res) => {
    try {
      const full = await storage.getProjectFull(req.params.id);
      if (!full) {
        return res.status(404).json({ error: "Project not found" });
      }
      res.json(full);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch project" });
    }
  });

  // ── Media upload flow (presign → PUT bytes → complete) ─────────
  // Bytes never pass through express.json(); see server/media.ts for
  // the local-vs-S3 story. Flow is identical for both backends.

  app.post("/api/uploads/presign", async (req, res) => {
    try {
      const { projectId, filename, contentType } = presignSchema.parse(req.body);
      if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
        return res.status(415).json({ error: `Unsupported content type: ${contentType}` });
      }
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      const key = buildPhotoKey(projectId, filename);
      const presigned = await mediaStore.presignUpload(key, contentType);
      res.json(presigned);
    } catch (error) {
      res.status(400).json({ error: "Invalid presign request" });
    }
  });

  app.post("/api/uploads/complete", async (req, res) => {
    try {
      const { projectId, key, originalFilename, sizeBytes } = completeSchema.parse(req.body);
      if (!isSafeKey(key) || !key.startsWith(`projects/${projectId}/`)) {
        return res.status(400).json({ error: "Key does not belong to this project" });
      }
      const photo = await storage.createUploadedPhoto({
        projectId,
        url: mediaStore.publicUrl(key),
        originalFilename,
        storageKey: key,
        sizeBytes: sizeBytes ?? null,
      });
      // derivatives (thumb/preview/dimensions) attach asynchronously
      enqueue("media.derivatives", { photoId: photo.id, storageKey: key });
      res.status(201).json(photo);
    } catch (error) {
      res.status(400).json({ error: "Invalid upload completion" });
    }
  });

  // Local-store byte endpoints — only mounted when media lives on disk.
  // In S3/R2 mode the client PUTs to the presigned URL directly and
  // GETs from the public/CDN domain, so these routes don't exist.
  if (mediaStore.kind === "local") {
    const local = mediaStore as LocalDiskMediaStore;

    app.put(
      "/api/media/*",
      express.raw({ type: () => true, limit: MAX_UPLOAD_BYTES }),
      async (req, res) => {
        try {
          const key = (req.params as Record<string, string>)[0] ?? "";
          if (!isSafeKey(key)) {
            return res.status(400).json({ error: "Invalid media key" });
          }
          const contentType = req.headers["content-type"] || "application/octet-stream";
          if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
            return res.status(415).json({ error: "Unsupported content type" });
          }
          await local.put(key, req.body as Buffer, contentType);
          res.status(200).json({ key });
        } catch (error) {
          res.status(500).json({ error: "Failed to store media" });
        }
      },
    );

    // serve originals + derivatives; immutable keys → cache hard
    app.use(
      "/media",
      express.static(local.root, { immutable: true, maxAge: "365d", index: false }),
    );
  }

  const httpServer = createServer(app);

  return httpServer;
}
