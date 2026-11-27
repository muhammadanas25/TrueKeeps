/**
 * Print pipeline — every paid order becomes a checked, stored print PDF,
 * whatever crashes, deploys or outages happen on the way (docs/adr/018).
 *
 * The rule: progress is a database row, not a process. Each order has
 * `print_jobs` rows (one per version); the queue is only the fast path, and
 * the reconciler re-finds anything the fast path dropped.
 *
 * One build (job "print.build", retried 5 times with growing waits):
 *   1. rendering  — cut every placed photo from its HD original
 *                   (server/print/render.ts, writes manifest.json last)
 *   2. composing  — interior.pdf + cover.pdf to a temp folder
 *                   (server/print/pdf.ts), then jpegs.zip: the covers and
 *                   one JPEG per sheet (two pages side by side, for the
 *                   Noritsu), at 300 or 640 dpi, rendered from those two PDFs
 *                   (server/print/jpegs.ts); SHA-256 of each
 *   3. upload     — to an IMMUTABLE key: …/print/<order>/v<version>/<file>.
 *                   A rebuild is a new version; a file a printer downloaded
 *                   is never overwritten, so its checksum always proves it.
 *   4. verifying  — read each file back from storage: size, SHA-256 and page
 *                   count must match what was written. Then the same for the
 *                   backup bucket when one is configured.
 *   5. checked    — only now is the file offered for download or printing;
 *                   staff are told (print_ready); problems are on the order.
 *   Any throw → the attempt and error are saved and the queue retries; after
 *   the last attempt the job is `failed` and staff get print_failed.
 *
 * Safety nets (schedules):
 *   print.reconcile  every 10 min: paid orders with no job get one; jobs
 *                    stuck in a working state for 30 min are re-queued
 *   print.integrity  daily: every checked file of the last 60 days must still
 *                    be in storage at its recorded size; a sample is re-hashed
 *                    in full. A missing/changed file triggers a rebuild.
 */

import { createHash } from "crypto";
import { createReadStream } from "fs";
import { mkdtemp, rm, stat } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { and, desc, eq, gte, inArray, lt, notInArray, sql } from "drizzle-orm";
import { orders, printJobs, type PrintJob, type PrintJobFile } from "@shared/schema";
import type { BuilderDocument } from "@shared/document";
import { PRINT_MAX_ATTEMPTS, type PrintState } from "@shared/ops";
import { storage } from "../storage";
import { backupStore, mediaStore, type MediaStore } from "../media";
import { enqueue, enqueueAsync, register, schedule } from "../jobs";
import { log } from "../logger";
import { opsDb, requireOpsDb } from "../ops/db";
import { notifyOrder } from "../notify/outbox";
import { printPrefix, renderOrder } from "./render";
import { PRINT_SPEC, composeCover, composeInterior } from "./pdf";
import { composeJpegZip, jpegCount } from "./jpegs";
import { getPrintSettings } from "./settings";
import { bookTheme } from "../../client/src/features/builder/palette";

/** Orders in these states should have a print file. */
const PRINTABLE_STATUSES = ["paid", "in_production", "shipped", "delivered"];
const WORKING: PrintState[] = ["queued", "rendering", "composing", "verifying"];

export const versionKey = (projectId: string, orderId: string, version: number, file: string) => `${printPrefix(projectId, orderId)}/v${version}/${file}`;

async function setState(id: string, state: PrintState, patch: Partial<PrintJob> = {}) {
  await requireOpsDb()
    .update(printJobs)
    .set({ ...patch, state, stateChangedAt: new Date(), updatedAt: new Date() })
    .where(eq(printJobs.id, id));
}

