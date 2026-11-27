/**
 * Upload engine — gets every photo from the customer's phone to the media
 * store, without ever making them wait for it.
 *
 * The problem: a 200-photo book of HD originals is about 900 MB. On a 5.6 Mbps
 * connection, typical for mobile data in Pakistan, that takes about 22 minutes
 * however it's scheduled. Measured: 1, 3 and 6 parallel uploads took 138s,
 * 133.5s and 133.5s for the same 20 photos, because the phone's connection is
 * the limit. So the fix isn't speed but order.
 *
 * Approach, three lanes:
 *   1. PREPARE (2 at a time): make the display copy and thumbnail in a worker.
 *      The photo is usable in the book from this moment.
 *   2. DISPLAY (3 at a time): upload those two small copies, about 250 KB, so
 *      the book exists on the server and survives a reload.
 *   3. ORIGINAL (2 at a time): upload the HD copy we print from. That is the
 *      file itself, or a quality 0.95 re-save of it when print-copy.ts says
 *      that can't cost any quality (about half the bytes; docs/adr/023). The
 *      re-save happens here, just before the upload, so it never delays the
 *      book. This lane only runs while lanes 1 and 2 are empty, so adding
 *      more photos during a long HD upload still feels instant.
 * Three and two rather than more because more gained nothing in the test
 * above, and a few at once stops one stuck file blocking the others.
 *
 * Failure: a photo that can't be read is taken out of the book and named to
 * the customer. A network failure is never final: the attempt is retried with
 * growing gaps for as long as the page is open, and resumes at once when the
 * connection returns. A request that simply hangs, which mobile data does, is
 * treated as a failure too; otherwise one stuck photo would stop the whole
 * queue, since originals wait for the fast lanes to empty.
 * There is deliberately no fallback that keeps a photo only in this tab,
 * because that used to mean a photo could silently miss the printed book.
 *
 * It lives outside React so uploads carry on through route changes, on every
 * page of the site (owner, 2026-11-27: opening another page paused them).
 * While no builder is mounted, photo updates are held and delivered when one
 * returns; only a photo whose book has no project yet waits for the builder.
 *
 * Surviving a closed tab: each photo is also copied into the browser's
 * private file storage (stash.ts) until its HD copy is up, with a list of
 * what's there (pending.ts). The next page load anywhere on the site calls
 * claim(), which carries on by itself. One tab at a time does this, using a
 * Web Lock, so two open tabs never upload the same photo twice. Where the
 * storage isn't available, photos are matched again by fingerprint when the
 * customer re-picks them, as before.
 */

import { originalUrlOf } from "@shared/media";
import { apiRequest } from "@/lib/queryClient";
import type { BuilderPhoto } from "../data";
import { preparePhotoOffThread, prepareConcurrency, printCopyOffThread } from "./pool";
import { setLocalPreview } from "./previews";
import type { PreparedPhoto } from "./prepare";
import { BatchTracker } from "./metrics";
import { HEADER_BYTES, readJpegInfo } from "./jpeg-info";
import { PRINT_QUALITY, MAX_COPY_FRACTION, expectedPrintBytes, printPlan, type PrintPlan } from "./print-copy";
import { stashClear, stashGet, stashPut, stashRemove } from "./stash";
import { clearPending, isPending, listPending, removePending, updatePending, writePending, type PendingEntry } from "./pending";

const DISPLAY_CONCURRENCY = 3;
const ORIGINAL_CONCURRENCY = 2;
/** Seconds to wait before each retry; the last repeats for as long as it takes. */
const BACKOFF_S = [2, 5, 15, 30, 60];
/** From this attempt on, tell the customer it's the connection and offer a retry. */
const OFFLINE_AFTER_ATTEMPTS = 3;
/**
 * A transfer with no progress for this long is abandoned and retried. Not a
 * total time limit: a 50 MB original on slow data can rightly take many minutes.
 */
