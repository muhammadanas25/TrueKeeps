/**
 * Upload measurements (docs/adr/014).
 *
 *   POST /api/uploads/metrics   the browser reports one batch (requireUser)
 *   GET  /api/admin/upload-stats?days=30   averages to compare by batch size,
 *        photo size and connection (requireAdmin)
 *
 * Each report is stored (upload_batches) and also written to the server log
 * as `[uploads] batch`, so a quick look in Railway's logs needs no database.
 * Reports hold measurements only; the schema rejects anything else.
 */

import { Router } from "express";
import { z } from "zod";
import type { UploadBatch } from "@shared/schema";
import { storage } from "../storage";
import { log } from "../logger";
import { currentUser, requireAdmin, requireUser } from "../middleware/auth";
import { uploadLimiter } from "../middleware/rate-limit";
import { asyncHandler, parse } from "./helpers";

export const uploadMetricsRouter = Router();

const ms = z.number().int().min(0).max(7 * 24 * 3600 * 1000).nullable().optional();
const bytes = z.number().int().min(0).max(50e9);

const reportSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().max(64).nullable().optional(),
  status: z.enum(["complete", "unfinished"]),
  kind: z.enum(["new", "resume"]),
  photoCount: z.number().int().min(0).max(1000),
  rejectedCount: z.number().int().min(0).max(1000),
  duplicateCount: z.number().int().min(0).max(1000),
  heicCount: z.number().int().min(0).max(1000),
  sourceBytes: bytes,
  originalBytes: bytes,
  displayBytes: bytes,
  firstInBookMs: ms,
  allInBookMs: ms,
  allHdMs: ms,
  hdMbps: z.number().min(0).max(10_000).nullable().optional(),
  retries: z.number().int().min(0).max(100_000),
  stalls: z.number().int().min(0).max(100_000),
  connection: z.string().max(16).nullable().optional(),
  downlinkMbps: z.number().min(0).max(10_000).nullable().optional(),
  deviceMemoryGb: z.number().min(0).max(1024).nullable().optional(),
  cpuCores: z.number().int().min(0).max(1024).nullable().optional(),
  mobile: z.boolean().nullable().optional(),
  browser: z.string().max(24).nullable().optional(),
  /** [sourceKB, megapixels, prepareMs, displayMs, originalMs, type] per photo */
  photos: z
    .array(z.tuple([z.number(), z.number(), z.number().nullable(), z.number().nullable(), z.number().nullable(), z.string().max(8)]))
    .max(1000),
});

uploadMetricsRouter.post(
  "/api/uploads/metrics",
  requireUser,
  uploadLimiter,
  asyncHandler(async (req, res) => {
    const body = parse(reportSchema, req.body, res);
    if (!body) return;
    await storage.saveUploadBatch({ ...body, userId: currentUser(req).id, projectId: body.projectId ?? null });
    const { photos, ...summary } = body;
    log.info({ ...summary, photoRows: photos.length }, "[uploads] batch");
    res.status(204).send();
  }),
);

/** Groups for comparison: how many photos, and how big they were on average. */
function countBucket(n: number): string {
  if (n <= 10) return "1-10";
  if (n <= 50) return "11-50";
  if (n <= 150) return "51-150";
  return "151+";
}
function sizeBucket(avgMb: number): string {
  if (avgMb < 1) return "<1 MB";
  if (avgMb < 3) return "1-3 MB";
  if (avgMb < 6) return "3-6 MB";
  return "6+ MB";
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

function summarise(rows: UploadBatch[]) {
  const done = rows.filter((r) => r.status === "complete");
  const nums = (pick: (r: UploadBatch) => number | null | undefined, from = done) =>
    from.map(pick).filter((v): v is number => typeof v === "number");
  const round = (v: number | null, d = 1) => (v === null ? null : Math.round(v * 10 ** d) / 10 ** d);
  return {
    batches: rows.length,
    unfinished: rows.length - done.length,
    photos: rows.reduce((a, r) => a + r.photoCount, 0),
    avgMbPerPhoto: round(mean(nums((r) => (r.photoCount ? r.sourceBytes / r.photoCount / 1048576 : null), rows)), 2),
    medianSecondsToBook: round((median(nums((r) => r.allInBookMs)) ?? NaN) / 1000),
    medianSecondsToHd: round((median(nums((r) => r.allHdMs)) ?? NaN) / 1000),
    medianSecondsToHdPerPhoto: round(median(nums((r) => (r.allHdMs && r.photoCount ? r.allHdMs / r.photoCount / 1000 : null))), 2),
    avgHdMbps: round(mean(nums((r) => r.hdMbps))),
    retriesPerBatch: round(mean(nums((r) => r.retries, rows))),
    stallsPerBatch: round(mean(nums((r) => r.stalls, rows))),
  };
}

function groupBy(rows: UploadBatch[], key: (r: UploadBatch) => string) {
  const groups = new Map<string, UploadBatch[]>();
  rows.forEach((r) => groups.set(key(r), [...(groups.get(key(r)) ?? []), r]));
  return Object.fromEntries(Array.from(groups.entries()).map(([k, v]) => [k, summarise(v)]));
}

uploadMetricsRouter.get(
  "/api/admin/upload-stats",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
    const rows = await storage.listUploadBatches(new Date(Date.now() - days * 86400_000), 5000);
    res.json({
      days,
      overall: summarise(rows),
      byPhotoCount: groupBy(rows, (r) => countBucket(r.photoCount)),
      byPhotoSize: groupBy(rows, (r) => sizeBucket(r.photoCount ? r.sourceBytes / r.photoCount / 1048576 : 0)),
      byConnection: groupBy(rows, (r) => r.connection ?? "unknown"),
      byDevice: groupBy(rows, (r) => (r.mobile === null ? "unknown" : r.mobile ? "phone" : "computer")),
      recent: rows.slice(0, 20).map(({ photos: _p, userId: _u, ...r }) => r),
    });
  }),
);
