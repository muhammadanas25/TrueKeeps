/**
 * BuilderDocument — the server-persisted shape of a quiz-first book.
 *
 * What: the subset of the client's BuilderState that describes the BOOK
 * (not the UI): occasion/vibe/title, photos by server URL, pages with
 * layouts + captions, theme/density/cover, and the order options the
 * user last picked. Screen position, quiz sub-step, etc. stay client-only.
 *
 * Why shared: the client validates before sending and the server
 * validates on receipt with the SAME zod schema, so the two can never
 * drift. It is also the shape the order snapshot (Phase 2B) freezes
 * and the print pipeline (Phase 3) renders from.
 *
 * Size discipline: photo `url`s must be server/media URLs — inline
 * `data:` URLs are rejected so a document can never balloon past the
 * 256 KB cap enforced on PATCH.
 */

import { PATTERN_IDS } from "./patterns";
import { BOOK_FONT_IDS } from "./fonts";
import { z } from "zod";
import { FINISH_IDS } from "./pricing";

export const DOCUMENT_MAX_BYTES = 256 * 1024;

const photoSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().max(120),
  shade: z.number().int().min(0).max(2),
  url: z
    .string()
    .max(2048)
    .refine((u) => !u.startsWith("data:"), "inline data URLs are not persisted")
    .optional(),
  /** natural pixel size (EXIF-rotated) — drives print-DPI limits */
  w: z.number().int().positive().optional(),
  h: z.number().int().positive().optional(),
  /**
   * False while this photo's HD original is still on the customer's device.
   * Absent on every photo from before the two-stage upload, whose original
   * was the only copy and so is already in place.
   */
  hd: z.boolean().optional(),
  /** Fingerprint of the source file, to match it again if the tab closed mid-upload. */
  fp: z.string().max(32).optional(),
});

/** A photo placed in a page slot with its framing (pan/zoom/rotation). */
const placementSchema = z.object({
  photoId: z.string().min(1).max(64),
  fx: z.number().min(0).max(1),
  fy: z.number().min(0).max(1),
  zoom: z.number().min(0.1).max(10),
  turn: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
  /**
   * Straightening angle in degrees; absent means level.
   *
   * Bounded here as well as on the client because this schema is the
   * last thing standing between a hand-rolled request and the print
   * pipeline, and a tilt is scaled up to cover its own corners before it
   * is drawn — 45° would ask the renderer for 1.41× the pixels and crop
   * half the frame away. ±15 leaves the client's ±10 room to grow
   * without needing a document migration.
   */
  tilt: z.number().min(-15).max(15).optional(),
});

/**
 * Keep this enum in step with `PageLayoutId` in
 * client/src/features/builder/data.ts. It is not merely descriptive:
 * every autosave is validated against it, so a layout the client can
 * produce but this list omits makes the whole document 400 and the
 * user's draft stop saving.
 */
/** A slot rectangle on a "grid" page, as fractions of the page. */
const frameSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().gt(0).max(1),
  h: z.number().gt(0).max(1),
});

const pageSchema = z.object({
  id: z.string().min(1).max(64),
  layout: z.enum(["title", "full", "single", "duo", "duo-side", "collage", "trio-strip", "grid"]),
  slots: z.array(placementSchema).max(6),
  caption: z.string().max(280),
  /** collage only: flips the tile positions left-to-right */
  mirror: z.boolean().optional(),
  /** per-page colour override (palette id or #RRGGBB); absent = book colour */
  bg: z.string().max(24).nullable().optional(),
  /**
   * "grid" pages (the layout engine, 2026-11-17): one rectangle per slot.
   * Optional so every older page still validates; a grid page without them
   * would print every slot full-bleed, so the client always sends them.
   */
  frames: z.array(frameSchema).max(6).optional(),
});

