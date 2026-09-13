/**
 * DrizzleStorage — the Postgres implementation of IStorage.
 *
 * Sits behind the same repository interface as MemStorage, so routes
 * and services never know which backend is live (the factory in
 * storage.ts picks by DATABASE_URL — see docs/adr/001).
 *
 * Query discipline:
 *  - every list method filters by an indexed FK column and sorts in SQL
 *  - getProjectFull() is the N+1 killer: loading a whole book is a
 *    FIXED number of queries (project → pages → photos-by-page-ids →
 *    uploads) regardless of page count, using inArray for the fan-out
 *  - updates use .returning() so callers get the fresh row without a
 *    second round trip
 *
 * Theme seeding: on first boot against an empty themes table we insert
 * the same starter set MemStorage uses, so a fresh database behaves
 * exactly like a fresh dev server.
 */

import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  themes,
  projects,
  projectPages,
  pagePhotos,
  uploadedPhotos,
  users,
  type User,
  type Theme,
  type InsertTheme,
  type Project,
  type NewProject,
  type UpdateProject,
  type ProjectPage,
  type InsertProjectPage,
  type PagePhoto,
  type InsertPagePhoto,
  type UploadedPhoto,
  type InsertUploadedPhoto,
} from "@shared/schema";
import type { BuilderDocument } from "@shared/document";
import { getDb } from "./db";
import { SEED_THEMES, denormalise, type IStorage, type ProjectFull, type ProjectSummary, type SaveDocumentResult } from "./storage";

export class DrizzleStorage implements IStorage {
  private db = getDb();

  /** Insert starter themes if the table is empty (idempotent). */
  async seedIfEmpty(): Promise<void> {
    const existing = await this.db.select({ id: themes.id }).from(themes).limit(1);
    if (existing.length === 0) {
      await this.db.insert(themes).values(SEED_THEMES);
    }
  }

  /* ── users ────────────────────────────────────────── */

  async getUser(id: string): Promise<User | undefined> {
    const rows = await this.db.select().from(users).where(eq(users.id, id));
    return rows[0];
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const rows = await this.db.select().from(users).where(eq(users.email, email.toLowerCase()));
    return rows[0];
  }

  /** One transaction: projects + uploads change hands together or not at all. */
  async reassignOwner(fromUserId: string, toUserId: string): Promise<number> {
    return this.db.transaction(async (tx) => {
      const p = await tx
        .update(projects)
        .set({ userId: toUserId, claimTokenHash: null, updatedAt: new Date() })
        .where(eq(projects.userId, fromUserId))
        .returning({ id: projects.id });
      const u = await tx
        .update(uploadedPhotos)
        .set({ userId: toUserId })
        .where(eq(uploadedPhotos.userId, fromUserId))
        .returning({ id: uploadedPhotos.id });
      return p.length + u.length;
    });
  }

  async updateUser(id: string, patch: Partial<Pick<User, "marketingOptOut" | "phone" | "lastSeenAt" | "name">>): Promise<User | undefined> {
    const rows = await this.db.update(users).set({ ...patch, updatedAt: new Date() }).where(eq(users.id, id)).returning();
    return rows[0];
  }

  /* ── themes ───────────────────────────────────────── */

  async getThemes(): Promise<Theme[]> {
    return this.db.select().from(themes);
  }

  async getThemesByCategory(category: string): Promise<Theme[]> {
    return this.db.select().from(themes).where(eq(themes.category, category));
  }

  async getTheme(id: string): Promise<Theme | undefined> {
    const rows = await this.db.select().from(themes).where(eq(themes.id, id));
    return rows[0];
  }

  async createTheme(theme: InsertTheme): Promise<Theme> {
    const rows = await this.db.insert(themes).values(theme).returning();
    return rows[0];
  }

  /* ── projects ─────────────────────────────────────── */

  async getProject(id: string): Promise<Project | undefined> {
    const rows = await this.db.select().from(projects).where(eq(projects.id, id));
    return rows[0];
  }

