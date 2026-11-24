/**
 * Book font pairs: one heading face + one body face, picked per book.
 *
 * What: the owner's eight pairs ("[01] Guidelines Names and Pairings.png" in
 * Website Assets_v3, 2026-11-22). The heading face sets the cover title and
 * the title page; the body face sets the line under the title and the
 * captions. Each occasion starts on the pair its "Best for" column names.
 *
 * Where the letters come from: all faces are Fontshare (Indian Type Foundry)
 * fonts, used under ITF's free licence while the product is a prototype
 * (owner, 2026-11-24; ADR 020). No font file is in this repository, which is
 * public: the browser loads them from Fontshare's CSS service
 * (client/src/features/builder/fonts.ts) and the print pipeline downloads the
 * TrueType files from the same service into a cache (server/print/fonts.ts).
 * When the commercial licence arrives, only those two loaders change.
 *
 * One list, two readers: the preview and the print read the same faces and
 * weights from here, so what the customer approved is what prints.
 *
 * Older books keep their typeface: "classic" (Clash Display), "editorial",
 * "modern" and "script" were the four choices before the pairs. They are
 * retired from the pickers, still valid in saved books and orders
 * (BOOK_FONT_IDS), and print as they always did.
 */

/** One face: the family name both CSS and Fontshare use, its Fontshare slug, and the weight. */
export interface FontFace {
  family: string;
  /** Fontshare's id for the family, as in api.fontshare.com/v2/css?f[]=<slug>@<weight> */
  slug: string;
  weight: number;
  /** CSS fallback stack while the face loads */
  fallback: string;
}

export interface FontPair {
  id: PairId;
  /** the mood name shown in the pickers */
  name: string;
  /** the owner's "Best for" column, shown as a hint */
  bestFor: string;
  head: FontFace;
  body: FontFace;
}

export type PairId = "warm" | "elegant" | "romantic" | "soft" | "playful" | "bold" | "adventure" | "timeless";

const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "system-ui, -apple-system, 'Segoe UI', sans-serif";
const HAND = "'Segoe Print', 'Comic Sans MS', cursive";

const face = (family: string, slug: string, weight: number, fallback: string): FontFace => ({ family, slug, weight, fallback });

/** The eight pairs, in the owner's order. The first is the default. */
export const FONT_PAIRS: FontPair[] = [
  { id: "warm", name: "Warm Classic", bestFor: "Family, Eid, everyday albums", head: face("Zodiak", "zodiak", 700, SERIF), body: face("Plus Jakarta Sans", "plus-jakarta-sans", 400, SANS) },
  { id: "elegant", name: "Elegant", bestFor: "Wedding, nikah, mehndi, engagement", head: face("Boska", "boska", 500, SERIF), body: face("Switzer", "switzer", 400, SANS) },
  { id: "romantic", name: "Romantic", bestFor: "Anniversary, couple books, gifts for a partner", head: face("Rosaline", "rosaline", 400, SERIF), body: face("Satoshi", "satoshi", 400, SANS) },
  { id: "soft", name: "Soft", bestFor: "Newborn, baby's first year, aqeeqa", head: face("Roundo", "roundo", 500, SANS), body: face("Pilcrow Rounded", "pilcrow-rounded", 400, SANS) },
  { id: "playful", name: "Playful", bestFor: "Kids' birthdays, school memories", head: face("Comico", "comico", 400, HAND), body: face("Zodiak", "zodiak", 400, SERIF) },
  { id: "bold", name: "Bold & Modern", bestFor: "Adult birthdays, friends, graduation", head: face("Cabinet Grotesk", "cabinet-grotesk", 800, SANS), body: face("Satoshi", "satoshi", 500, SANS) },
  { id: "adventure", name: "Adventure", bestFor: "Travel, road trips, honeymoon", head: face("Sharpie", "sharpie", 800, HAND), body: face("Ranade", "ranade", 400, SANS) },
  { id: "timeless", name: "Timeless", bestFor: "Parents, grandparents, memorial, heritage", head: face("Gambarino", "gambarino", 400, SERIF), body: face("Switzer", "switzer", 400, SANS) },
];

export const DEFAULT_PAIR: PairId = "warm";

/** The four typefaces from before the pairs: kept for saved books, not offered. */
export const LEGACY_FONT_IDS = ["classic", "editorial", "modern", "script"] as const;
export type LegacyFontId = (typeof LEGACY_FONT_IDS)[number];

/** Every id a saved book may carry (shared/document.ts validates against this). */
export type BookFontId = LegacyFontId | PairId;
export const BOOK_FONT_IDS = [...LEGACY_FONT_IDS, ...FONT_PAIRS.map((p) => p.id)] as [BookFontId, ...BookFontId[]];

export const pairById = (id: string | null | undefined): FontPair | null => FONT_PAIRS.find((p) => p.id === id) ?? null;

/**
 * The pair a new book starts on, by occasion (data.ts OCCASIONS), from the
 * owner's "Best for" column. "Birthday or grad" takes Playful: most of these
 * books are children's birthdays. Anything else is Warm Classic.
 */
export const OCCASION_PAIR: Record<string, PairId> = {
  wedding: "elegant",
  baby: "soft",
  birthday: "playful",
  travel: "adventure",
  mix: "warm",
};
export const pairForOccasion = (occasion: string | null | undefined): PairId => (occasion && OCCASION_PAIR[occasion]) || DEFAULT_PAIR;

/** Every distinct face the pairs use (for loading them once each). */
export function allPairFaces(): FontFace[] {
  const seen = new Map<string, FontFace>();
  for (const p of FONT_PAIRS) for (const f of [p.head, p.body]) seen.set(`${f.slug}@${f.weight}`, f);
  return Array.from(seen.values());
}

/** Fontshare's stylesheet for one face. The service answers one family per request. */
export const fontshareCssUrl = (f: FontFace) => `https://api.fontshare.com/v2/css?f[]=${f.slug}@${f.weight}&display=swap`;