export const builderDocumentSchema = z.object({
  /** bump when the shape changes so old documents can be migrated on read */
  v: z.literal(1),
  occasion: z.string().max(40).nullable(),
  vibe: z.string().max(40).nullable(),
  title: z.string().max(120),
  photos: z.array(photoSchema).max(400),
  pages: z.array(pageSchema).max(200),
  themeId: z.string().max(40),
  /**
   * Page-colour override (a PAGE_COLOURS id, or "theme"). Optional so
   * every document written before this field existed still validates —
   * an absent value reads back as the theme default, which is exactly
   * what those books were rendering. Not an enum: the swatch list will
   * grow, and a server that 400s on a colour it hasn't heard of would
   * lock users out of saving during a deploy.
   */
  pageColor: z.string().max(24).optional(),
  /* editor v2 style — all optional so older documents still validate */
  /** a font pair id, or one of the four typefaces from before the pairs (shared/fonts.ts) */
  fontId: z.enum(BOOK_FONT_IDS).optional(),
  edge: z.enum(["clean", "soft", "shadow", "border"]).optional(),
  subtitle: z.string().max(120).nullable().optional(),
  captionsHidden: z.boolean().optional(),
  /** paper finish; optional because documents saved before it existed lack it */
  finish: z.enum(FINISH_IDS).optional(),
  density: z.enum(["minimal", "balanced", "collage"]),
  coverStyle: z.enum(["full", "framed", "minimal", "split", "classic", "moment", "signature", "pattern"]),
  /**
   * Photos on the book's pages that were flagged as likely to print soft
   * (client quality.ts) when this was saved. The order keeps it: the refund
   * policy excludes photos used after our low-quality warning was shown.
   */
  flagged: z.array(z.object({ id: z.string().max(64), flag: z.enum(["small", "blurry"]) })).max(400).optional(),
  /** how the book was made: as laid out, editor opened, or edited (owner's analytics, 2026-11-22) */
  customized: z.enum(["none", "looked", "changed"]).optional(),
  /** the pattern on a "pattern" cover (shared/patterns.ts); optional: older documents have none */
  coverPattern: z.enum(PATTERN_IDS).optional(),
  /**
   * How the cover photo sits in its frame (moved, zoomed, straightened in the
   * editor, 2026-11-26). Applies only while `photoId` is the cover photo; the
   * print crops the cover with it (server/print/pdf.ts coverPhoto).
   */
  coverFrame: placementSchema.nullable().optional(),
  voice: z.enum(["warm", "concise"]),
  qty: z.number().int().min(1).max(20),
  binding: z.string().max(40),
  /**
   * The photo on the front cover (2026-11-21). Always the photo that prints:
   * the client resolves "let us pick" before saving. Optional because older
   * documents lack it; for those the cover is the first photo, as it always was.
   */
  coverPhotoId: z.string().max(64).nullable().optional(),
  /** true when the customer left the cover photo to us ("Let us pick") */
  coverAuto: z.boolean().optional(),
  /**
   * Photos the customer took out of the book in an editor. They stay out
   * when the book is laid out again, until put back (2026-11-21).
   */
  removedPhotoIds: z.array(z.string().max(64)).max(400).optional(),
});

export type BuilderDocument = z.infer<typeof builderDocumentSchema>;

/**
 * The photo that prints on the front cover: the chosen one while it is still
 * among the book's photos, else the first photo (how every book worked before
 * the choice existed). Shared so the order check and the print files agree
 * with what the customer saw.
 */
export function coverPhotoIdOf(doc: Pick<BuilderDocument, "photos" | "coverPhotoId">): string | null {
  const chosen = doc.coverPhotoId;
  if (chosen && doc.photos.some((p) => p.id === chosen)) return chosen;
  return doc.photos[0]?.id ?? null;
}

/** Body of PATCH /api/projects/:id/document */
export const saveDocumentSchema = z.object({
  document: builderDocumentSchema,
  /** version the client last saw; server rejects with 409 if stale */
  documentVersion: z.number().int().min(0),
});
export type SaveDocumentBody = z.infer<typeof saveDocumentSchema>;
