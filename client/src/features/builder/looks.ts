/**
 * Looks — typeface, photo edges, title-page subtitle, caption visibility.
 *
 * What: the parts of a book's style that are NOT colour. A "look" (one of
 * the eight cards in the editor) is a theme from data.ts plus a default
 * typeface and edge treatment from LOOK_DEFAULTS; the user can then
 * change each piece on its own.
 *
 * Why a context: these settings must reach every place a page is drawn —
 * the editor spread, the filmstrip thumbnails, the 3-D preview, the order
 * screen's mini book — and threading four more props through Book3D,
 * MiniBook and PageFace would touch every call site. The builder shell
 * provides one `PageLookContext` value from builder state; `PageFace`
 * and `CoverFace` read it. Anything rendered outside the builder gets the
 * defaults, which reproduce the pre-v2 appearance exactly.
 *
 * Inline editing hooks (onEditTitle/…) ride on the same context: only
 * the editor provides them, so pages are editable there and read-only
 * everywhere else without a single extra prop.
 */

import { createContext, useContext } from "react";
import { FONT_PAIRS, LEGACY_FONT_IDS, type BookFontId } from "@shared/fonts";
import { cssFamily, ensureBookFonts } from "./fonts";

// every screen that draws a page imports this module; the pairs load once
ensureBookFonts();

export type FontId = BookFontId;
/** "border" is retired from the picker (a thin white line that barely showed), kept for books that use it. */
export type EdgeId = "clean" | "soft" | "shadow" | "border";

export interface FontDef {
  id: FontId;
  name: string;
  /** the owner's "Best for" line (pairs only) */
  bestFor?: string;
  /** heading face, for titles (and captions in `script`) */
  display: string;
  weight: number;
  /** body face: the line under the title and captions */
  caption: string;
  captionWeight: number;
  captionItalic?: boolean;
  /** one of the four typefaces from before the pairs: kept for saved books, not offered */
  retired?: boolean;
}

/**
 * The typefaces a book can print in. The eight pairs (shared/fonts.ts) are
 * what the pickers offer; the four older typefaces stay so books made with
 * them still draw and print as they did (they are loaded in client/index.html).
 * These are book choices, not interface fonts, so changing the site's fonts
 * must not change them.
 */
const RETIRED: FontDef[] = [
  { id: "classic", name: "Classic", display: "'Clash Display', var(--font-display), sans-serif", weight: 600, caption: "var(--font-display)", captionWeight: 500, retired: true },
  { id: "editorial", name: "Editorial", display: "'Instrument Serif', Georgia, serif", weight: 400, caption: "'Instrument Serif', Georgia, serif", captionWeight: 400, captionItalic: true, retired: true },
  { id: "modern", name: "Modern", display: "'Archivo', var(--font-body), sans-serif", weight: 500, caption: "'Archivo', var(--font-body), sans-serif", captionWeight: 400, retired: true },
  { id: "script", name: "Handwritten", display: "'Caveat', 'Segoe Script', cursive", weight: 600, caption: "'Caveat', 'Segoe Script', cursive", captionWeight: 600, retired: true },
];
const PAIRS: FontDef[] = FONT_PAIRS.map((p) => ({
  id: p.id,
  name: p.name,
  bestFor: p.bestFor,
  display: cssFamily(p.head),
  weight: p.head.weight,
  caption: cssFamily(p.body),
  captionWeight: p.body.weight,
}));
export const FONTS: FontDef[] = [...PAIRS, ...RETIRED];
export const fontById = (id: string | null | undefined): FontDef => FONTS.find((f) => f.id === id) ?? PAIRS[0];

/** What a picker lists: the eight pairs, plus the book's own retired typeface so its choice stays visible. */
export const pickerFonts = (current: string | null | undefined): FontDef[] => {
  const own = RETIRED.find((f) => f.id === current);
  return own ? [...PAIRS, own] : PAIRS;
};
export const isRetiredFont = (id: string | null | undefined) => (LEGACY_FONT_IDS as readonly string[]).includes(id ?? "");

export const EDGES: Array<{ id: EdgeId; name: string }> = [
  { id: "clean", name: "Clean" },
  { id: "soft", name: "Rounded" },
  { id: "shadow", name: "Shadow" },
  { id: "border", name: "Bordered" },
];

/**
 * Default photo edges per theme id (themes live in data.ts). A look no longer
 * sets the typeface: the font pair follows the occasion (shared/fonts.ts
 * pairForOccasion), so changing the page colour keeps the customer's lettering.
 */
export const LOOK_DEFAULTS: Record<string, { edge: EdgeId }> = {
  ivory: { edge: "clean" },
  cobalt: { edge: "clean" },
  indigo: { edge: "clean" },
  blush: { edge: "soft" },
  gallery: { edge: "clean" },
  sage: { edge: "soft" },
  midnight: { edge: "clean" },
  golden: { edge: "shadow" },
  kraft: { edge: "shadow" },
};
export const lookDefaults = (themeId: string) => LOOK_DEFAULTS[themeId] ?? LOOK_DEFAULTS.ivory;

/** Order of the look cards in the editor (first four shown, rest on "more"). */
export const LOOK_ORDER = ["gallery", "ivory", "indigo", "blush", "sage", "midnight", "golden", "kraft"];

export interface PageLook {
  fontId: FontId;
  edge: EdgeId;
  /** line under the title on the title page; null = the occasion's default */
  subtitle: string | null;
  captionsHidden: boolean;
  /**
   * The photo on the front cover, already resolved (the customer's choice or
   * ours, see coverPhotoIdFor in data.ts). Absent = the first photo, which is
   * what every cover showed before the choice existed.
   */
  coverPhotoId?: string | null;
  /** the pattern on a "pattern" cover (shared/patterns.ts); absent = Floral */
  coverPattern?: string;
  /** editor-only: inline editing of text printed on the page */
  onEditTitle?: (v: string) => void;
  onEditSubtitle?: (v: string) => void;
  onEditCaption?: (pageId: string, v: string) => void;
}

export const DEFAULT_LOOK: PageLook = { fontId: "classic", edge: "clean", subtitle: null, captionsHidden: false };

export const PageLookContext = createContext<PageLook>(DEFAULT_LOOK);
export const usePageLook = () => useContext(PageLookContext);

/** Classes for a `.bb-page` element carrying the look (see builder.css). */
export const lookClasses = (look: PageLook) => ` bb-font-${look.fontId} bb-edge-${look.edge}`;
