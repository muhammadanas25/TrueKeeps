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

import { z } from "zod";

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
const pageSchema = z.object({
  id: z.string().min(1).max(64),
  layout: z.enum(["title", "full", "single", "duo", "duo-side", "collage", "trio-strip"]),
  slots: z.array(placementSchema).max(6),
  caption: z.string().max(280),
  /** collage only: flips the tile positions left-to-right */
  mirror: z.boolean().optional(),
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
  density: z.enum(["minimal", "balanced", "collage"]),
  coverStyle: z.enum(["full", "framed", "minimal", "split"]),
  voice: z.enum(["warm", "concise"]),
  qty: z.number().int().min(1).max(20),
  binding: z.string().max(40),
});

export type BuilderDocument = z.infer<typeof builderDocumentSchema>;

/** Body of PATCH /api/projects/:id/document */
export const saveDocumentSchema = z.object({
  document: builderDocumentSchema,
  /** version the client last saw; server rejects with 409 if stale */
  documentVersion: z.number().int().min(0),
});
export type SaveDocumentBody = z.infer<typeof saveDocumentSchema>;
