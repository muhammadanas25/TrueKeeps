/**
 * Book builder — page-colour palette.
 *
 * The four BOOK_THEMES ship a fixed page colour each. This module lets
 * the user override just that one colour, for the whole book, from a
 * curated row of swatches — and then *derives* everything else that has
 * to move with it (text, rules, placeholder stripes, caption scrim) so
 * the page stays readable and printable no matter which swatch is on.
 *
 * Why derived rather than picked:
 *
 *  - A free colour picker is one drag away from #00FF00 — outside CMYK
 *    gamut, so the printed page would not match the screen — or from a
 *    mid-grey that leaves the theme's dark caption text illegible. The
 *    user would be authoring a defect and only find out on paper.
 *  - So the swatches are hand-chosen inside a safe band (nothing more
 *    saturated than a press can hit, nothing so dark that ink coverage
 *    becomes a problem), and the ink is chosen *for* the swatch by
 *    contrast, not by taste. `deriveTheme` picks whichever of near-black
 *    and white scores higher against the page under WCAG's contrast
 *    formula, which means a dark page can never end up with dark text.
 *
 * Everything here is pure ((theme, colourId) → theme), so it is safe to
 * call during render and trivial to sweep in a test.
 */

import { themeById, type BookTheme } from "./data";

/* ── Colour maths (WCAG 2.1 relative luminance) ─────────────── */

interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Parse `#rgb` / `#rrggbb`. Returns null for anything else — callers
 *  fall back to the base theme rather than rendering a broken page. */
export function parseHex(hex: string): Rgb | null {
  const h = hex.trim().replace(/^#/, "");
  const full = h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

const toHex = ({ r, g, b }: Rgb): string =>
  "#" + ((1 << 24) | (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)).toString(16).slice(1);

/** sRGB → linear, per WCAG 2.1 §relative luminance. */
const channel = (v: number): number => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};

export function relativeLuminance(hex: string): number {
  const c = parseHex(hex);
  if (!c) return 1;
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

/** WCAG contrast ratio, 1 (identical) … 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Linear blend from `from` toward `to`; t=0 is `from`, t=1 is `to`. */
export function mix(from: string, to: string, t: number): string {
  const a = parseHex(from);
  const b = parseHex(to);
  if (!a || !b) return from;
  const k = Math.min(1, Math.max(0, t));
  return toHex({ r: a.r + (b.r - a.r) * k, g: a.g + (b.g - a.g) * k, b: a.b + (b.b - a.b) * k });
}

const rgba = (hex: string, alpha: number): string => {
  const c = parseHex(hex);
  return c ? `rgba(${c.r},${c.g},${c.b},${alpha})` : `rgba(255,255,255,${alpha})`;
};

/* ── The swatches ───────────────────────────────────────────── */

export interface PageColour {
  id: string;
  name: string;
  /** the page background; everything else in the theme is derived */
  hex: string;
}

/**
 * Ten page colours plus "theme".
 *
 * Chosen to sit inside a four-colour press's comfortable range: the
 * lights are paper-like tints rather than pastels, the two darks are
 * deep enough to read as a colour but stop short of the ink coverage
 * where a matte page starts to scuff and show fingerprints. Ordered
 * light → dark so the row reads as a single gradient and the user can
 * see at a glance where the tone flips.
 */
export const PAGE_COLOURS: PageColour[] = [
  { id: "warmwhite", name: "Warm White", hex: "#FBFAF7" },
  { id: "ivory", name: "Ivory", hex: "#F7F1E3" },
  { id: "oat", name: "Oat", hex: "#EDE4D5" },
  { id: "blush", name: "Blush", hex: "#F2DFE0" },
  { id: "mist", name: "Mist", hex: "#DCE4EB" },
  { id: "sage", name: "Sage", hex: "#D9E1D3" },
  { id: "sand", name: "Sand", hex: "#E3D6C0" },
  { id: "stone", name: "Stone", hex: "#C6C3BC" },
  { id: "slate", name: "Slate", hex: "#4F5A65" },
  { id: "ink", name: "Ink", hex: "#2B2F33" },
];

/** Sentinel for "don't override — use the theme's own page colour". */
export const THEME_COLOUR = "theme";

export const pageColourById = (id: string | null | undefined): PageColour | null =>
  PAGE_COLOURS.find((c) => c.id === id) ?? null;

/* ── Derivation ─────────────────────────────────────────────── */

/** The two candidate inks. Near-black rather than pure black so light
 *  pages keep the softer look the themes already have. */
const INK_DARK = "#33332F";
const INK_LIGHT = "#FFFFFF";

/**
 * Rebuild a theme around a new page colour.
 *
 * `id` and `name` are preserved so anything keyed on the theme (the
 * theme picker's selected state, analytics) keeps working; every colour
 * that has to stay legible against the page is recomputed:
 *
 *   ink      whichever of near-black / white wins on contrast — this is
 *            the guarantee that a dark page never gets dark text
 *   soft     the page nudged 9% toward the ink, so empty states read as
 *            a recess in the page rather than a foreign grey
 *   stripes  the placeholder pair, 6% and 12% toward the ink, so the
 *            "photo missing" tile is visible on light and dark alike
 *   scrim    the page itself at 88%, which is what makes a caption
 *            legible over a full-bleed photo
 *   accent   the theme's accent is kept only if it still separates from
 *            the page (≥2:1); a cobalt rule on an ink-black page is
 *            invisible, so it degrades to a strong tint of the ink
 *
 * Returns the theme unchanged for THEME_COLOUR or an unknown id, so a
 * document written by a newer build degrades to the theme default
 * instead of a blank page.
 */
export function deriveTheme(theme: BookTheme, colourId: string | null | undefined): BookTheme {
  if (!colourId || colourId === THEME_COLOUR) return theme;
  const colour = pageColourById(colourId);
  if (!colour) return theme;

  const page = colour.hex;
  const ink = contrastRatio(page, INK_DARK) >= contrastRatio(page, INK_LIGHT) ? INK_DARK : INK_LIGHT;
  const dark = ink === INK_LIGHT;
  const accent = contrastRatio(theme.accent, page) >= 2 ? theme.accent : mix(page, ink, 0.72);

  return {
    ...theme,
    page,
    ink,
    accent,
    soft: mix(page, ink, 0.09),
    stripeA: mix(page, ink, 0.06),
    stripeB: mix(page, ink, 0.12),
    scrim: rgba(page, 0.88),
    dark,
  };
}

/**
 * The theme a book actually renders with.
 *
 * Every screen that draws pages should call this rather than
 * `themeById` — that one answers "which theme did they pick", this one
 * answers "what colours go on the paper", and once page colours exist
 * those are different questions. The two screens that are *choosing* a
 * theme (quiz, reveal) still want `themeById`, because they're
 * previewing the theme itself, not the book.
 */
export const bookTheme = (themeId: string | null | undefined, pageColor?: string | null): BookTheme =>
  deriveTheme(themeById(themeId), pageColor);
