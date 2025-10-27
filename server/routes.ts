import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import {
  insertThemeSchema,
  insertProjectSchema,
  insertProjectPageSchema,
  insertPagePhotoSchema,
  insertUploadedPhotoSchema,
} from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
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
      const deleted = await storage.deleteUploadedPhoto(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Photo not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete photo" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
