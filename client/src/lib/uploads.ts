/**
 * Photo upload pipeline (client side).
 *
 * Flow per file — mirrors S3 direct-upload even in dev (the server
 * decides where bytes land; see server/media.ts):
 *   1. compress in a Web Worker (browser-image-compression) — phone
 *      photos are 4–12MB; ~2MB/2400px is plenty for screen use while
 *      the print original quality question moves server-side later.
 *      HEIC and anything the browser can't decode skips compression
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

const COMPRESSION_OPTIONS = {
  maxSizeMB: 2.5,
  maxWidthOrHeight: 2400,
  useWebWorker: true, // keeps the main thread at 60fps during batches
};

/** Best-effort client-side compression; the original is always a valid fallback. */
async function compressIfPossible(file: File): Promise<File> {
  if (!COMPRESSIBLE.has(file.type) || file.size < 300 * 1024) return file;
  try {
    return await imageCompression(file, COMPRESSION_OPTIONS);
  } catch {
    return file; // corrupt/exotic file — let the server pipeline deal with it
  }
}

/**
 * Upload one photo into a project. Returns the created UploadedPhoto
 * row (thumbUrl/previewUrl arrive asynchronously — re-fetch or fall
 * back to `url` until they're set).
 */
export async function uploadPhotoFile(file: File, projectId: string): Promise<UploadedPhoto> {
  const body = await compressIfPossible(file);
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
  return completeRes.json();
}

/** Preferred display URL for a library grid tile. */
export function displayUrl(photo: Pick<UploadedPhoto, "url" | "thumbUrl">): string {
  return photo.thumbUrl ?? photo.url;
}
