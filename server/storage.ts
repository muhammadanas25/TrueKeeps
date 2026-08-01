/**
 * Storage layer — repository interface + implementations + factory.
 *
 * IStorage is the seam between HTTP routes and persistence. Two
 * implementations exist:
 *  - MemStorage (below): in-memory Maps, zero-setup dev default
 *  - DrizzleStorage (storage-pg.ts): Postgres via Drizzle
 * The factory at the bottom picks by DATABASE_URL, so switching
 * backends is configuration, not code (docs/adr/001).
 *
 * getProjectFull() exists on the interface specifically to keep whole-
 * book loading at a fixed query count (no per-page N+1) — clients
 * should prefer GET /api/projects/:id/full over fanning out requests.
 */

import {
  type User,
  type InsertUser,
  type Theme,
  type InsertTheme,
  type Project,
  type InsertProject,
  type ProjectPage,
  type InsertProjectPage,
  type PagePhoto,
  type InsertPagePhoto,
  type UploadedPhoto,
  type InsertUploadedPhoto,
} from "@shared/schema";
import { randomUUID } from "crypto";
import { DrizzleStorage } from "./storage-pg";

/** A whole book in one payload: project + pages + placed photos + library. */
export interface ProjectFull {
  project: Project;
  pages: ProjectPage[];
  pagePhotos: PagePhoto[];
  uploadedPhotos: UploadedPhoto[];
}

