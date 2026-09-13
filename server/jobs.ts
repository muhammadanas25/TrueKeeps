/**
 * Background jobs — in-process queue + the image derivative pipeline.
 *
 * Queue design (docs/adr/003): a deliberately tiny in-process async
 * queue with the SAME register/enqueue surface as pg-boss. Handlers
 * never run in a request handler's await path — enqueue() returns
 * immediately and work happens on the microtask queue with bounded
 * concurrency and one retry. When job volume justifies it, this module
 * swaps its internals for pg-boss (Postgres-backed, survives restarts)
 * without touching any enqueue call sites.
 *
 * The one job today — "media.derivatives" — is the image pipeline:
 *   1. read original bytes from the media store
 *   2. sharp().rotate()  → applies EXIF orientation (phone photos
 *      otherwise render sideways in the book)
 *   3. probe rotated dimensions (needed for print preflight later)
 *   4. emit two webp derivatives next to the original:
 *        <key>.thumb.webp   (~400px, grids/thumbnail rails)
 *        <key>.preview.webp (~1200px, book preview spreads)
 *   5. PATCH the uploaded_photos row with URLs + dimensions
 * Clients keep working if this fails — they fall back to the original
 * URL until thumbUrl/previewUrl appear.
 */

import sharp, { type Metadata } from "sharp";
import { derivativeKey, mediaStore } from "./media";
import { storage } from "./storage";

/* ── Minimal queue (pg-boss-shaped surface) ─────────────────── */

type JobHandler = (payload: unknown) => Promise<void>;

const handlers = new Map<string, JobHandler>();
let running = 0;
const waiting: Array<() => void> = [];
/** Max jobs processing at once — image work is CPU-bound; keep small. */
const MAX_CONCURRENCY = 2;

function register(name: string, handler: JobHandler): void {
  handlers.set(name, handler);
}

/** Fire-and-forget with bounded concurrency and one retry. */
export function enqueue(name: string, payload: unknown): void {
  const handler = handlers.get(name);
  if (!handler) {
    console.error(`[jobs] no handler registered for "${name}"`);
    return;
  }
  const run = async () => {
    running++;
    try {
      try {
        await handler(payload);
      } catch (err) {
        console.warn(`[jobs] ${name} failed, retrying once:`, err);
        await handler(payload); // one retry, then give up loudly
      }
    } catch (err) {
      console.error(`[jobs] ${name} failed permanently:`, err);
    } finally {
      running--;
      waiting.shift()?.();
    }
  };
  if (running < MAX_CONCURRENCY) void run();
  else waiting.push(() => void run());
}

/* ── Image derivative pipeline ──────────────────────────────── */

export interface DerivativesPayload {
  photoId: string;
  storageKey: string;
}

const THUMB_WIDTH = 400;
const PREVIEW_WIDTH = 1200;

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
    base.clone().resize({ width: PREVIEW_WIDTH, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer(),
  ]);

  const thumbKey = derivativeKey(storageKey, "thumb");
  const previewKey = derivativeKey(storageKey, "preview");
  await Promise.all([
    mediaStore.put(thumbKey, thumb, "image/webp"),
    mediaStore.put(previewKey, preview, "image/webp"),
  ]);

  await storage.updateUploadedPhoto(photoId, {
    thumbUrl: mediaStore.publicUrl(thumbKey),
    previewUrl: mediaStore.publicUrl(previewKey),
    width: meta.width ?? null,
    height: meta.height ?? null,
    status: "ready",
  });
}

register("media.derivatives", makeDerivatives);
