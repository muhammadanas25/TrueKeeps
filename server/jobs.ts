/**
 * Background jobs — a durable queue + the image derivative pipeline.
 *
 * Queue design (docs/adr/003, upgraded by docs/adr/018):
 *  - With DATABASE_URL, jobs live in Postgres through pg-boss. A job sent
 *    just before a deploy or a crash is still there afterwards and runs when
 *    the server is back; failures retry with growing waits; recurring work
 *    (sweeps, the print reconciler, the daily summary) runs on a cron that
 *    pg-boss keeps to one run per tick however many servers are up.
 *  - Without a database (zero-setup dev) the same surface runs in memory,
 *    with the same retries, and loses jobs on restart as it always did.
 *
 * Call sites only ever see `register`, `enqueue` and `schedule`, so they
 * don't know which one is running. Handlers are registered when their module
 * is imported; `startJobs()` (server/index.ts, after the server listens)
 * connects pg-boss and starts the workers. Jobs enqueued before that are
 * held and sent once it's up.
 *
 * A handler must be safe to run twice: pg-boss guarantees at-least-once,
 * not exactly-once (a crash after the work but before the "done" write
 * repeats it). Every handler here is written that way.
 *
 * The one job today — "media.derivatives" — is the image pipeline. The
 * builder no longer uses it: the browser makes its own display copies, so
 * the server never has to decode thousands of full-size photos. It remains
 * for the canvas editor (/create), which uploads only the original:
 *   1. read original bytes from the media store
 *   2. sharp().rotate()  → applies EXIF orientation (phone photos
 *      otherwise render sideways in the book)
 *   3. probe rotated dimensions (needed for print preflight later)
 *   4. emit two webp derivatives next to the original:
 *        <key>.thumb.webp   (~400px, grids/thumbnail rails)
 *        <key>.preview.webp (~1600px, book preview spreads)
 *   5. PATCH the uploaded_photos row with URLs + dimensions
 * Clients keep working if this fails — they fall back to the original
 * URL until thumbUrl/previewUrl appear.
 */

import sharp, { type Metadata } from "sharp";
import PgBoss from "pg-boss";
import { derivativeKey, mediaStore, mediaUrl } from "./media";
import { storage } from "./storage";
import { config } from "./config";
import { log } from "./logger";
import { record as recordTiming } from "./analytics/latency";

/* ── Queue ──────────────────────────────────────────────────── */

type JobHandler = (payload: unknown) => Promise<void>;

export interface JobOptions {
  /** retries after the first failure (default 4, so 5 tries in all) */
  retryLimit?: number;
  /** first retry wait; doubles each time (default 30 s) */
  retryDelaySeconds?: number;
  /** a run longer than this is treated as failed and retried (default 15 min) */
  expireInSeconds?: number;
  /** jobs of this kind running at once in this process (default 1) */
  concurrency?: number;
}

export interface SendOptions {
  /** at most one queued job per key (e.g. one render per order) */
  singletonKey?: string;
  startAfterSeconds?: number;
}

interface Definition {
  handler: JobHandler;
  opts: Required<JobOptions>;
}

const defs = new Map<string, Definition>();
const schedules: Array<{ name: string; cron: string; everyMs: number }> = [];

let boss: PgBoss | null = null;
let started = false;
/** jobs sent before pg-boss was up; flushed by startJobs */
const early: Array<{ name: string; payload: unknown; opts?: SendOptions }> = [];

/** Register a job handler. Modules register their own jobs on import. */
export function register(name: string, handler: JobHandler, opts: JobOptions = {}): void {
  // time every run for Admin → Analytics → Speed ("JOB print.build" etc.)
  const timed: JobHandler = async (payload) => {
    const start = Date.now();
    try {
      await handler(payload);
      recordTiming(`JOB ${name}`, Date.now() - start, false);
    } catch (err) {
      recordTiming(`JOB ${name}`, Date.now() - start, true);
      throw err;
    }
  };
  defs.set(name, {
    handler: timed,
    opts: {
      retryLimit: opts.retryLimit ?? 4,
      retryDelaySeconds: opts.retryDelaySeconds ?? 30,
      expireInSeconds: opts.expireInSeconds ?? 15 * 60,
      concurrency: opts.concurrency ?? 1,
    },
  });
}

/**
 * Run `name` on a schedule. `cron` is used with pg-boss (Pakistan time);
 * `everyMs` is the in-memory fallback's plain interval.
 */
export function schedule(name: string, cron: string, everyMs: number): void {
  schedules.push({ name, cron, everyMs });
}

/** Queue a job and wait until it's safely stored (Postgres) or accepted (memory). */
export async function enqueueAsync(name: string, payload: unknown, opts?: SendOptions): Promise<void> {
  if (!defs.has(name)) throw new Error(`[jobs] no handler registered for "${name}"`);
  if (boss) {
    await boss.send(name, (payload ?? {}) as object, {
      ...(opts?.singletonKey ? { singletonKey: opts.singletonKey } : {}),
      ...(opts?.startAfterSeconds ? { startAfter: opts.startAfterSeconds } : {}),
    });
    return;
  }
  if (config.databaseUrl && !started) {
    early.push({ name, payload, opts });
    return;
  }
  memoryRun(name, payload, 0, opts?.startAfterSeconds ? opts.startAfterSeconds * 1000 : 0);
}

/** Fire-and-forget form for call sites that can't wait. Failures to queue are logged. */
export function enqueue(name: string, payload: unknown, opts?: SendOptions): void {
  void enqueueAsync(name, payload, opts).catch((err) => log.error({ err, job: name }, "[jobs] could not queue"));
}

