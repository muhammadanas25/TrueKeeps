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
export type EdgeId = "clean" | "soft" | "border";

export interface FontDef {
  id: FontId;
  name: string;
  /** display face for titles (and captions in `script`) */
  display: string;
  weight: number;
}

/**
 * Four typefaces. Clash Display + Archivo are the brand faces already
 * loaded; Instrument Serif and Caveat are loaded from Google Fonts in
 * client/index.html.
 */
export const FONTS: FontDef[] = [
  { id: "classic", name: "Classic", display: "'Clash Display', var(--font-display), sans-serif", weight: 600 },
  { id: "editorial", name: "Editorial", display: "'Instrument Serif', Georgia, serif", weight: 400 },
  { id: "modern", name: "Modern", display: "'Archivo', var(--font-body), sans-serif", weight: 500 },
  { id: "script", name: "Handwritten", display: "'Caveat', 'Segoe Script', cursive", weight: 600 },
];
export const fontById = (id: string | null | undefined): FontDef => FONTS.find((f) => f.id === id) ?? FONTS[0];

export const EDGES: Array<{ id: EdgeId; name: string }> = [
  { id: "clean", name: "Clean" },
  { id: "soft", name: "Rounded" },
  { id: "border", name: "Bordered" },
];

/** Default typeface + edge per theme id (themes live in data.ts). */
export const LOOK_DEFAULTS: Record<string, { font: FontId; edge: EdgeId }> = {
  ivory: { font: "classic", edge: "clean" },
  cobalt: { font: "classic", edge: "clean" },
  blush: { font: "editorial", edge: "soft" },
  gallery: { font: "modern", edge: "clean" },
  sage: { font: "editorial", edge: "soft" },
  midnight: { font: "modern", edge: "border" },
  golden: { font: "classic", edge: "border" },
  kraft: { font: "script", edge: "border" },
};
export const lookDefaults = (themeId: string) => LOOK_DEFAULTS[themeId] ?? LOOK_DEFAULTS.ivory;

/** Order of the look cards in the editor (first four shown, rest on "more"). */
export const LOOK_ORDER = ["ivory", "cobalt", "blush", "gallery", "sage", "midnight", "golden", "kraft"];

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
