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

export type FontId = "classic" | "editorial" | "modern" | "script";
/** "border" is retired from the picker (a thin white line that barely showed), kept for books that use it. */
export type EdgeId = "clean" | "soft" | "shadow" | "border";

export interface FontDef {
  id: FontId;
  name: string;
  /** display face for titles (and captions in `script`) */
  display: string;
  weight: number;
  /** caption face, for showing the title + caption pair in the editor (matches builder.css .bb-font-*) */
  caption: string;
  captionWeight: number;
  captionItalic?: boolean;
}

/**
 * Four typefaces a customer can print in their book. All four are loaded in
 * client/index.html. These are book choices, not interface fonts, so changing
 * the site's fonts must not change them.
 */
export const FONTS: FontDef[] = [
  { id: "classic", name: "Classic", display: "'Clash Display', var(--font-display), sans-serif", weight: 600, caption: "var(--font-display)", captionWeight: 500 },
  { id: "editorial", name: "Editorial", display: "'Instrument Serif', Georgia, serif", weight: 400, caption: "'Instrument Serif', Georgia, serif", captionWeight: 400, captionItalic: true },
  { id: "modern", name: "Modern", display: "'Archivo', var(--font-body), sans-serif", weight: 500, caption: "'Archivo', var(--font-body), sans-serif", captionWeight: 400 },
  { id: "script", name: "Handwritten", display: "'Caveat', 'Segoe Script', cursive", weight: 600, caption: "'Caveat', 'Segoe Script', cursive", captionWeight: 600 },
];
export const fontById = (id: string | null | undefined): FontDef => FONTS.find((f) => f.id === id) ?? FONTS[0];

export const EDGES: Array<{ id: EdgeId; name: string }> = [
  { id: "clean", name: "Clean" },
  { id: "soft", name: "Rounded" },
  { id: "shadow", name: "Shadow" },
  { id: "border", name: "Bordered" },
];

/** Default typeface + edge per theme id (themes live in data.ts). */
export const LOOK_DEFAULTS: Record<string, { font: FontId; edge: EdgeId }> = {
  ivory: { font: "classic", edge: "clean" },
  cobalt: { font: "classic", edge: "clean" },
  indigo: { font: "classic", edge: "clean" },
  blush: { font: "editorial", edge: "soft" },
  gallery: { font: "modern", edge: "clean" },
  sage: { font: "editorial", edge: "soft" },
  midnight: { font: "modern", edge: "clean" },
  golden: { font: "classic", edge: "shadow" },
  kraft: { font: "script", edge: "shadow" },
};
export const lookDefaults = (themeId: string) => LOOK_DEFAULTS[themeId] ?? LOOK_DEFAULTS.ivory;

/** Order of the look cards in the editor (first four shown, rest on "more"). */
export const LOOK_ORDER = ["ivory", "indigo", "blush", "gallery", "sage", "midnight", "golden", "kraft"];

export interface PageLook {
  fontId: FontId;
  edge: EdgeId;
  /** line under the title on the title page; null = the occasion's default */
  subtitle: string | null;
  captionsHidden: boolean;
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