const STALL_MS = 45_000;
/** The API calls are tiny, so they get a plain limit. */
const API_TIMEOUT_MS = 30_000;
/** Decoding is CPU only, so this is generous, but a wedged worker must not hold its slot forever. */
const PREPARE_TIMEOUT_MS = 180_000;
/** Must match MAX_UPLOAD_BYTES on the server. Above this we send a full-size JPEG instead. */
const MAX_ORIGINAL_BYTES = 50 * 1024 * 1024;
/** Bytes of each file hashed for its fingerprint. Enough to tell photos apart; instant to read. */
const FINGERPRINT_BYTES = 64 * 1024;
const ORIGINAL_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"]);

type Stage = "queued" | "preparing" | "prepared" | "uploading-display" | "in" | "uploading-original" | "done";

interface Item {
  id: string;
  file: File;
  fp: string;
  stage: Stage;
  /** what to send for printing (print-copy.ts) */
  plan: PrintPlan;
  /** the book's project, when known before the builder says (a photo carried over from an earlier visit) */
  projectId: string | null;
  /** blob to send as the original: the file itself, unless it was converted or re-saved */
  original?: Blob;
  prepared?: PreparedPhoto;
  key?: string;
  /** bytes of the original sent so far, for the time estimate */
  sent: number;
  attempts: number;
  retryAt: number;
  /** the batch this photo was picked in, for upload measurements */
  batch: BatchTracker;
}

/** Things worth telling the customer about the photos they chose. */
export interface PhotoNotices {
  whatsapp: number;
  screenshots: number;
  dark: number;
  small: number;
}

export interface UploadSnapshot {
  /** bumps on every change */
  version: number;
  /** anything left to do this session */
  active: boolean;
  /** photos still being prepared or sent as display copies */
  displayPending: number;
  /** originals queued or sending that this tab still holds the file for */
  originalsPending: number;
  /** waiting on a connection */
  offline: boolean;
  /** seconds until the last original lands, once there is enough data to guess */
  etaSeconds: number | null;
  rejected: string[];
  duplicates: number;
  notices: PhotoNotices;
  /** photos carried over from an earlier visit by claim(): how many, and how many are still going */
  restored: { total: number; left: number } | null;
  /** HD bytes sent so far this visit, to tell a paused upload from a slow one */
  sentBytes: number;
}

/** What add() passes to makePhoto, read from the file's header. */
export interface PhotoMeta {
  /** when the photo was taken (EXIF), local time in ms */
  taken?: number;
}

/** What the builder shell supplies so the engine can reach its state. */
export interface EngineHost {
  ensureProject: () => Promise<string>;
  /** the book's project, if it has one yet (for measurements only) */
  projectId: () => string | null;
  patchPhoto: (id: string, patch: Partial<BuilderPhoto>) => void;
  removePhoto: (id: string) => void;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    /** true when we gave up on a transfer that had stopped making progress */
    readonly stalled = false,
  ) {
    super(`upload failed (${status})`);
  }
}

/** PUT with byte progress. XHR because fetch can't report upload progress. */
function put(url: string, headers: Record<string, string>, body: Blob, onProgress?: (loaded: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let watchdog: ReturnType<typeof setTimeout>;
    const stop = () => clearTimeout(watchdog);
    const alive = () => {
      stop();
      watchdog = setTimeout(() => {
        xhr.abort();
        reject(new HttpError(0, true));
      }, STALL_MS);
    };
    xhr.open("PUT", url);
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.upload.onprogress = (e) => {
      alive();
      onProgress?.(e.loaded);
    };
    xhr.onload = () => {
      stop();
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new HttpError(xhr.status));
    };
    xhr.onerror = () => {
      stop();
      reject(new HttpError(0));
    };
    alive();
    xhr.send(body);
  });
}