  /**
   * "My books" list: one query with a lateral-free correlated subquery
   * pair for cover + count. Deliberately excludes `document` (can be
   * 100s of KB per row) — the list never needs it.
   */
  async listProjectSummaries(userId: string): Promise<ProjectSummary[]> {
    // NB: inside a correlated subquery drizzle renders `${projects.id}` as a
    // bare "id", which Postgres binds to the INNER table. Qualify it by hand.
    const outerId = sql.raw(`"projects"."id"`);
    const coverSql = sql<string | null>`(
      select coalesce(u.thumb_url, u.preview_url, u.url)
      from uploaded_photos u
      where u.project_id = ${outerId}
      order by u.uploaded_at asc
      limit 1
    )`;
    const countSql = sql<number>`(select count(*)::int from uploaded_photos u where u.project_id = ${outerId})`;
    return this.db
      .select({
        id: projects.id,
        name: projects.name,
        status: projects.status,
        occasion: projects.occasion,
        themeKey: projects.themeKey,
        coverUrl: coverSql,
        photoCount: countSql,
        updatedAt: projects.updatedAt,
        createdAt: projects.createdAt,
      })
      .from(projects)
      .where(and(eq(projects.userId, userId), isNull(projects.deletedAt)))
      .orderBy(desc(projects.updatedAt));
  }

  async createProject(project: NewProject): Promise<Project> {
    const rows = await this.db.insert(projects).values(project).returning();
    return rows[0];
  }

  async updateProject(id: string, update: UpdateProject): Promise<Project | undefined> {
    const rows = await this.db
      .update(projects)
      .set({ ...update, updatedAt: new Date() })
      .where(and(eq(projects.id, id), isNull(projects.deletedAt)))
      .returning();
    return rows[0];
  }

