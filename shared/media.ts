/**
 * Media URLs — the one place that knows how a photo's three copies relate.
 *
 * Every photo exists up to three times in the media store:
 *
 *   projects/<pid>/<id>-<name>                the untouched HD ORIGINAL (print)
 *   projects/<pid>/<id>-<name>.preview.<ext>  ~1600px DISPLAY copy (editing)
 *   projects/<pid>/<id>-<name>.thumb.<ext>    ~400px THUMB (grids, strips)
 *
 * Approach: a book document stores just one URL per photo, and the others
 * are derived from it by string rules. Storing three would cost about 200
 * bytes per photo against the 256 KB document cap, and could disagree.
 *
 * URLs are permanent app paths (`/media/<key>`), never signed storage links.
 * A signed link expires, and these are saved in drafts and order snapshots;
 * the server trades the path for a short-lived link after checking who is
 * asking (docs/adr/011). This file is pure because client and server share it.
 */

const SUFFIX_RE = /\.(preview|thumb)\.(webp|jpg)$/;

/** Older books hold `https://<public-bucket>/projects/…`; those links die once the bucket goes private. */
const LEGACY_PUBLIC_RE = /^https?:\/\/[^/]+\/(projects\/.+)$/;

/** Rewrite a stored photo URL to its permanent app path; anything else passes through. */
export function normalizeMediaUrl<T extends string | null | undefined>(url: T): T | string {
  if (!url) return url;
  const legacy = url.match(LEGACY_PUBLIC_RE);
  return legacy ? `/media/${legacy[1]}` : url;
}

/** True when this URL is a derived copy rather than an original. */
function isDerived(url: string): boolean {
  return SUFFIX_RE.test(url);
}

/**
 * The display copy for a stored URL. A book from before this pipeline stores
 * its original, and the server made a `.preview.webp` beside it, so that is
 * tried first; callers fall back to the original if it never got made.
 */
export function displayUrlOf(url: string): string {
  if (isDerived(url)) return url.replace(SUFFIX_RE, ".preview.$2");
  return `${url}.preview.webp`;
}

/** The thumbnail for a stored URL. Same rule as {@link displayUrlOf}. */
export function thumbUrlOf(url: string): string {
  if (isDerived(url)) return url.replace(SUFFIX_RE, ".thumb.$2");
  return `${url}.thumb.webp`;
}

/** The HD original for a stored URL: what the print pipeline must read. */
export function originalUrlOf(url: string): string {
  return url.replace(SUFFIX_RE, "");
}