/* In-memory runner: same retry rules, bounded concurrency per job kind. */
const running = new Map<string, number>();
const waiting = new Map<string, Array<() => void>>();

function memoryRun(name: string, payload: unknown, attempt: number, delayMs: number) {
  const def = defs.get(name)!;
  const go = () => {
    const n = running.get(name) ?? 0;
    if (n >= def.opts.concurrency) {
      const q = waiting.get(name) ?? [];
      q.push(go);
      waiting.set(name, q);
      return;
    }
    running.set(name, n + 1);
    def
      .handler(payload)
      .catch((err) => {
        if (attempt < def.opts.retryLimit) {
          const wait = def.opts.retryDelaySeconds * 1000 * 2 ** attempt;
          log.warn({ err, job: name, attempt: attempt + 1, retryInMs: wait }, "[jobs] failed, will retry");
          memoryRun(name, payload, attempt + 1, wait);
        } else {
          log.error({ err, job: name }, "[jobs] failed permanently");
        }
      })
      .finally(() => {
        running.set(name, (running.get(name) ?? 1) - 1);
        waiting.get(name)?.shift()?.();
      });
  };
  if (delayMs > 0) setTimeout(go, delayMs).unref();
  else queueMicrotask(go);
}

/**
 * Start the workers. With a database: connect pg-boss (it creates and
 * upgrades its own `pgboss` schema), make each queue with its retry policy,
 * start workers, register schedules and send any jobs queued during boot.
 */
export async function startJobs(): Promise<void> {
  if (started) return;
  started = true;
  if (!config.databaseUrl) {
    for (const s of schedules) {
      const t = setInterval(() => memoryRun(s.name, {}, defs.get(s.name)!.opts.retryLimit, 0), s.everyMs);
      t.unref();
    }
    log.info({ jobs: Array.from(defs.keys()) }, "[jobs] in-memory queue running (no DATABASE_URL)");
    return;
  }

  const b = new PgBoss({ connectionString: config.databaseUrl, max: 4, application_name: "truekeeps-jobs" });
  b.on("error", (err) => log.error({ err }, "[jobs] pg-boss error"));
  await b.start();

  for (const [name, def] of Array.from(defs.entries())) {
    const queue = {
      name,
      retryLimit: def.opts.retryLimit,
      retryDelay: def.opts.retryDelaySeconds,
      retryBackoff: true,
      expireInSeconds: def.opts.expireInSeconds,
    };
    if (await b.getQueue(name)) await b.updateQueue(name, queue);
    else await b.createQueue(name, queue);
    for (let i = 0; i < def.opts.concurrency; i++) {
      await b.work(name, { batchSize: 1, pollingIntervalSeconds: 2 }, async ([job]) => {
        await def.handler(job.data);
      });
    }
  }
  for (const s of schedules) await b.schedule(s.name, s.cron, {}, { tz: "Asia/Karachi" });

  boss = b;
  for (const j of early.splice(0)) await enqueueAsync(j.name, j.payload, j.opts).catch((err) => log.error({ err, job: j.name }, "[jobs] could not queue"));
  log.info({ jobs: Array.from(defs.keys()), schedules: schedules.map((s) => `${s.name} ${s.cron}`) }, "[jobs] pg-boss running");
}

/** Let running jobs finish (up to 20 s) before the process exits. */
export async function stopJobs(): Promise<void> {
  if (boss) await boss.stop({ graceful: true, timeout: 20_000 }).catch(() => undefined);
}

/* ── Image derivative pipeline ──────────────────────────────── */

export interface DerivativesPayload {
  photoId: string;
  storageKey: string;
}

const THUMB_WIDTH = 400;
const PREVIEW_WIDTH = 1600;

async function makeDerivatives(payload: unknown): Promise<void> {
  const { photoId, storageKey } = payload as DerivativesPayload;
  const original = await mediaStore.get(storageKey);

  // .rotate() with no args = apply EXIF orientation, then strip it.
  const base = sharp(original).rotate();
  let meta: Metadata;
  try {
    meta = await base.metadata();
  } catch (err) {
    // Not an image sharp can decode (mislabelled file, corrupt upload).
    // Mark it so the client can show a "couldn't use this photo" tile and
    // the print pipeline never tries to place it. Don't retry — it won't
    // become an image on the second attempt.
    await storage.updateUploadedPhoto(photoId, { status: "invalid" });
    console.warn(`[jobs] media.derivatives: undecodable upload ${photoId}:`, err);
    return;
  }

  const [thumb, preview] = await Promise.all([
    base.clone().resize({ width: THUMB_WIDTH, withoutEnlargement: true }).webp({ quality: 78 }).toBuffer(),
    base.clone().resize({ width: PREVIEW_WIDTH, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer(),
  ]);

  const thumbKey = derivativeKey(storageKey, "thumb");
  const previewKey = derivativeKey(storageKey, "preview");
  await Promise.all([
    mediaStore.put(thumbKey, thumb, "image/webp"),
    mediaStore.put(previewKey, preview, "image/webp"),
  ]);

  await storage.updateUploadedPhoto(photoId, {
    thumbUrl: mediaUrl(thumbKey),
    previewUrl: mediaUrl(previewKey),
    // metadata() reports the file's stored size even after .rotate(), which is
    // sideways for most phone portraits; autoOrient is the size as displayed.
    width: meta.autoOrient?.width ?? meta.width ?? null,
    height: meta.autoOrient?.height ?? meta.height ?? null,
    status: "ready",
  });
}

// CPU-bound: two at a time, as before; an undecodable file never retries (handled inside)
register("media.derivatives", makeDerivatives, { concurrency: 2, retryLimit: 2 });
