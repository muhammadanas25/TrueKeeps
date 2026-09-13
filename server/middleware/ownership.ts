/**
 * Ownership assertions — the one place that decides "may this user
 * touch this row".
 *
 * Every project, page, placed photo and upload resolves to an owning
 * user through `projects.user_id`. Handlers call the matching loader,
 * which returns the row when it belongs to the requester (or the
 * requester is admin) and otherwise sends the response itself and
 * returns null. 404 — not 403 — for someone else's row: an ID is not a
 * secret, but we still don't confirm existence to strangers.
 *
 * The page/photo variants walk up to the project with one extra query
 * each; if that ever shows up in profiles the fix is a JOIN in storage,
 * not a shortcut here.
 */

import type { Request, Response } from "express";
import { storage } from "../storage";
import type { PagePhoto, Project, ProjectPage, UploadedPhoto } from "@shared/schema";

function isAdmin(req: Request): boolean {
  return (req.user as { role?: string } | undefined)?.role === "admin";
}

function notFound(res: Response, what: string) {
  res.status(404).json({ error: `${what} not found` });
  return null;
}

export async function loadOwnedProject(req: Request, res: Response, projectId: string): Promise<Project | null> {
  const project = await storage.getProject(projectId);
  if (!project || project.deletedAt) return notFound(res, "Project");
  if (project.userId !== req.user!.id && !isAdmin(req)) return notFound(res, "Project");
  return project;
}

export async function loadOwnedPage(req: Request, res: Response, pageId: string): Promise<ProjectPage | null> {
  const page = await storage.getProjectPage(pageId);
  if (!page) return notFound(res, "Page");
  const project = await loadOwnedProject(req, res, page.projectId);
  return project ? page : null;
}

export async function loadOwnedPagePhoto(req: Request, res: Response, photoId: string): Promise<PagePhoto | null> {
  const photo = await storage.getPagePhoto(photoId);
  if (!photo) return notFound(res, "Photo");
  const page = await loadOwnedPage(req, res, photo.pageId);
  return page ? photo : null;
}

export async function loadOwnedUpload(req: Request, res: Response, uploadId: string): Promise<UploadedPhoto | null> {
  const upload = await storage.getUploadedPhoto(uploadId);
  if (!upload) return notFound(res, "Upload");
  if (upload.userId !== req.user!.id && !isAdmin(req)) return notFound(res, "Upload");
  return upload;
}
