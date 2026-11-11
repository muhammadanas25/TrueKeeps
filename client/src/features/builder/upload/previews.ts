/**
 * Which image should this photo show right now?
 *
 * While a photo is still on its way up, the only copy is in this browser, as a
 * blob URL. Those URLs die with the tab, so they live here rather than in the
 * builder state, which gets saved to localStorage and the server. Once a photo
 * has a server URL the local copy keeps being used for this session anyway,
 * because swapping the src would make every photo flicker and download again.
 *
 * Everything that draws a photo goes through this file, so a book opened
 * mid-upload, after a reload, or from before this pipeline all render the same.
 */

import { displayUrlOf, thumbUrlOf } from "@shared/media";
import type { BuilderPhoto } from "../data";

export type PhotoVariant = "display" | "thumb";

const local = new Map<string, { display: string; thumb: string }>();

/** Register a photo's in-browser copies. */
export function setLocalPreview(id: string, display: Blob, thumb: Blob) {
  const old = local.get(id);
  if (old) {
    URL.revokeObjectURL(old.display);
    URL.revokeObjectURL(old.thumb);
  }
  local.set(id, { display: URL.createObjectURL(display), thumb: URL.createObjectURL(thumb) });
}

/** True when the photo has something to show, on the server or in this tab. */
export function hasImage(photo: Pick<BuilderPhoto, "id" | "url">): boolean {
  return Boolean(photo.url) || local.has(photo.id);
}

/**
 * The URLs to try, best first. Fallbacks matter for older books: their stored
 * URL is the original, and a preview beside it usually exists but isn't
 * guaranteed, so the lighter copy is tried and the original is the safety net.
 */
export function photoSources(photo: Pick<BuilderPhoto, "id" | "url">, variant: PhotoVariant = "display"): string[] {
  const here = local.get(photo.id);
  if (here) return [variant === "thumb" ? here.thumb : here.display];
  const url = photo.url;
  if (!url) return [];
  if (!url.startsWith("/media/")) return [url]; // a session-only data URL
  const list = variant === "thumb" ? [thumbUrlOf(url), displayUrlOf(url), url] : [displayUrlOf(url), url];
  return Array.from(new Set(list));
}

/** The first choice from {@link photoSources}, for backgrounds and other places with no fallback. */
export function photoSrc(photo: Pick<BuilderPhoto, "id" | "url">, variant: PhotoVariant = "display"): string | undefined {
  return photoSources(photo, variant)[0];
}
