/**
 * Photo upload pipeline (client side).
 *
 * Flow per file — mirrors S3 direct-upload even in dev (the server
 * decides where bytes land; see server/media.ts):
 *   1. measure, then compress ONLY if oversized (browser-image-compression,
 *      in a Web Worker). The ceiling is a PRINT ceiling, not a screen
 *      one: these bytes are what the press receives, so a photo that is
 *      already within 4096px / 8MB is uploaded byte-for-byte untouched.
 *      HEIC and anything the browser can't decode skips both steps
 *      and uploads as-is (the server pipeline handles it).
 *   2. POST /api/uploads/presign → { uploadUrl, headers, key }
 *   3. PUT the bytes to uploadUrl (NOT through express.json — this is
 *      the whole point: no more base64 megabytes in API payloads)
 *   4. POST /api/uploads/complete → UploadedPhoto row; the server
 *      queues thumbnail/preview generation asynchronously.
 *
 * Failure semantics: any step throws with a readable message; callers
 * decide whether to surface, retry, or fall back (the builder falls
 * back to a local-only data URL so the flow never blocks on network).
 */

import imageCompression from "browser-image-compression";
import type { UploadedPhoto } from "@shared/schema";
import { apiRequest } from "./queryClient";

/** Types we hand to compression; HEIC/HEIF can't be decoded by most
 *  browsers, so they bypass compression and go up as-is. */
const COMPRESSIBLE = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Print ceiling, not a screen ceiling.
 *
 * A full-bleed photo on a 12" page needs 12 × 300 = 3600px to hit the
 * 300 DPI industry ideal, and 12 × 150 = 1800px to clear the 150 DPI
 * floor below which softness is visible in ink. The old 2400px cap put
 * a 12" full-bleed at 200 DPI with only 1.33× of zoom headroom before
 * it fell under the floor — i.e. the crop UI would have had nowhere to
 * go. 4096px clears 300 DPI on every page size we sell and leaves 2.2×
 * of headroom for the zoom slider (see maxZoom() in features/builder).
 *
 * 8MB is a comfortable JPEG budget at that resolution; it only ever
 * binds on synthetic/lossless sources, since a 4096px photographic
 * JPEG at q0.92 lands around 3–5MB.
 */
export const PRINT_MAX_EDGE = 4096;
export const PRINT_MAX_MB = 8;

const COMPRESSION_OPTIONS = {
  maxSizeMB: PRINT_MAX_MB,
  maxWidthOrHeight: PRINT_MAX_EDGE,
  initialQuality: 0.92, // visually lossless; the default 1.0 wastes bytes for no gain
  useWebWorker: true, // keeps the main thread at 60fps during batches
};

/**
 * Decoded pixel dimensions, EXIF-rotated to match how the image will
 * actually be displayed and printed. Returns null when the browser
 * can't decode the format (HEIC on non-Safari) — callers must treat
 * unknown dimensions as "can't judge print quality yet", never as zero.
 */
export async function readImageSize(blob: Blob): Promise<{ w: number; h: number } | null> {
  // Preferred: createImageBitmap honours EXIF with `from-image` and
  // decodes off the main thread.
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
      const size = { w: bmp.width, h: bmp.height };
      bmp.close();
      if (size.w > 0 && size.h > 0) return size;
    } catch {
      /* fall through to the <img> path */
    }
  }
  // Fallback: <img> applies EXIF orientation natively in every browser
  // that ships the media pipeline we care about.
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise<{ w: number; h: number } | null>((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img.naturalWidth > 0 ? { w: img.naturalWidth, h: img.naturalHeight } : null);
      img.onerror = () => resolve(null);
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Measure first, compress only if the file breaches the print ceiling.
 *
 * Measuring up front means we never re-encode (and so never degrade) a
 * photo that was already print-safe, and it gives us the true pixel
 * dimensions of the bytes we are about to upload — which is exactly
 * what the DPI preflight needs, and what the server's async sharp pass
 * would otherwise not tell us until much later.
 */
async function prepareForUpload(file: File): Promise<{ body: File; w: number | null; h: number | null }> {
  const size = await readImageSize(file);

  const withinEdge = size ? Math.max(size.w, size.h) <= PRINT_MAX_EDGE : false;
  const withinBytes = file.size <= PRINT_MAX_MB * 1024 * 1024;

  // Undecodable (HEIC) or already print-safe → upload the original untouched.
  if (!COMPRESSIBLE.has(file.type) || (withinEdge && withinBytes)) {
    return { body: file, w: size?.w ?? null, h: size?.h ?? null };
  }

  try {
    const out = await imageCompression(file, COMPRESSION_OPTIONS);
    const outSize = await readImageSize(out);
    return { body: out, w: outSize?.w ?? null, h: outSize?.h ?? null };
  } catch {
    // corrupt/exotic file — let the server pipeline deal with it
    return { body: file, w: size?.w ?? null, h: size?.h ?? null };
  }
}

/**
 * Upload one photo into a project. Returns the created UploadedPhoto
 * row (thumbUrl/previewUrl arrive asynchronously — re-fetch or fall
 * back to `url` until they're set).
 *
 * `width`/`height` on the returned row are backfilled from the local
 * measurement when the server hasn't run its sharp pass yet, so the
 * caller always has real pixel dimensions to reason about print
 * quality with — the whole zoom ceiling depends on knowing them at the
 * moment the photo enters the builder, not minutes later.
 */
export async function uploadPhotoFile(file: File, projectId: string): Promise<UploadedPhoto> {
  const { body, w, h } = await prepareForUpload(file);
  const contentType = body.type || "application/octet-stream";

  // 1. ask the server where to put the bytes
  const presignRes = await apiRequest("POST", "/api/uploads/presign", {
    projectId,
    filename: file.name,
    contentType,
    sizeBytes: body.size,
  });
  const presigned: { key: string; uploadUrl: string; method: "PUT"; headers: Record<string, string> } =
    await presignRes.json();

  // 2. raw PUT — same shape against local dev store and R2/S3
  const putRes = await fetch(presigned.uploadUrl, {
    method: presigned.method,
    headers: presigned.headers,
    body,
  });
  if (!putRes.ok) {
    throw new Error(`Media upload failed (${putRes.status})`);
  }

  // 3. register metadata; server queues derivative generation
  const completeRes = await apiRequest("POST", "/api/uploads/complete", {
    projectId,
    key: presigned.key,
    originalFilename: file.name,
    sizeBytes: body.size,
  });
  // The server sets width/height asynchronously (sharp, via the
  // media.derivatives job), so the row we get back has them null. Fill
  // them from the local measurement: the builder needs real dimensions
  // NOW to bound the zoom slider, and a later re-fetch will simply
  // agree with us.
  const row: UploadedPhoto = await completeRes.json();
  return { ...row, width: row.width ?? w, height: row.height ?? h };
}

/** Preferred display URL for a library grid tile. */
export function displayUrl(photo: Pick<UploadedPhoto, "url" | "thumbUrl">): string {
  return photo.thumbUrl ?? photo.url;
}