  /**
   * Compare-and-set on document_version: the WHERE clause carries the
   * expected version, so two tabs saving at once can never interleave —
   * the loser gets zero rows back and we report the conflict with the
   * current row so the client can reconcile.
   */
  async updateProjectDocument(id: string, document: BuilderDocument, expectedVersion: number): Promise<SaveDocumentResult> {
    const rows = await this.db
      .update(projects)
      .set({
        ...denormalise(document),
        document,
        documentVersion: sql`${projects.documentVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(projects.id, id), eq(projects.documentVersion, expectedVersion), isNull(projects.deletedAt)))
      .returning();
    if (rows[0]) return { ok: true, project: rows[0] };
    const current = await this.getProject(id);
    if (!current || current.deletedAt) return { ok: false, reason: "not_found" };
    return { ok: false, reason: "conflict", project: current };
  }

  /**
   * Claim = "this browser created it as a guest and lost the cookie".
   * Once a MEMBER owns the project the token is dead: a leaked
   * localStorage must never pull a book out of someone's account.
   */
  async claimProject(id: string, claimTokenHash: string, userId: string): Promise<Project | undefined> {
    return this.db.transaction(async (tx) => {
      const ownerIsGuest = sql`exists (select 1 from ${users} u where u.id = ${projects.userId} and u.is_anonymous = true)`;
      const rows = await tx
        .update(projects)
        .set({ userId, claimTokenHash: null, updatedAt: new Date() })
        .where(and(eq(projects.id, id), eq(projects.claimTokenHash, claimTokenHash), isNull(projects.deletedAt), ownerIsGuest))
        .returning();
      const project = rows[0];
      if (!project) return undefined;
      await tx.update(uploadedPhotos).set({ userId }).where(eq(uploadedPhotos.projectId, id));
      return project;
    });
  }

  async deleteProject(id: string): Promise<boolean> {
    const rows = await this.db
      .update(projects)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(projects.id, id), isNull(projects.deletedAt)))
      .returning({ id: projects.id });
    return rows.length > 0;
  }

  /**
   * Whole book in a fixed number of queries (no N+1):
   * 1 project + 1 pages + 1 photos-for-all-pages (inArray) + 1 uploads.
   */
  async getProjectFull(id: string): Promise<ProjectFull | undefined> {
    const project = await this.getProject(id);
    if (!project) return undefined;
    const pages = await this.getProjectPages(id);
    const pageIds = pages.map((p) => p.id);
    const photos =
      pageIds.length === 0
        ? []
        : await this.db
            .select()
            .from(pagePhotos)
            .where(inArray(pagePhotos.pageId, pageIds))
            .orderBy(asc(pagePhotos.zIndex));
    const uploads = await this.getUploadedPhotos(id);
    return { project, pages, pagePhotos: photos, uploadedPhotos: uploads };
  }

  /* ── project pages ────────────────────────────────── */

  async getProjectPages(projectId: string): Promise<ProjectPage[]> {
    return this.db
      .select()
      .from(projectPages)
      .where(eq(projectPages.projectId, projectId))
      .orderBy(asc(projectPages.pageNumber));
  }

  async getProjectPage(id: string): Promise<ProjectPage | undefined> {
    const rows = await this.db.select().from(projectPages).where(eq(projectPages.id, id));
    return rows[0];
  }

  async createProjectPage(page: InsertProjectPage): Promise<ProjectPage> {
    const rows = await this.db.insert(projectPages).values(page).returning();
    return rows[0];
  }

  async updateProjectPage(id: string, update: Partial<InsertProjectPage>): Promise<ProjectPage | undefined> {
    const rows = await this.db.update(projectPages).set(update).where(eq(projectPages.id, id)).returning();
    return rows[0];
  }

  async deleteProjectPage(id: string): Promise<boolean> {
    const rows = await this.db.delete(projectPages).where(eq(projectPages.id, id)).returning({ id: projectPages.id });
    return rows.length > 0;
  }

  /* ── page photos ──────────────────────────────────── */

  async getPagePhotos(pageId: string): Promise<PagePhoto[]> {
    return this.db.select().from(pagePhotos).where(eq(pagePhotos.pageId, pageId)).orderBy(asc(pagePhotos.zIndex));
  }

  async getPagePhoto(id: string): Promise<PagePhoto | undefined> {
    const rows = await this.db.select().from(pagePhotos).where(eq(pagePhotos.id, id));
    return rows[0];
  }

  async createPagePhoto(photo: InsertPagePhoto): Promise<PagePhoto> {
    const rows = await this.db.insert(pagePhotos).values(photo).returning();
    return rows[0];
  }

  async updatePagePhoto(id: string, update: Partial<InsertPagePhoto>): Promise<PagePhoto | undefined> {
    const rows = await this.db.update(pagePhotos).set(update).where(eq(pagePhotos.id, id)).returning();
    return rows[0];
  }

  async deletePagePhoto(id: string): Promise<boolean> {
    const rows = await this.db.delete(pagePhotos).where(eq(pagePhotos.id, id)).returning({ id: pagePhotos.id });
    return rows.length > 0;
  }

  /* ── uploaded photos ──────────────────────────────── */

  async getUploadedPhotos(projectId: string): Promise<UploadedPhoto[]> {
    return this.db.select().from(uploadedPhotos).where(eq(uploadedPhotos.projectId, projectId));
  }

  async getUploadedPhoto(id: string): Promise<UploadedPhoto | undefined> {
    const rows = await this.db.select().from(uploadedPhotos).where(eq(uploadedPhotos.id, id));
    return rows[0];
  }

  async createUploadedPhoto(photo: InsertUploadedPhoto): Promise<UploadedPhoto> {
    const rows = await this.db.insert(uploadedPhotos).values(photo).returning();
    return rows[0];
  }

  async updateUploadedPhoto(id: string, update: Partial<InsertUploadedPhoto>): Promise<UploadedPhoto | undefined> {
    const rows = await this.db.update(uploadedPhotos).set(update).where(eq(uploadedPhotos.id, id)).returning();
    return rows[0];
  }

  async deleteUploadedPhoto(id: string): Promise<boolean> {
    const rows = await this.db
      .delete(uploadedPhotos)
      .where(eq(uploadedPhotos.id, id))
      .returning({ id: uploadedPhotos.id });
    return rows.length > 0;
  }
}
