/**
 * Cover patterns — the "Pattern" cover style (owner and Aamir, 2026-11-22:
 * "choose pattern for front (floral)").
 *
 * What: each pattern is a small tile of simple shapes (circles and ellipses)
 * repeated across the front cover, with a plain plate for the title placed by
 * the golden ratio. The SAME data draws the preview (an SVG <pattern> in
 * client/src/features/builder/book.tsx) and the print file (pdfkit in
 * server/print/pdf.ts), so the approved cover is the printed cover.
 *
 * Units: a tile is `tile` units square, and a 220-unit-wide cover holds
 * 220 / tile tiles across (the design canvas drew the covers 220 px wide).
 * Everything scales with the cover, so a phone preview and the 12 in print
 * show the same number of flowers.
 *
 * Colours print in a customer's book, so they are written out here rather
 * than taken from interface tokens: a later brand change must never alter a
 * book someone has already made.
 */

export const PATTERN_IDS = ["floral", "floral-night", "confetti", "leaves"] as const;
export type PatternId = (typeof PATTERN_IDS)[number];

export type PatternShape =
  | { kind: "circle"; x: number; y: number; r: number; fill: string; opacity?: number }
  | { kind: "ellipse"; x: number; y: number; rx: number; ry: number; rotate: number; fill: string; opacity?: number };

export interface CoverPattern {
  id: PatternId;
  name: string;
  /** the cover's ground under the shapes */
  ground: string;
  /** tile edge, in units of a 220-unit-wide cover */
  tile: number;
  shapes: PatternShape[];
  /** the title plate's colour and the words on it */
  plate: string;
  ink: string;
}

/** Five petals round a centre: the flower used by both floral patterns. */
function flower(cx: number, cy: number, r: number, petal: string, centre: string): PatternShape[] {
  const d = r * 1.25;
  const petals = [0, 72, 144, 216, 288].map((deg) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return { kind: "circle" as const, x: cx + d * Math.cos(a), y: cy + d * Math.sin(a), r, fill: petal };
  });
  return [...petals, { kind: "circle", x: cx, y: cy, r: r * 0.65, fill: centre }];
}

export const COVER_PATTERNS: CoverPattern[] = [
  {
    id: "floral",
    name: "Floral",
    ground: "#FBF6F0",
    tile: 44,
    shapes: [
      ...flower(11, 11, 4, "#F595A9", "#CA3A58"),
      ...flower(33, 33, 3.2, "#B2AEC4", "#2A1E5C"),
      { kind: "ellipse", x: 34, y: 10, rx: 4, ry: 2, rotate: -20, fill: "#92D9D3" },
      { kind: "ellipse", x: 12, y: 32, rx: 4, ry: 2, rotate: 20, fill: "#92D9D3" },
    ],
    plate: "#FFFFFF",
    ink: "#33332F",
  },
  {
    id: "floral-night",
    name: "Floral Night",
    ground: "#2A1E5C",
    tile: 44,
    shapes: [...flower(11, 11, 4, "#F595A9", "#FBF6F0"), ...flower(33, 33, 3.2, "#595080", "#F9BBC8")],
    plate: "#FBF6F0",
    ink: "#2A1E5C",
  },
  {
    id: "confetti",
    name: "Confetti",
    ground: "#FBF6F0",
    tile: 26,
    shapes: [
      { kind: "circle", x: 6, y: 6, r: 3, fill: "#EE4266" },
      { kind: "circle", x: 19, y: 19, r: 2.2, fill: "#2A1E5C" },
    ],
    plate: "#FFFFFF",
    ink: "#33332F",
  },
  {
    id: "leaves",
    name: "Leaves",
    ground: "#E4E8DC",
    tile: 36,
    shapes: [
      { kind: "ellipse", x: 12, y: 12, rx: 8, ry: 3.6, rotate: 30, fill: "#5E7350", opacity: 0.55 },
      { kind: "ellipse", x: 30, y: 30, rx: 8, ry: 3.6, rotate: -30, fill: "#5E7350", opacity: 0.55 },
    ],
    plate: "#FFFFFF",
    ink: "#33332F",
  },
];

export const patternById = (id: string | null | undefined): CoverPattern => COVER_PATTERNS.find((p) => p.id === id) ?? COVER_PATTERNS[0];

/**
 * Where the title plate sits, as fractions of the cover: its top edge on the
 * 61.8% line (golden ratio), inside the 0.75 in margin, and wide enough for
 * the 6 in title box with room around it.
 */
export const PATTERN_PLATE = { x: 0.18, y: 0.618, w: 0.64, h: 0.255 };

/** Units of the pattern grid per cover width (see the header). */
export const PATTERN_COVER_UNITS = 220;