/** SHA-256, byte count and PDF page count of a stream. */
async function digest(stream: NodeJS.ReadableStream): Promise<{ sha256: string; bytes: number; pages: number }> {
  const h = createHash("sha256");
  let bytes = 0;
  let pages = 0;
  let tail = "";
  for await (const chunk of stream as AsyncIterable<Buffer>) {
    h.update(chunk);
    bytes += chunk.length;
    // count "/Type /Page" (not "/Pages"); keep a tail so a match split across chunks counts
    const text = tail + chunk.toString("latin1");
    pages += (text.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
    const keep = text.slice(-16);
    pages -= (keep.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
    tail = keep;
  }
  pages += (tail.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
  return { sha256: h.digest("hex"), bytes, pages };
}

/** Upload a local file and prove the stored copy is byte-identical. */
async function storeAndVerify(store: MediaStore, key: string, localPath: string, expected: { sha256: string; bytes: number }, contentType = "application/pdf") {
  await store.putFile(key, localPath, contentType);
  const back = await digest(await store.getStream(key));
  if (back.sha256 !== expected.sha256 || back.bytes !== expected.bytes) {
    throw new Error(`stored copy of ${path.basename(key)} doesn't match (${back.bytes} bytes vs ${expected.bytes})`);
  }
}

/**
 * Make sure an order has a print job, and queue it. Idempotent for the system
 * (a second call returns the existing job); `force` (an admin's "Rebuild")
 * always makes a new version.
 */
export async function startPrintJob(orderId: string, opts: { requestedBy?: string; force?: boolean } = {}): Promise<PrintJob | null> {
  const db = opsDb();
  if (!db) {
    // no database: the renderer alone, as before this pipeline existed
    enqueue("print.render-only", { orderId });
    return null;
  }
  const [latest] = await db.select().from(printJobs).where(eq(printJobs.orderId, orderId)).orderBy(desc(printJobs.version)).limit(1);
  if (latest && !opts.force) {
    if (WORKING.includes(latest.state as PrintState)) await enqueueAsync("print.build", { jobId: latest.id }, { singletonKey: latest.id });
    return latest;
  }
  const [job] = await db
    .insert(printJobs)
    .values({ orderId, version: (latest?.version ?? 0) + 1, requestedBy: opts.requestedBy ?? "system" })
    .onConflictDoNothing()
    .returning();
  if (!job) return latest ?? null; // a concurrent call made it; fine
  await enqueueAsync("print.build", { jobId: job.id }, { singletonKey: job.id });
  return job;
}

async function buildJob(data: unknown): Promise<void> {
  const { jobId } = data as { jobId: string };
  const db = requireOpsDb();
  const [job] = await db.select().from(printJobs).where(eq(printJobs.id, jobId)).limit(1);
  if (!job || job.state === "checked" || job.state === "failed") return;
  const order = await storage.getOrder(job.orderId);
  if (!order) return;

  const attempt = job.attempts + 1;
  const work = await mkdtemp(path.join(tmpdir(), `tk-print-${job.orderId.slice(0, 8)}-`));
  try {
    await setState(job.id, "rendering", { attempts: attempt, lastError: null });
    const manifest = await renderOrder(order.id);

    await setState(job.id, "composing");
    const doc = order.documentSnapshot as BuilderDocument;
    const interiorPath = path.join(work, "interior.pdf");
    const coverPath = path.join(work, "cover.pdf");
    const interior = await composeInterior(doc, manifest, interiorPath);
    const cover = await composeCover(doc, manifest, coverPath);
    const zipPath = path.join(work, "jpegs.zip");
    // one JPEG per sheet (two pages side by side) at the owner's resolution (docs/adr/026)
    const jpegs = await composeJpegZip(interiorPath, coverPath, zipPath, {
      orderNumber: order.orderNumber,
      title: doc.title || "Untitled book",
      dpi: (await getPrintSettings()).sheetDpi,
      paper: bookTheme(doc.themeId, doc.pageColor).page,
      bleedMm: PRINT_SPEC.bleedMm,
    });

    await setState(job.id, "verifying");
    const files: PrintJobFile[] = [];
    for (const [kind, local, pages, file, type] of [
      ["interior", interiorPath, interior.pages, "interior.pdf", "application/pdf"],
      ["cover", coverPath, cover.pages, "cover.pdf", "application/pdf"],
      // "pages" of the ZIP is how many JPEGs it holds (cover front and back + one per sheet)
      ["jpegs", zipPath, jpegs.files, "jpegs.zip", "application/zip"],
    ] as const) {
      const local_ = await digest(createReadStream(local));
      if (type === "application/pdf" && local_.pages !== pages) throw new Error(`${file} has ${local_.pages} pages, expected ${pages}`);
      if (kind === "jpegs" && pages !== jpegCount(interior.pages, cover.pages)) throw new Error(`jpegs.zip holds ${pages} pictures, expected ${jpegCount(interior.pages, cover.pages)}`);
      const key = versionKey(order.projectId, order.id, job.version, file);
      await storeAndVerify(mediaStore, key, local, local_, type);
      let backupKey: string | null = null;
      if (backupStore) {
        await storeAndVerify(backupStore, key, local, local_, type);
        backupKey = key;
      }
      files.push({ kind, key, bytes: (await stat(local)).size, sha256: local_.sha256, pages, backupKey, ...(kind === "jpegs" ? { dpi: jpegs.dpi, sheets: jpegs.sheets } : {}) });
    }

    const problems = [
      ...manifest.problems,
      ...(interior.missing ? [{ page: -1, slot: -1, photoId: "", reason: `${interior.missing} slot(s) printed empty` }] : []),
    ];
    await setState(job.id, "checked", { files, pageCount: interior.pages, lowDpiCount: interior.lowDpi, problems, checkedAt: new Date() });
    await storage.addOrderEvent({
      orderId: order.id,
      kind: "note",
      actor: "system",
      note: `Print file v${job.version} built and checked: ${interior.pages} pages${backupStore ? ", 2 copies stored" : ""}${interior.lowDpi ? `, ${interior.lowDpi} low-resolution photo(s)` : ""}${problems.length ? `, ${problems.length} problem(s)` : ""}`,
    });
    log.info({ orderId: order.id, version: job.version, pages: interior.pages, lowDpi: interior.lowDpi }, "[print] checked");
    void notifyOrder("print_ready", order, { pages: interior.pages });
    if (problems.length) void notifyOrder("print_failed", order, { attempts: attempt, reason: `Built with problems: ${problems.map((p) => p.reason).join("; ").slice(0, 200)}` });
  } catch (err) {
    const reason = (err instanceof Error ? err.message : String(err)).slice(0, 500);
    const final = attempt >= PRINT_MAX_ATTEMPTS;
    await setState(job.id, final ? "failed" : "queued", { attempts: attempt, lastError: reason });
    log.error({ err, orderId: job.orderId, attempt }, "[print] build failed");
    if (final) {
      await storage.addOrderEvent({ orderId: order.id, kind: "note", actor: "system", note: `Print file failed after ${attempt} tries: ${reason}` });
      void notifyOrder("print_failed", order, { attempts: attempt, reason });
      return; // don't let the queue retry past our own limit
    }
    throw err;
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Every 10 minutes: no paid order without a job; no job stuck half-way. */
async function reconcile(): Promise<void> {
  const db = opsDb();
  if (!db) return;
  const missing = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(inArray(orders.status, PRINTABLE_STATUSES), notInArray(orders.id, db.select({ id: printJobs.orderId }).from(printJobs))))
    .limit(50);
  for (const o of missing) await startPrintJob(o.id).catch((err) => log.error({ err, orderId: o.id }, "[print] reconcile start failed"));

  const stuck = await db
    .select({ id: printJobs.id })
    .from(printJobs)
    .where(and(inArray(printJobs.state, WORKING), lt(printJobs.stateChangedAt, new Date(Date.now() - 30 * 60_000))))
    .limit(50);
  for (const j of stuck) await enqueueAsync("print.build", { jobId: j.id }, { singletonKey: j.id });
  if (missing.length || stuck.length) log.warn({ missing: missing.length, stuck: stuck.length }, "[print] reconcile requeued");
}

/** Daily: stored files still there at the recorded size; a sample re-hashed in full. */
async function integrity(): Promise<void> {
  const db = opsDb();
  if (!db) return;
  const jobs = await db
    .select()
    .from(printJobs)
    .where(and(eq(printJobs.state, "checked"), gte(printJobs.checkedAt, new Date(Date.now() - 60 * 86400_000))))
    .orderBy(sql`random()`)
    .limit(500);
  let rehashed = 0;
  for (const job of jobs) {
    for (const f of job.files ?? []) {
      let ok = (await mediaStore.sizeOf(f.key)) === f.bytes;
      if (ok && rehashed < 5) {
        rehashed++;
        ok = (await digest(await mediaStore.getStream(f.key))).sha256 === f.sha256;
      }
      if (!ok) {
        log.error({ orderId: job.orderId, key: f.key }, "[print] stored file missing or changed — rebuilding");
        await storage.addOrderEvent({ orderId: job.orderId, kind: "note", actor: "system", note: `Daily check: ${path.basename(f.key)} v${job.version} missing or changed in storage; rebuilding` });
        await startPrintJob(job.orderId, { force: true, requestedBy: "integrity-check" });
        break;
      }
    }
  }
}

register("print.build", buildJob, { retryLimit: PRINT_MAX_ATTEMPTS - 1, retryDelaySeconds: 60, expireInSeconds: 45 * 60, concurrency: 1 });
register("print.render-only", async (d) => void (await renderOrder((d as { orderId: string }).orderId)), { retryLimit: 2 });
register("print.reconcile", reconcile, { retryLimit: 0, expireInSeconds: 10 * 60 });
register("print.integrity", integrity, { retryLimit: 1, expireInSeconds: 60 * 60 });
schedule("print.reconcile", "*/10 * * * *", 10 * 60_000);
schedule("print.integrity", "30 4 * * *", 24 * 3600_000);
