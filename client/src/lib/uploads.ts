/**
 * One-stage photo upload, for the canvas editor (/create).
 *
 * The builder has its own two-stage pipeline in features/builder/upload (read
 * engine.ts for why). The canvas editor is a desktop tool working one small
 * batch at a time, so it sends the untouched original and lets the server make
 * the thumbnail and preview:
 *   1. POST /api/uploads/presign → { uploadUrl, headers, key }
 *   2. PUT the bytes straight to uploadUrl, never through the JSON API
 *   3. POST /api/uploads/complete → UploadedPhoto row; derivatives follow
 *
 * Failure semantics: any step throws with a readable message.
 */

import type { UploadedPhoto } from "@shared/schema";
import { apiRequest } from "./queryClient";

/** Upload one photo into a project. thumbUrl/previewUrl arrive asynchronously. */
export async function uploadPhotoFile(file: File, projectId: string): Promise<UploadedPhoto> {
  const contentType = file.type || "application/octet-stream";

  const presignRes = await apiRequest("POST", "/api/uploads/presign", {
    projectId,
    filename: file.name,
    contentType,
    sizeBytes: file.size,
  });
  const presigned: { key: string; uploadUrl: string; method: "PUT"; headers: Record<string, string> } = await presignRes.json();

  const putRes = await fetch(presigned.uploadUrl, { method: presigned.method, headers: presigned.headers, body: file });
  if (!putRes.ok) throw new Error(`Media upload failed (${putRes.status})`);

  const completeRes = await apiRequest("POST", "/api/uploads/complete", {
    projectId,
    key: presigned.key,
    originalFilename: file.name,
    sizeBytes: file.size,
  });
  return (await completeRes.json()) as UploadedPhoto;
}

/** Preferred display URL for a library grid tile. */
export function displayUrl(photo: Pick<UploadedPhoto, "url" | "thumbUrl">): string {
  return photo.thumbUrl ?? photo.url;
}