/** Starter themes shared by both backends (Mem seeds in-memory, Drizzle seeds an empty table). */
export const SEED_THEMES: InsertTheme[] = [
  { name: "Europe Travel", category: "Travel", imageUrl: "https://images.unsplash.com/photo-1513581166391-887a96ddeafd?w=400&h=500&fit=crop", price: "14.99", pageCount: 20 },
  { name: "Minimalist Adventure", category: "Travel", imageUrl: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=500&fit=crop", price: "14.99", pageCount: 20 },
  { name: "Beach Getaway", category: "Travel", imageUrl: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400&h=500&fit=crop", price: "14.99", pageCount: 20 },
  { name: "Simple Moments", category: "Simple", imageUrl: "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=400&h=500&fit=crop", price: "12.99", pageCount: 20 },
  { name: "Clean Canvas", category: "Simple", imageUrl: "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=400&h=500&fit=crop", price: "12.99", pageCount: 20 },
  { name: "Family Album", category: "Family", imageUrl: "https://images.unsplash.com/photo-1511895426328-dc8714191300?w=400&h=500&fit=crop", price: "15.99", pageCount: 24 },
  { name: "Generations", category: "Family", imageUrl: "https://images.unsplash.com/photo-1519998250874-7ad1c9faa92a?w=400&h=500&fit=crop", price: "15.99", pageCount: 24 },
  { name: "Bold Modern Wedding", category: "Wedding", imageUrl: "https://images.unsplash.com/photo-1606800052052-a08af7148866?w=400&h=500&fit=crop", price: "24.99", pageCount: 40 },
  { name: "Timeless Wedding", category: "Wedding", imageUrl: "https://images.unsplash.com/photo-1519741497674-611481863552?w=400&h=500&fit=crop", price: "24.99", pageCount: 40 },
  { name: "Baby's First Year", category: "Baby", imageUrl: "https://images.unsplash.com/photo-1555252333-9f8e92e65df9?w=400&h=500&fit=crop", price: "16.99", pageCount: 30 },
];

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  getThemes(): Promise<Theme[]>;
  getThemesByCategory(category: string): Promise<Theme[]>;
  getTheme(id: string): Promise<Theme | undefined>;
  createTheme(theme: InsertTheme): Promise<Theme>;
  
  getProject(id: string): Promise<Project | undefined>;
  getProjectsByUserId(userId: string): Promise<Project[]>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: string, project: Partial<InsertProject>): Promise<Project | undefined>;
  deleteProject(id: string): Promise<boolean>;
  /** Whole book in one call — fixed query count, no per-page N+1. */
  getProjectFull(id: string): Promise<ProjectFull | undefined>;
  
  getProjectPages(projectId: string): Promise<ProjectPage[]>;
  getProjectPage(id: string): Promise<ProjectPage | undefined>;
  createProjectPage(page: InsertProjectPage): Promise<ProjectPage>;
  updateProjectPage(id: string, page: Partial<InsertProjectPage>): Promise<ProjectPage | undefined>;
  deleteProjectPage(id: string): Promise<boolean>;
  
  getPagePhotos(pageId: string): Promise<PagePhoto[]>;
  getPagePhoto(id: string): Promise<PagePhoto | undefined>;
  createPagePhoto(photo: InsertPagePhoto): Promise<PagePhoto>;
  updatePagePhoto(id: string, photo: Partial<InsertPagePhoto>): Promise<PagePhoto | undefined>;
  deletePagePhoto(id: string): Promise<boolean>;
  
  getUploadedPhotos(projectId: string): Promise<UploadedPhoto[]>;
  getUploadedPhoto(id: string): Promise<UploadedPhoto | undefined>;
  createUploadedPhoto(photo: InsertUploadedPhoto): Promise<UploadedPhoto>;
  /** Used by the image pipeline to attach derivative URLs/dimensions after processing. */
  updateUploadedPhoto(id: string, photo: Partial<InsertUploadedPhoto>): Promise<UploadedPhoto | undefined>;
  deleteUploadedPhoto(id: string): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private themes: Map<string, Theme>;
  private projects: Map<string, Project>;
  private projectPages: Map<string, ProjectPage>;
  private pagePhotos: Map<string, PagePhoto>;
  private uploadedPhotos: Map<string, UploadedPhoto>;

  constructor() {
    this.users = new Map();
    this.themes = new Map();
    this.projects = new Map();
    this.projectPages = new Map();
    this.pagePhotos = new Map();
    this.uploadedPhotos = new Map();
    this.seedThemes();
  }

  private seedThemes() {
    SEED_THEMES.forEach((theme) => {
      const id = randomUUID();
      this.themes.set(id, { 
        ...theme, 
        id, 
        createdAt: new Date(),
        imageUrl: theme.imageUrl || null,
        pageCount: theme.pageCount || 20,
      });
    });
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id, createdAt: new Date() };
    this.users.set(id, user);
    return user;
  }

  async getThemes(): Promise<Theme[]> {
    return Array.from(this.themes.values());
  }

  async getThemesByCategory(category: string): Promise<Theme[]> {
    return Array.from(this.themes.values()).filter(
      (theme) => theme.category === category,
    );
  }

  async getTheme(id: string): Promise<Theme | undefined> {
    return this.themes.get(id);
  }

  async createTheme(insertTheme: InsertTheme): Promise<Theme> {
    const id = randomUUID();
    const theme: Theme = { 
      ...insertTheme, 
      id, 
      createdAt: new Date(),
      imageUrl: insertTheme.imageUrl || null,
      pageCount: insertTheme.pageCount || 20,
    };
    this.themes.set(id, theme);
    return theme;
  }

  async getProject(id: string): Promise<Project | undefined> {
    return this.projects.get(id);
  }

  async getProjectsByUserId(userId: string): Promise<Project[]> {
    return Array.from(this.projects.values()).filter(
      (project) => project.userId === userId,
    );
  }

  async createProject(insertProject: InsertProject): Promise<Project> {
    const id = randomUUID();
    const project: Project = { 
      ...insertProject, 
      id, 
      status: insertProject.status || "draft",
      userId: insertProject.userId || null,
      themeId: insertProject.themeId || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.projects.set(id, project);
    return project;
  }

  async updateProject(id: string, update: Partial<InsertProject>): Promise<Project | undefined> {
    const project = this.projects.get(id);
    if (!project) return undefined;
    
    const updated: Project = { 
      ...project, 
      ...update,
      updatedAt: new Date(),
    };
    this.projects.set(id, updated);
    return updated;
  }

  async deleteProject(id: string): Promise<boolean> {
    return this.projects.delete(id);
  }

  async getProjectFull(id: string): Promise<ProjectFull | undefined> {
    const project = this.projects.get(id);
    if (!project) return undefined;
    const pages = await this.getProjectPages(id);
    const pageIds = new Set(pages.map((p) => p.id));
    const photos = Array.from(this.pagePhotos.values())
      .filter((ph) => pageIds.has(ph.pageId))
      .sort((a, b) => a.zIndex - b.zIndex);
    const uploads = await this.getUploadedPhotos(id);
    return { project, pages, pagePhotos: photos, uploadedPhotos: uploads };
  }

  async getProjectPages(projectId: string): Promise<ProjectPage[]> {
    return Array.from(this.projectPages.values())
      .filter((page) => page.projectId === projectId)
      .sort((a, b) => a.pageNumber - b.pageNumber);
  }

  async getProjectPage(id: string): Promise<ProjectPage | undefined> {
    return this.projectPages.get(id);
  }

  async createProjectPage(insertPage: InsertProjectPage): Promise<ProjectPage> {
    const id = randomUUID();
    const page: ProjectPage = { 
      ...insertPage, 
      id, 
      layoutId: insertPage.layoutId || null,
      backgroundUrl: insertPage.backgroundUrl || null,
      createdAt: new Date(),
    };
    this.projectPages.set(id, page);
    return page;
  }

  async updateProjectPage(id: string, update: Partial<InsertProjectPage>): Promise<ProjectPage | undefined> {
    const page = this.projectPages.get(id);
    if (!page) return undefined;
    
    const updated: ProjectPage = { ...page, ...update };
    this.projectPages.set(id, updated);
    return updated;
  }

  async deleteProjectPage(id: string): Promise<boolean> {
    return this.projectPages.delete(id);
  }

  async getPagePhotos(pageId: string): Promise<PagePhoto[]> {
    return Array.from(this.pagePhotos.values())
      .filter((photo) => photo.pageId === pageId)
      .sort((a, b) => a.zIndex - b.zIndex);
  }

  async getPagePhoto(id: string): Promise<PagePhoto | undefined> {
    return this.pagePhotos.get(id);
  }

  async createPagePhoto(insertPhoto: InsertPagePhoto): Promise<PagePhoto> {
    const id = randomUUID();
    const photo: PagePhoto = { 
      ...insertPhoto, 
      id, 
      x: insertPhoto.x ?? 0,
      y: insertPhoto.y ?? 0,
      width: insertPhoto.width ?? 100,
      height: insertPhoto.height ?? 100,
      rotation: insertPhoto.rotation ?? 0,
      zIndex: insertPhoto.zIndex ?? 0,
      createdAt: new Date(),
    };
    this.pagePhotos.set(id, photo);
    return photo;
  }

  async updatePagePhoto(id: string, update: Partial<InsertPagePhoto>): Promise<PagePhoto | undefined> {
    const photo = this.pagePhotos.get(id);
    if (!photo) return undefined;
    
    const updated: PagePhoto = { ...photo, ...update };
    this.pagePhotos.set(id, updated);
    return updated;
  }

  async deletePagePhoto(id: string): Promise<boolean> {
    return this.pagePhotos.delete(id);
  }

  async getUploadedPhotos(projectId: string): Promise<UploadedPhoto[]> {
    return Array.from(this.uploadedPhotos.values()).filter(
      (photo) => photo.projectId === projectId,
    );
  }

  async getUploadedPhoto(id: string): Promise<UploadedPhoto | undefined> {
    return this.uploadedPhotos.get(id);
  }

  async createUploadedPhoto(insertPhoto: InsertUploadedPhoto): Promise<UploadedPhoto> {
    const id = randomUUID();
    const photo: UploadedPhoto = {
      ...insertPhoto,
      id,
      userId: insertPhoto.userId || null,
      projectId: insertPhoto.projectId || null,
      storageKey: insertPhoto.storageKey ?? null,
      thumbUrl: insertPhoto.thumbUrl ?? null,
      previewUrl: insertPhoto.previewUrl ?? null,
      width: insertPhoto.width ?? null,
      height: insertPhoto.height ?? null,
      sizeBytes: insertPhoto.sizeBytes ?? null,
      uploadedAt: new Date(),
    };
    this.uploadedPhotos.set(id, photo);
    return photo;
  }

  async updateUploadedPhoto(id: string, update: Partial<InsertUploadedPhoto>): Promise<UploadedPhoto | undefined> {
    const photo = this.uploadedPhotos.get(id);
    if (!photo) return undefined;
    const updated: UploadedPhoto = { ...photo, ...update };
    this.uploadedPhotos.set(id, updated);
    return updated;
  }

  async deleteUploadedPhoto(id: string): Promise<boolean> {
    return this.uploadedPhotos.delete(id);
  }
}

/* ── Factory ─────────────────────────────────────────────────────────
   DATABASE_URL set  → Postgres (DrizzleStorage; run `npm run db:push`
                       once to create tables, seeding is automatic)
   DATABASE_URL unset → in-memory (zero-setup dev; data dies with the
                       process — fine for UI work, not for real drafts) */

function createStorage(): IStorage {
  if (process.env.DATABASE_URL) {
    const pg = new DrizzleStorage();
    // fire-and-forget: seeds starter themes into an empty database
    pg.seedIfEmpty().catch((err) => console.error("[storage] theme seeding failed:", err));
    console.log("[storage] using Postgres (DATABASE_URL set)");
    return pg;
  }
  console.log("[storage] using in-memory storage (set DATABASE_URL for persistence)");
  return new MemStorage();
}

export const storage = createStorage();