/** Reject if `work` hasn't settled in time. The work itself is left to finish or fail. */
function withTimeout<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what} timed out`)), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

async function post<T>(url: string, data: unknown): Promise<T> {
  return withTimeout(
    apiRequest("POST", url, data).then((res) => res.json() as Promise<T>),
    API_TIMEOUT_MS,
    url,
  );
}

/** Stable id for a file's contents: same photo, same fingerprint, whatever it's called. */
export async function fingerprint(file: File): Promise<string> {
  return fingerprintOf(file, await file.slice(0, FINGERPRINT_BYTES).arrayBuffer());
}

/** The fingerprint from a header already read. Only the first FINGERPRINT_BYTES count, so it matches fingerprint(). */
async function fingerprintOf(file: File, header: ArrayBuffer): Promise<string> {
  const head = header.byteLength > FINGERPRINT_BYTES ? header.slice(0, FINGERPRINT_BYTES) : header;
  if (crypto.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", head);
    const hex = Array.from(new Uint8Array(digest).slice(0, 8), (b) => b.toString(16).padStart(2, "0")).join("");
    return `${file.size.toString(36)}-${hex}`.slice(0, 32);
  }
  // crypto.subtle needs HTTPS; plain-http dev gets a smaller hash
  let h = 5381;
  new Uint8Array(head).forEach((b) => {
    h = ((h << 5) + h + b) | 0;
  });
  return `${file.size.toString(36)}-${(h >>> 0).toString(36)}`.slice(0, 32);
}

/** Read a file's header once: its fingerprint, and what its JPEG header says. */
async function inspect(file: File) {
  const head = await file.slice(0, HEADER_BYTES).arrayBuffer();
  const info = readJpegInfo(head);
  return { fp: await fingerprintOf(file, head), info, plan: printPlan(file, info) };
}

/** A photo that no longer exists for this account (deleted, or a different sign-in). */
const isGone = (err: unknown) => err instanceof Error && /^404:/.test(err.message);

const isHeic = (file: File) => /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);

/** A photo's original can't go up as it is if it's HEIC (printers and sharp can't read it) or over the limit. */
const needsMaster = (file: File) => isHeic(file) || file.size > MAX_ORIGINAL_BYTES;

/** A new id for a photo, shared with the server so pages can reference it before any network. */
export function newPhotoId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // plain-http dev only: same shape, from getRandomValues
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

class UploadEngine {
  private items = new Map<string, Item>();
  private host: EngineHost | null = null;
  /** updates made while no builder is mounted */
  private held = new Map<string, Partial<BuilderPhoto>>();
  private heldRemovals = new Set<string>();
  private listeners = new Set<() => void>();
  private landedListeners = new Set<(id: string) => void>();
  private running = { prepare: 0, display: 0, original: 0 };
  private rejected: string[] = [];
  private duplicates = 0;
  private notices: PhotoNotices = { whatsapp: 0, screenshots: 0, dark: 0, small: 0 };
  private offline = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  /** recent {t, bytes} samples of total bytes sent, for the time estimate */
  private samples: Array<{ t: number; total: number }> = [];
  private sentTotal = 0;
  /** photos claim() carried over from an earlier visit */
  private restoredIds = new Set<string>();
  /** claim() has run, or is waiting for another tab to finish */
  private claimed = false;
  // last: computeSnapshot reads the fields above
  private snapshot: UploadSnapshot = this.computeSnapshot(0);
  private emitQueued = false;

  /** batches still waiting to report */
  private batches = new Set<BatchTracker>();
  private projectId: string | null = null;

  constructor() {
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => this.retryNow());
      // The page is going away with work unfinished: report what we measured.
      window.addEventListener("pagehide", () => this.batches.forEach((b) => b.send(false)));
    }
  }

  /* ── wiring ─────────────────────────────────────────────── */

  /** Connect a mounted builder and hand it anything that happened while it was away. */
  attach(host: EngineHost): () => void {
    this.host = host;
    this.held.forEach((patch, id) => host.patchPhoto(id, patch));
    this.held.clear();
    this.heldRemovals.forEach((id) => host.removePhoto(id));
    this.heldRemovals.clear();
    this.pump();
    return () => {
      if (this.host === host) this.host = null;
    };
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getSnapshot = () => this.snapshot;

  /** Called whenever a photo's display copy has safely reached the server. */
  onLanded(fn: (id: string) => void) {
    this.landedListeners.add(fn);
    return () => {
      this.landedListeners.delete(fn);
    };
  }

  /** Does this tab still hold the file for a photo? If not, the customer has to pick it again. */
  holdsFile(id: string): boolean {
    const item = this.items.get(id);
    return Boolean(item && item.stage !== "done");
  }

  /**
   * Can this photo's HD copy still finish without the customer's help? True
   * while this tab holds the file, and while a copy is kept on the phone
   * (stash.ts) for this tab or another to carry on with. Only when this is
   * false does the photo belong on the re-add list.
   */
  canFinish(id: string): boolean {
    return this.holdsFile(id) || isPending(id);
  }

  /** A file we refused before it ever reached the queue. */
  noteRejected(names: string[]) {
    this.rejected.push(...names);
    this.emit();
  }

  dismissRejected() {
    this.rejected = [];
    this.emit();
  }

  /** Try everything again now, after a tap or when the connection returns. */
  retryNow() {
    this.offline = false;
    this.items.forEach((item) => {
      item.retryAt = 0;
    });
    this.emit();
    this.pump();
  }

  /**
   * The customer removed this photo (the remove button on the photos step):
   * stop working on it. Every stage checks isCurrent() before it acts, so a
   * request already in flight finishes harmlessly and nothing is written back.
   * Its batch counts it like a rejected file, so the upload report still
   * settles.
   */
  forget(id: string) {
    const item = this.items.get(id);
    this.held.delete(id);
    this.unstash(id);
    if (!item) return;
    this.items.delete(id);
    item.batch.reject(id);
    this.settle(item.batch);
    this.emit();
    this.pump();
  }

  /** Forget everything: the customer started over. In-flight requests finish harmlessly. */
  reset() {
    this.items.clear();
    this.batches.clear();
    this.restoredIds.clear();
    stashClear();
    clearPending();
    this.held.clear();
    this.heldRemovals.clear();
    this.rejected = [];
    this.duplicates = 0;
    this.notices = { whatsapp: 0, screenshots: 0, dark: 0, small: 0 };
    this.offline = false;
    this.emit();
  }

  /* ── adding photos ──────────────────────────────────────── */

  /**
   * Queue files. Each one becomes one of:
   *  - a new photo, via `makePhoto`, which the caller adds to the book
   *  - a re-pick of a photo whose original was lost when the tab closed, which
   *    resumes where that photo left off
   *  - a duplicate of a photo already in the book, which is skipped and counted
   *
   * With `onlyMissing` (the re-add list, RepickSheet), only re-picks count:
   * the customer may select a whole album to find the few photos that were
   * lost, and everything else is quietly ignored rather than added.
   */
  async add(
    files: File[],
    existing: BuilderPhoto[],
    makePhoto: (file: File, id: string, fp: string, index: number, meta: PhotoMeta) => BuilderPhoto,
    addPhotos: (photos: BuilderPhoto[]) => void,
    opts: { onlyMissing?: boolean } = {},
  ): Promise<{ added: number; resumed: number }> {
    let resumed = 0;
    void this.claim(); // anything left from an earlier visit carries on too
    const byFp = new Map(existing.filter((p) => p.fp).map((p) => [p.fp!, p]));
    const fresh: BuilderPhoto[] = [];
    const seen = new Set<string>();
    const resumes = existing.some((p) => p.hd === false && !this.holdsFile(p.id));
    const batch = new BatchTracker(newPhotoId(), resumes ? "resume" : "new", () => this.projectId ?? this.host?.projectId() ?? null);

    for (const file of files) {
      const { fp, info, plan } = await inspect(file);
      if (seen.has(fp)) {
        this.duplicates++;
        batch.duplicate();
        continue;
      }
      seen.add(fp);
      const match = byFp.get(fp);
      if (match) {
        if (match.hd === false && !this.holdsFile(match.id)) {
          this.resume(match, file, fp, plan, batch);
          resumed++;
        } else if (!opts.onlyMissing) {
          this.duplicates++;
          batch.duplicate();
        }
        continue;
      }
      if (opts.onlyMissing) continue;
      const id = newPhotoId();
      fresh.push(makePhoto(file, id, fp, existing.length + fresh.length, { taken: info?.takenAt }));
      const item = this.newItem(id, file, fp, plan, batch);
      this.items.set(id, item);
      batch.add(id, file);
      this.countNotices(file);
      this.stash(item, null);
    }
    if (batch.size) this.batches.add(batch);
    if (fresh.length) addPhotos(fresh);
    this.emit();
    this.pump();
    return { added: fresh.length, resumed };
  }

  private newItem(id: string, file: File, fp: string, plan: PrintPlan, batch: BatchTracker, projectId: string | null = null): Item {
    return { id, file, fp, plan, projectId, stage: "queued", sent: 0, attempts: 0, retryAt: 0, batch };
  }

  /** Pick a photo back up from a fresh file: skip whatever already reached the server. */
  private resume(photo: BuilderPhoto, file: File, fp: string, plan: PrintPlan, batch: BatchTracker) {
    const item = this.newItem(photo.id, file, fp, plan, batch);
    this.items.set(photo.id, item);
    batch.add(photo.id, file);
    let key: string | null = null;
    if (photo.url?.startsWith("/media/")) {
      key = originalUrlOf(photo.url).slice("/media/".length);
      this.skipToOriginal(item, key);
    }
    this.stash(item, key);
  }

  /** The display copies are already on the server: only the HD copy is left. */
  private skipToOriginal(item: Item, key: string) {
    item.stage = needsMaster(item.file) ? "queued" : "in"; // HEIC still has to be converted first
    item.key = key;
    // already in the book from before the page closed: in from the start
    item.batch.mark(item.id, "inBook");
  }

  /* ── keeping photos on the phone (stash.ts) ─────────────── */

  /** Copy a photo into the browser's storage, and list it, until its HD copy is up. */
  private stash(item: Item, key: string | null) {
    const entry: PendingEntry = {
      id: item.id,
      fp: item.fp,
      name: item.file.name,
      type: item.file.type,
      lastModified: item.file.lastModified,
      size: item.file.size,
      projectId: item.projectId ?? this.projectId ?? this.host?.projectId() ?? null,
      key,
      at: Date.now(),
    };
    void stashPut(item.id, item.file).then((ok) => {
      // listed only once the file is safely written, and only if the photo is still wanted
      if (ok && this.isCurrent(item) && item.stage !== "done") writePending({ ...entry, key: item.key ?? key, projectId: item.projectId ?? entry.projectId });
      else if (ok) stashRemove(item.id);
    });
  }

  private unstash(id: string) {
    removePending(id);
    stashRemove(id);
  }

  /**
   * Carry on with photos left from an earlier visit or a closed tab. Called on
   * the first page load that finds any (UploadNotices), and before adding
   * photos. Only one tab at a time does this: the Web Lock is held for as long
   * as the tab is open, and a second tab waits for it, then takes over
   * whatever the first left behind.
   */
  claim(): Promise<void> {
    if (this.claimed || typeof window === "undefined") return Promise.resolve();
    this.claimed = true;
    const locks = (navigator as Navigator & { locks?: { request: (name: string, cb: () => Promise<void>) => Promise<void> } }).locks;
    if (!locks) return this.restore();
    return new Promise((resolve) => {
      void locks
        .request("tk-uploads", async () => {
          await this.restore();
          resolve();
          await new Promise<never>(() => undefined); // held until the tab closes
        })
        .catch(() => resolve());
    });
  }

  private async restore() {
    const entries = listPending().filter((e) => !this.items.has(e.id));
    if (!entries.length) return;
    const batch = new BatchTracker(newPhotoId(), "resume", () => this.projectId ?? this.host?.projectId() ?? null);
    for (const entry of entries) {
      const stored = await stashGet(entry.id);
      if (!stored || stored.size !== entry.size) {
        // the browser cleared it: the re-add list will ask for this one
        this.unstash(entry.id);
        continue;
      }
      if (this.items.has(entry.id)) continue; // re-picked while we were reading
      const file = new File([stored], entry.name, { type: entry.type, lastModified: entry.lastModified });
      const { plan } = await inspect(file);
      const item = this.newItem(entry.id, file, entry.fp, plan, batch, entry.projectId);
      this.items.set(entry.id, item);
      batch.add(entry.id, file);
      if (entry.key) this.skipToOriginal(item, entry.key);
      this.projectId ??= entry.projectId;
      this.restoredIds.add(entry.id);
    }
    if (batch.size) this.batches.add(batch);
    this.emit();
    this.pump();
  }

  /** A new object each time, so the screen's memoised lines see the change. */
  private note(kind: keyof PhotoNotices) {
    this.notices = { ...this.notices, [kind]: this.notices[kind] + 1 };
  }

  private countNotices(file: File) {
    if (/^IMG-\d{8}-WA\d+|whatsapp/i.test(file.name)) this.note("whatsapp");
    else if (/screenshot|screen shot/i.test(file.name)) this.note("screenshots");
  }

  /* ── the scheduler ──────────────────────────────────────── */

  private pump() {
    const now = Date.now();
    const ready = (i: Item) => i.retryAt <= now;
    const all = Array.from(this.items.values());

    for (const item of all) {
      if (this.running.prepare >= prepareConcurrency()) break;
      if (item.stage === "queued" && ready(item)) void this.runPrepare(item);
    }
    for (const item of all) {
      if (this.running.display >= DISPLAY_CONCURRENCY) break;
      // a book with no project yet needs the builder to make one; attach() restarts
      if (item.stage === "prepared" && ready(item) && (this.host || this.projectFor(item))) void this.runDisplay(item);
    }
    // originals wait for the fast lanes to clear: see the header
    const fastLaneBusy = all.some((i) => i.stage === "queued" || i.stage === "preparing" || i.stage === "prepared" || i.stage === "uploading-display");
    if (!fastLaneBusy) {
      for (const item of all) {
        if (this.running.original >= ORIGINAL_CONCURRENCY) break;
        if (item.stage === "in" && ready(item)) void this.runOriginal(item);
      }
    }
    this.scheduleRetry();
  }

  private scheduleRetry() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    const waits = Array.from(this.items.values())
      .filter((i) => i.retryAt > Date.now())
      .map((i) => i.retryAt);
    if (waits.length) this.retryTimer = setTimeout(() => this.pump(), Math.max(50, Math.min(...waits) - Date.now()));
  }

  private projectFor(item: Item): string | null {
    return item.projectId ?? this.host?.projectId() ?? this.projectId;
  }

  private isCurrent(item: Item) {
    return this.items.get(item.id) === item;
  }

  /** Back off after a failed attempt, and say so once it's clearly the connection. */
  private failAttempt(item: Item, stage: Stage, err?: unknown) {
    if (!this.isCurrent(item)) return;
    item.batch.retry(err instanceof HttpError && err.stalled);
    item.stage = stage;
    item.sent = 0;
    const wait = BACKOFF_S[Math.min(item.attempts, BACKOFF_S.length - 1)];
    item.attempts++;
    item.retryAt = Date.now() + wait * 1000;
    if (item.attempts >= OFFLINE_AFTER_ATTEMPTS || navigator.onLine === false) this.offline = true;
  }

  /** Take a photo out of the book because it can never work, and tell the customer. */
  private reject(item: Item) {
    if (!this.isCurrent(item)) return;
    this.items.delete(item.id);
    this.unstash(item.id);
    this.rejected.push(item.file.name);
    item.batch.reject(item.id);
    this.settle(item.batch);
    if (this.host) this.host.removePhoto(item.id);
    else this.heldRemovals.add(item.id);
  }

  /** Send a batch's report once every photo in it has settled. */
  private settle(batch: BatchTracker) {
    if (!batch.settled) return;
    batch.send(true);
    this.batches.delete(batch);
  }

  /** The photo is gone from the server (deleted, or another account): stop quietly, there's nobody to tell. */
  private drop(item: Item) {
    if (!this.isCurrent(item)) return;
    this.items.delete(item.id);
    this.unstash(item.id);
    item.batch.reject(item.id);
    this.settle(item.batch);
  }

  private patch(id: string, patch: Partial<BuilderPhoto>) {
    if (this.host) this.host.patchPhoto(id, patch);
    else this.held.set(id, { ...this.held.get(id), ...patch });
  }

  /* ── lane 1: prepare ────────────────────────────────────── */

  private async runPrepare(item: Item) {
    this.running.prepare++;
    item.stage = "preparing";
    item.batch.mark(item.id, "prepareStart");
    this.emit();
    try {
      const { result, original } = await withTimeout(this.prepare(item.file), PREPARE_TIMEOUT_MS, "preparing a photo");
      if (!this.isCurrent(item)) return;
      setLocalPreview(item.id, result.display, result.thumb);
      item.prepared = result;
      item.original = original;
      item.batch.mark(item.id, "prepared", { megapixels: (result.w * result.h) / 1e6 });
      if (result.luma < 45) this.note("dark");
      if (Math.max(result.w, result.h) < 1600) this.note("small");
      // resuming a photo whose copies are already up skips the display lane
      item.stage = item.key ? "in" : "prepared";
      item.attempts = 0;
      this.patch(item.id, { w: result.w, h: result.h, sharp: result.sharp });
    } catch {
      // A file the browser can't open won't open on the next try either.
      this.reject(item);
    } finally {
      this.running.prepare--;
      this.emit();
      this.pump();
    }
  }

  /**
   * Decode one file. HEIC is tried natively first because Safari can do it for
   * free; everywhere else the WebAssembly decoder (3 MB) loads only now, so
   * customers without HEIC photos never download it.
   */
  private async prepare(file: File): Promise<{ result: PreparedPhoto; original: Blob | undefined }> {
    const wantsMaster = needsMaster(file);
    try {
      const result = await preparePhotoOffThread(file, wantsMaster);
      return { result, original: result.master };
    } catch (err) {
      if (!isHeic(file)) throw err;
    }
    const { heicTo } = await import("heic-to");
    const jpeg = await heicTo({ blob: file, type: "image/jpeg", quality: 0.95 });
    const result = await preparePhotoOffThread(jpeg, false);
    return { result, original: jpeg };
  }

  /* ── lane 2: display copies ─────────────────────────────── */

  private async runDisplay(item: Item) {
    this.running.display++;
    item.stage = "uploading-display";
    item.batch.mark(item.id, "displayStart");
    this.emit();
    const { display, thumb, w, h } = item.prepared!;
    try {
      const known = item.projectId ?? (this.host ? null : this.projectId);
      const projectId = known ?? (await withTimeout(this.host!.ensureProject(), API_TIMEOUT_MS, "creating the book"));
      this.projectId ??= projectId;
      item.projectId = projectId;
      const prep = await post<{
        key: string;
        ext: "webp" | "jpg";
        display: { uploadUrl: string; headers: Record<string, string> };
        thumb: { uploadUrl: string; headers: Record<string, string> };
      }>("/api/uploads/prepare", { projectId, id: item.id, filename: item.file.name, displayType: display.type });
      await Promise.all([put(prep.display.uploadUrl, prep.display.headers, display), put(prep.thumb.uploadUrl, prep.thumb.headers, thumb)]);
      await post("/api/uploads/complete", {
        id: item.id,
        projectId,
        key: prep.key,
        originalFilename: item.file.name,
        displayExt: prep.ext,
        width: w,
        height: h,
      });
      if (!this.isCurrent(item)) return;
      item.key = prep.key;
      item.stage = "in";
      item.attempts = 0;
      this.offline = false;
      updatePending(item.id, { key: prep.key, projectId });
      item.batch.mark(item.id, "inBook", { displayBytes: display.size + thumb.size });
      this.patch(item.id, { url: `/media/${prep.key}.preview.${prep.ext}` });
      this.landedListeners.forEach((fn) => fn(item.id));
    } catch (err) {
      this.failAttempt(item, "prepared", err);
    } finally {
      this.running.display--;
      this.emit();
      this.pump();
    }
  }

  /* ── lane 3: originals ──────────────────────────────────── */

  private async runOriginal(item: Item) {
    // A new burst starts the estimate afresh: counting the idle time before
    // it would make the first number far too pessimistic.
    if (this.running.original === 0) this.samples = [];
    this.running.original++;
    item.stage = "uploading-original";
    item.batch.mark(item.id, "originalStart");
    this.emit();
    try {
      const body = await this.printBody(item);
      if (!this.isCurrent(item)) return;
      const contentType = ORIGINAL_TYPES.has(body.type) ? body.type : isHeic(item.file) ? "image/heic" : "image/jpeg";
      const signed = await post<{ uploadUrl: string; headers: Record<string, string> }>(`/api/uploads/${item.id}/original/presign`, {
        contentType,
        sizeBytes: body.size,
      });
      await put(signed.uploadUrl, signed.headers, body, (loaded) => {
        this.sentTotal += Math.max(0, loaded - item.sent);
        item.sent = loaded;
        this.emit();
      });
      await post(`/api/uploads/${item.id}/original/complete`, {});
      if (!this.isCurrent(item)) return;
      item.stage = "done";
      this.unstash(item.id);
      item.prepared = undefined; // the display blobs are held by previews.ts
      item.original = undefined;
      this.offline = false;
      item.batch.mark(item.id, "hd", { originalBytes: body.size });
      this.settle(item.batch);
      this.patch(item.id, { hd: true });
    } catch (err) {
      // 413 or 415: this one file can't be stored as it is, and never will be
      if (err instanceof Error && /^(413|415):/.test(err.message)) this.reject(item);
      else if (isGone(err)) this.drop(item);
      else this.failAttempt(item, "in", err);
    } finally {
      this.running.original--;
      this.emit();
      this.pump();
    }
  }

  /**
   * The bytes to send for printing: the converted master (HEIC, oversize), or
   * a quality 0.95 re-save when print-copy.ts allows it, or the file itself.
   * The re-save is kept on the item, so a retry doesn't redo it. Any failure
   * sends the file itself: never a worse file, at worst a bigger one.
   */
  private async printBody(item: Item): Promise<Blob> {
    if (item.original) return item.original;
    if (!item.plan.reencode) return item.file;
    let copy: Blob | undefined;
    try {
      copy = await withTimeout(printCopyOffThread(item.file, item.plan.maxShortEdge, PRINT_QUALITY), PREPARE_TIMEOUT_MS, "making a print copy");
    } catch {
      copy = undefined;
    }
    if (copy && copy.size <= item.file.size * MAX_COPY_FRACTION) {
      item.original = copy;
      return copy;
    }
    item.plan = { reencode: false, reason: "failed" };
    return item.file;
  }

  /* ── reporting ──────────────────────────────────────────── */

  private eta(pendingBytes: number): number | null {
    const now = Date.now();
    this.samples.push({ t: now, total: this.sentTotal });
    while (this.samples.length > 2 && now - this.samples[0].t > 30_000) this.samples.shift();
    const first = this.samples[0];
    const elapsed = (now - first.t) / 1000;
    const sent = this.sentTotal - first.total;
    // too little data gives wild numbers, and showing none is more honest
    if (elapsed < 5 || sent <= 0) return null;
    return pendingBytes / (sent / elapsed);
  }

  private computeSnapshot(version: number): UploadSnapshot {
    const all = Array.from(this.items.values());
    const displayPending = all.filter((i) => ["queued", "preparing", "prepared", "uploading-display"].includes(i.stage)).length;
    const originals = all.filter((i) => i.stage !== "done");
    const pendingBytes = originals.reduce((sum, i) => sum + Math.max(0, (i.original ? i.original.size : expectedPrintBytes(i.file, i.plan)) - i.sent), 0);
    const restoredLeft = Array.from(this.restoredIds).filter((id) => {
      const item = this.items.get(id);
      return item && item.stage !== "done";
    }).length;
    return {
      version,
      active: originals.length > 0,
      displayPending,
      originalsPending: originals.length,
      offline: this.offline,
      etaSeconds: originals.length ? this.eta(pendingBytes) : null,
      rejected: this.rejected,
      duplicates: this.duplicates,
      notices: this.notices,
      restored: this.restoredIds.size ? { total: this.restoredIds.size, left: restoredLeft } : null,
      sentBytes: this.sentTotal,
    };
  }

  /** Coalesce bursts of progress events into one render per 200ms. */
  private emit() {
    if (this.emitQueued) return;
    this.emitQueued = true;
    setTimeout(() => {
      this.emitQueued = false;
      this.snapshot = this.computeSnapshot(this.snapshot.version + 1);
      this.listeners.forEach((fn) => fn());
    }, 200);
  }
}

/** The one engine. A module singleton so uploads outlive any screen. */
export const uploadEngine = new UploadEngine();
