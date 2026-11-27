/**
 * Book builder — data layer: themes, occasions, quiz vibes, copy voices,
 * bindings, and the deterministic page generator.
 *
 * Ported from the design-system prototype (`book_builder/data.jsx`,
 * referenced by the updated shell `~/Downloads/app.jsx`) and typed.
 *
 * Design notes:
 *  - OCCASIONS carry curated per-photo caption labels. For real uploads
 *    we assign labels round-robin (see UploadScreen) so generated pages
 *    get human captions immediately; a Claude-vision captioner can swap
 *    in behind the same field later (Phase 4 of the roadmap).
 *  - generatePages() is the deterministic "auto-design": it walks a
 *    density-specific layout pattern and deals photos into slots. It is
 *    pure ((photos, density) → pages), so re-running it on a density
 *    change is safe and cheap.
 */

import { PRICE_LIST } from "@shared/pricing";
import { arrangeBook, arrangementOf, MAX_PER_PAGE, relayoutPage } from "./arrange";

/* ── Book themes ────────────────────────────────────────────── */

export interface BookTheme {
  id: string;
  name: string;
  /** page background */
  page: string;
  /** text color on the page */
  ink: string;
  /** rule/accent color */
  accent: string;
  /** soft fill used for empty states */
  soft: string;
  /** placeholder stripe pair */
  stripeA: string;
  stripeB: string;
  /** translucent pill behind captions on full-bleed pages */
  scrim: string;
  /**
   * True when the page is dark enough that `ink` has to be light.
   *
   * This used to be spelled `theme.id === "cobalt"` at each call site,
   * which was correct while the four themes were the only page colours
   * in existence. Page colours (see `palette.ts`) break that: an ivory
   * book on the "Ink" swatch is dark and is not cobalt. So the fact is
   * carried on the theme rather than re-derived from its id.
   */
  dark: boolean;
}

export const BOOK_THEMES: BookTheme[] = [
  { id: "ivory", name: "Timeless Ivory", page: "#FAF7EE", ink: "#3C3C3B", accent: "#1D46A0", soft: "#EFEAD9", stripeA: "#EFE9D6", stripeB: "#E5DEC6", scrim: "rgba(250,247,238,0.88)", dark: false },
  // Kept so books saved with this look still render exactly as they did. New
  // books get Bold Indigo instead; see pickableThemes().
  { id: "cobalt", name: "Bold Cobalt", page: "#1D46A0", ink: "#FFFFFF", accent: "#F5D547", soft: "#2a5cc0", stripeA: "#2A57B4", stripeB: "#3160BD", scrim: "rgba(20,52,120,0.82)", dark: true },
  { id: "indigo", name: "Bold Indigo", page: "#2A1E5C", ink: "#FFFFFF", accent: "#F595A9", soft: "#251C4F", stripeA: "#251C4F", stripeB: "#201943", scrim: "rgba(32,25,67,0.82)", dark: true },
  { id: "blush", name: "Soft Blush", page: "#F9EEEF", ink: "#3C3C3B", accent: "#DB3069", soft: "#F2DEE0", stripeA: "#F4E2E4", stripeB: "#EBD3D6", scrim: "rgba(249,238,239,0.88)", dark: false },
  { id: "gallery", name: "Gallery White", page: "#FFFFFF", ink: "#3C3C3B", accent: "#3C3C3B", soft: "#F1F1EE", stripeA: "#F1F1EE", stripeB: "#E5E5E0", scrim: "rgba(255,255,255,0.88)", dark: false },
  // Editor v2 looks (2026-10-18). Derived the same way palette.ts derives
  // a page colour: soft/stripes are the page nudged 9/6/12% toward the ink.
  // Each ships with a default typeface + photo edge in looks.ts.
  { id: "sage", name: "Sage Garden", page: "#E4E8DC", ink: "#33332F", accent: "#5E7350", soft: "#D4D8CC", stripeA: "#D9DDD2", stripeB: "#CFD2C7", scrim: "rgba(228,232,220,0.88)", dark: false },
  { id: "midnight", name: "Midnight", page: "#23262B", ink: "#F7F4EC", accent: "#F5D547", soft: "#36393C", stripeA: "#303237", stripeB: "#3C3F42", scrim: "rgba(35,38,43,0.88)", dark: true },
  { id: "golden", name: "Golden Hour", page: "#F6E7C8", ink: "#33332F", accent: "#B07428", soft: "#E4D7BA", stripeA: "#EADCBF", stripeB: "#DFD1B6", scrim: "rgba(246,231,200,0.88)", dark: false },
  { id: "kraft", name: "Kraft Journal", page: "#D9C3A0", ink: "#33332F", accent: "#6E4A26", soft: "#CAB696", stripeA: "#CFBA99", stripeB: "#C5B292", scrim: "rgba(217,195,160,0.88)", dark: false },
];

/**
 * Longest book title and line under it (owner, 2026-11-22): the title sits in
 * a box at most 6 in wide on a 12 in cover and wraps to two lines, never
 * stretched toward the edges. 32 characters is what two lines hold at the
 * smallest title size we allow; the line under it is one line.
 */
export const TITLE_MAX = 32;
export const LINE_MAX = 40;

export const themeById = (id: string | null | undefined): BookTheme =>
  BOOK_THEMES.find((t) => t.id === id) ?? BOOK_THEMES[0];

/** Looks no longer offered to new books, still drawn for books that use them. */
// owner, 2026-11-26: four looks left in the editor (Gallery White, Soft Blush, Sage Garden, Golden Hour)
const RETIRED_THEMES = new Set(["cobalt", "ivory", "indigo", "midnight", "kraft"]);

/**
 * The looks to offer in a picker: everything current, plus the book's own look
 * if it has been retired, so a saved book's choice stays visible and selected.
 */
export const pickableThemes = (currentId?: string | null): BookTheme[] =>
  BOOK_THEMES.filter((t) => !RETIRED_THEMES.has(t.id) || t.id === currentId);

/* ── Occasions (quiz step 1) ────────────────────────────────── */

export interface Occasion {
  id: string;
  label: string;
  /** lucide icon name rendered by the quiz (mapped in QuizScreen) */
  icon: "Heart" | "Baby" | "Plane" | "Cake" | "Sparkles";
  suggestedTitle: string;
  subtitle: string;
  /** curated caption labels, assigned to photos round-robin */
  photoLabels: string[];
}

export const OCCASIONS: Occasion[] = [
  {
    id: "wedding", label: "Weddings", icon: "Heart", suggestedTitle: "The Day We Said Yes", subtitle: "June, twenty twenty-six",
    photoLabels: ["getting ready", "the first look", "walking down", "the vows", "ring exchange", "the first kiss", "family portrait", "golden hour", "the speeches", "first dance", "cake cutting", "on the dance floor", "quiet moment", "the send-off", "the details", "her bouquet"],
  },
  {
    id: "baby", label: "New baby", icon: "Baby", suggestedTitle: "Hello, Little One", subtitle: "The first year",
    photoLabels: ["coming home", "tiny toes", "first yawn", "nap time", "little hands", "bath time", "first smile", "with grandma", "the nursery", "sunday morning", "first steps", "messy lunch", "story time", "fast asleep", "first birthday", "family of three"],
  },
  {
    id: "travel", label: "Travel", icon: "Plane", suggestedTitle: "The Long Way Home", subtitle: "An adventure in pictures",
    photoLabels: ["the departure", "street market", "morning coffee", "mountain pass", "local faces", "the old town", "sunset point", "roadside stop", "hidden beach", "night lights", "the long road", "last evening", "window seat", "city rooftops", "the harbour", "souvenirs"],
  },
  {
    id: "birthday", label: "Birthdays", icon: "Cake", suggestedTitle: "What a Day It Was", subtitle: "A celebration to keep",
    photoLabels: ["the setup", "guests arriving", "party hats", "make a wish", "the candles", "best friends", "the big laugh", "gift opening", "group photo", "the cake", "confetti", "dancing", "quiet smiles", "the toast", "one more slice", "goodnight"],
  },
  {
    id: "mix", label: "Your own mix", icon: "Sparkles", suggestedTitle: "The Good Days", subtitle: "Moments worth keeping",
    photoLabels: ["sunday breakfast", "at the lake", "her birthday", "first snow", "the new house", "summer evening", "road trip", "family dinner", "the garden", "game night", "morning walk", "the recital", "holiday lights", "lazy afternoon", "the reunion", "home again"],
  },
];

export const occasionById = (id: string | null | undefined): Occasion =>
  OCCASIONS.find((o) => o.id === id) ?? OCCASIONS[4];

/* ── Vibes (quiz step 2) — each maps 1:1 to a book theme ────── */

export interface Vibe {
  id: string;
  name: string;
  blurb: string;
}

export const VIBES: Vibe[] = [
  { id: "ivory", name: "Timeless", blurb: "Warm ivory, classic type" },
  { id: "indigo", name: "Bold", blurb: "Deep indigo, confident" },
  { id: "blush", name: "Soft", blurb: "Gentle blush, romantic" },
  { id: "gallery", name: "Minimal", blurb: "Pure white, gallery-calm" },
];

/* ── Cover styles / densities / bindings ────────────────────── */

export type CoverStyleId = "full" | "framed" | "minimal" | "split" | "classic" | "moment" | "signature" | "pattern";
export const COVER_STYLES: Array<{ id: CoverStyleId; name: string }> = [
  { id: "classic", name: "Minimal" },
  { id: "moment", name: "Photo cover" },
  { id: "minimal", name: "Just text" },
  // a patterned front with the title on a plate (2026-11-22; shared/patterns.ts)
  { id: "pattern", name: "Pattern" },
  { id: "full", name: "Full photo" },
  { id: "framed", name: "Framed" },
  { id: "split", name: "Split" },
  { id: "signature", name: "Truekeeps Design" },
];

/**
 * "Truekeeps Design" (signature) was replaced by "Just text" on 2026-11-21
 * (owner). It still draws, so books saved with it print as they were, and a
 * picker shows it only to a book that already uses it.
 */
// Pattern is hidden for now (owner, 2026-11-26); an album that already has one keeps it and still sees it listed
const RETIRED_COVERS = new Set<CoverStyleId>(["signature", "pattern"]);
export const pickableCoverStyles = (current?: CoverStyleId | null) =>
  COVER_STYLES.filter((c) => !RETIRED_COVERS.has(c.id) || c.id === current);

/**
 * The three covers offered first, while the photos upload ("Pick the feel",
 * step 3 of the owner's flow). Names are the owner's, from the flow brief of
 * 2026-11-15; the ids predate them and stay, because saved books carry them.
 */
export const FEEL_CHOICES: Array<{ id: CoverStyleId; name: string; line: string }> = [
  { id: "classic", name: "Minimal", line: "A small photo and your title." },
  { id: "moment", name: "Photo cover", line: "One big photo, your title on the spine." },
  { id: "minimal", name: "Just text", line: "Your title and a line. No photo." },
];

/** The cover styles that show a photo (the cover photo choice applies to these). */
export const coverHasPhoto = (id: CoverStyleId): boolean => id !== "minimal" && id !== "pattern";

/** Has the customer made this choice yet? The default cover isn't one of these. */
export function isFeelChoice(id: CoverStyleId): boolean {
  return FEEL_CHOICES.some((f) => f.id === id);
}

/**
 * Signature cover art, one per occasion. This prints in the customer's book,
 * so its colours are written out rather than taken from interface tokens: a
 * later brand change must never alter a book someone has already made.
 */
export interface SignatureArt {
  name: string;
  ground: string;
  pattern: string;
  size: string;
}
const SIGNATURES: Record<string, SignatureArt> = {
  travel: {
    name: "Postcard",
    ground: "#FBF6F0",
    pattern: "repeating-linear-gradient(135deg, #EE4266 0 12px, #FBF6F0 12px 24px, #2A1E5C 24px 36px, #FBF6F0 36px 48px)",
    size: "auto",
  },
  birthday: {
    name: "Confetti",
    ground: "#FBF6F0",
    pattern:
      "radial-gradient(circle at 20% 30%, #EE4266 0 7%, transparent 8%), radial-gradient(circle at 70% 20%, #2A1E5C 0 5%, transparent 6%), radial-gradient(circle at 55% 70%, #F595A9 0 9%, transparent 10%), radial-gradient(circle at 15% 80%, #8881A4 0 5%, transparent 6%)",
    size: "26% 21%",
  },
  baby: {
    name: "Little Stars",
    ground: "#201943",
    pattern:
      "radial-gradient(circle at 30% 30%, #FBF6F0 0 5%, transparent 6%), radial-gradient(circle at 70% 60%, #F9BBC8 0 5%, transparent 6%), radial-gradient(circle at 50% 85%, #B2AEC4 0 4%, transparent 5%)",
    size: "18% 14%",
  },
  wedding: {
    name: "Together",
    ground: "#A5324A",
    pattern: "repeating-linear-gradient(45deg, #CA3A58 0 6px, #A5324A 6px 12px)",
    size: "auto",
  },
  mix: {
    name: "Everyday",
    ground: "#2A1E5C",
    pattern: "repeating-linear-gradient(45deg, #595080 0 2px, transparent 2px 10px), repeating-linear-gradient(-45deg, #595080 0 2px, transparent 2px 10px)",
    size: "auto",
  },
};

/** The Signature art for an occasion. */
export function signatureFor(occasionId: string): SignatureArt {
  return SIGNATURES[occasionId] ?? SIGNATURES.mix;
}

/**
 * How full the pages are. Since 2026-11-17 these are the three arrangements of
 * "Pick your book" (see arrange.ts); the stored ids predate the names and stay,
 * so every saved book and the server schema still read them.
 */
export type DensityId = "minimal" | "balanced" | "collage";
export const DENSITIES: Array<{ id: DensityId; name: string; blurb: string }> = [
  { id: "minimal", name: "Story", blurb: "1 to 2 photos a page" },
  { id: "balanced", name: "Classic", blurb: "2 to 4 photos a page" },
  { id: "collage", name: "Gallery", blurb: "4 to 6 photos a page" },
];

export interface Binding {
  id: string;
  name: string;
  /** what the binding is; every binding costs the same (shared/pricing.ts) */
  blurb: string;
}
/** Bindings come from shared/pricing.ts so the server's quote and what the
 *  customer sees can never drift. */
export const BINDINGS: Binding[] = PRICE_LIST.bindings.map((b) => ({ id: b.id, name: b.name, blurb: b.blurb }));

/* ── Copy voices ────────────────────────────────────────────── */
/* Every user-facing headline/CTA lives here so tone is switchable
   (and later A/B-testable) without touching components. */

export interface CopyVoice {
  occasionSub: string;
  quizHello: string;
  quizSub: string;
  qOccasion: string;
  qVibe: string;
  qTitle: string;
  titleHint: string;
  uploadTitle: string;
  uploadSub: string;
  uploadCta: string;
  uploadMore: string;
  generating: string[];
  revealTitle: string;
  revealSub: string;
  ourPick: string;
  openBook: string;
  previewHint: string;
  orderCta: string;
  customizeCta: string;
  customizeTitle: string;
  customizeSub: string;
  orderTitle: string;
  orderSub: string;
  placeOrder: string;
  confirmTitle: string;
  confirmSub: string;
}

export const COPY: Record<"warm" | "concise", CopyVoice> = {
  warm: {
    occasionSub: "Tap the one that fits best. You can always come back and change it.",
    quizHello: "Let's make your book",
    quizSub: "Two small things while your photos upload. Then you pick your book.",
    qOccasion: "Let's start with the occasion.",
    qVibe: "Pick a feel for your book",
    qTitle: "What should we call it?",
    titleHint: "Not sure? Try a few. Your cover updates live as you tap.",
    uploadTitle: "Let's add your photos",
    uploadSub: "Don't worry about the order or the layout. That's our job.",
    uploadCta: "Select photos",
    uploadMore: "Add more",
    generating: ["Looking through your photos…", "Arranging your moments…", "Laying out your pages…", "Adding the finishing touches…"],
    revealTitle: "Here is your book — three ways",
    revealSub: "Same photos, three feels. Pick the one that feels like you.",
    ourPick: "Our pick for you",
    openBook: "Open this book",
    previewHint: "Use the arrows to turn the pages.",
    orderCta: "I love it, order my book",
    customizeCta: "Make it mine",
    customizeTitle: "Make it yours",
    customizeSub: "Tap any page to change it. Nothing can go wrong.",
    orderTitle: "Let's get it to you",
    orderSub: "A few details and your album goes to print.",
    placeOrder: "Continue to secure payment",
    confirmTitle: "It's on its way to print",
    confirmSub: "We'll email you the moment it ships. Your book is saved here — come back anytime.",
  },
  concise: {
    occasionSub: "Choose one, then add photos.",
    quizHello: "Create your book",
    quizSub: "Two quick questions.",
    qOccasion: "What's the occasion?",
    qVibe: "Choose a cover",
    qTitle: "Name your book",
    titleHint: "You can edit this later.",
    uploadTitle: "Upload photos",
    uploadSub: "We arrange everything automatically.",
    uploadCta: "Add photos",
    uploadMore: "Add more",
    generating: ["Reading your photos…", "Arranging photos…", "Building layouts…", "Finalizing…"],
    revealTitle: "Your book, three ways",
    revealSub: "Pick a direction.",
    ourPick: "Recommended",
    openBook: "Open book",
    previewHint: "Click the right page to turn.",
    orderCta: "Order now",
    customizeCta: "Customize",
    customizeTitle: "Customize",
    customizeSub: "Select a page to edit it.",
    orderTitle: "Order summary",
    orderSub: "Review and confirm.",
    placeOrder: "Pay securely",
    confirmTitle: "Order placed",
    confirmSub: "We'll email you when it ships.",
  },
};

/* ── Photos ─────────────────────────────────────────────────── */

/**
 * A photo in the builder. A server `url` (from the media pipeline)
 * persists in the localStorage draft; a session-only data: URL fallback
 * does not, so after a reload that tile falls back to its labelled
 * placeholder — the book structure (pages/slots/captions) survives
 * regardless.
 *
 * `w`/`h` are the TRUE pixel dimensions of the uploaded bytes,
 * EXIF-rotated, captured at upload time (see lib/uploads.ts). They are
 * what every print-quality decision keys off: the aspect ratio drives
 * which slot a photo belongs in, and the pixel count sets the ceiling
 * on how far the user can zoom before the page would print soft. They
 * are optional because HEIC can't be decoded in most browsers — an
 * absent w/h means "unknown", never "zero", and callers must degrade
 * gracefully rather than assume the worst.
 */
export interface BuilderPhoto {
  id: string;
  label: string;
  /** 0–2, subtly varies the placeholder tint */
  shade: number;
  url?: string;
  /** natural pixel width, EXIF-rotated; undefined = not measurable */
  w?: number;
  /** natural pixel height, EXIF-rotated; undefined = not measurable */
  h?: number;
  /** sharpness measured while uploading (prepare.ts); compared within the book by quality.ts */
  sharp?: number;
  /** false while the HD original we print from is still on the customer's device */
  hd?: boolean;
  /** fingerprint of the source file, to match it again after a closed tab */
  fp?: string;
  /** the file's name, for the re-add list */
  name?: string;
  /** when it was taken (EXIF), local time in ms, for the re-add list */
  taken?: number;
}

/* ── Page generation ────────────────────────────────────────── */

/**
 * The seven page shapes.
 *
 * Seven is a deliberate number. Four (the original set) left obvious
 * gaps — there was no way to put two portraits beside each other, and no
 * calm way to show three. Beyond seven the picker stops being a glance
 * and starts being a decision, which is exactly the clutter we are
 * avoiding; anything more expressive belongs in per-occasion templates
 * later, not in the everyday grid.
 *
 * The pairing is what makes it legible: each photo count offers one
 * quiet option and one livelier one.
 *   1 photo  — full (bleed)        / single (framed, captionable)
 *   2 photos — duo (stacked)       / duo-side (side by side)
 *   3 photos — collage (scattered) / trio-strip (a row of three)
 */
export type PageLayoutId = "title" | "full" | "single" | "duo" | "duo-side" | "collage" | "trio-strip" | "grid";

/**
 * Where one slot sits on a "grid" page, as fractions of the page (0–1).
 *
 * The seven named layouts above get their slot positions from builder.css;
 * a grid page carries its own, because the layout engine (arrange.ts) picks
 * from 26 templates and reshapes a slot when a photo would otherwise lose
 * too much of itself or print soft. Storing the result keeps the preview, the
 * editors and the print files drawing exactly the same rectangles.
 */
export interface PageFrame {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * How ONE photo sits inside ONE slot.
 *
 * The framing is stored as a normalised focal point plus a zoom factor,
 * NOT as a crop rectangle in pixels. This matters more than it looks:
 *
 *  - A crop rect is expressed in the aspect ratio of the frame it was
 *    cut for. Change the page layout (full → duo), mirror the spread,
 *    or reflow the book, and that rect is meaningless — you get either
 *    a distorted photo or a silent re-centre that throws the user's
 *    work away.
 *  - A focal point is aspect-independent. It survives every one of
 *    those operations, because it says "keep THIS part of the photo in
 *    view" rather than "show exactly these pixels".
 *
 * It also maps 1:1 onto CSS with no arithmetic: `fx`/`fy` become
 * `object-position`, `zoom` becomes `scale()` about that same origin.
 * Per the CSS spec, percentage object-position aligns the image's
 * (fx,fy) point with the box's (fx,fy) point, which guarantees the box
 * stays fully covered for ANY fx,fy in [0,1] — and scaling about that
 * same origin preserves the guarantee for any zoom >= 1. So the photo
 * can never be stretched, letterboxed, or pulled off its own edge.
 */
export interface Placement {
  photoId: string;
  /** focal point X, 0–1 (0 = show the left edge, 1 = the right) */
  fx: number;
  /** focal point Y, 0–1 */
  fy: number;
  /** >= 1; 1 means "exactly cover the slot", 2 means "twice as close" */
  zoom: number;
  /** quarter turns — free, because a turned photo is cover-fitted to the
   *  slot's TRANSPOSED box and rotated about its centre, so it lands back
   *  on the slot exactly and costs no resolution at all (see `turnBox`) */
  turn: 0 | 90 | 180 | 270;
  /**
   * Fine rotation in degrees, for straightening a crooked horizon.
   * Absent or 0 on almost every placement.
   *
   * Unlike a quarter turn this is NOT free: a rectangle rotated by a
   * non-right angle no longer covers its own box, so the photo has to be
   * scaled up to hide the corners, and that scale spends resolution.
   * The cost is exact and knowable — `tiltCover` in print.ts — so it is
   * folded into the same DPI budget the zoom slider already respects,
   * which is why the zoom track visibly shortens as you straighten.
   *
   * Bounded to ±TILT_MAX. Straightening is a correction, not a
   * composition tool; past ten degrees you are cropping away a third of
   * the frame to fix something a re-shoot would fix better.
   */
  tilt?: number;
}

/**
 * Centred, unzoomed, upright, level — what auto-design produces.
 *
 * `tilt` is listed even though it is optional on the interface, because
 * "Reset" is implemented as `{ ...DEFAULT_FRAMING }`: a key missing here
 * is a key reset silently fails to clear.
 */
export const DEFAULT_FRAMING = { fx: 0.5, fy: 0.5, zoom: 1, turn: 0, tilt: 0 } as const;

/** Build a Placement, defaulting anything unspecified to centred/unzoomed. */
export const placement = (photoId: string, over: Partial<Omit<Placement, "photoId">> = {}): Placement => ({
  photoId,
  ...DEFAULT_FRAMING,
  ...over,
});

export interface BookPage {
  id: string;
  layout: PageLayoutId;
  /** one entry per filled slot, in slot order */
  slots: Placement[];
  caption: string;
  /**
   * Flip an asymmetric layout left-to-right. Only `collage` is
   * asymmetric, so only collage pages ever set it.
   *
   * It exists because a collage page facing a collage page across the
   * gutter leans the same way twice, which reads as a mistake. Mirroring
   * one of them makes the spread sit level. It is a CSS-only flip of the
   * tile positions (see `.bb-mirror`), NOT a transform on the photos —
   * scaleX(-1) on the page would print every face reversed.
   */
  mirror?: boolean;
  /**
   * Page-colour override for THIS page only (a palette id or "#RRGGBB"),
   * set by the editor's "This spread" colour scope. Absent = the book's
   * colour. Resolved through palette.ts like the book colour, so the ink
   * still flips by contrast on a dark page.
   */
  bg?: string | null;
  /** "grid" pages only: one rectangle per slot, in slot order */
  frames?: PageFrame[];
}

/** Read-only view for the many call sites that only care about identity. */
export const pagePhotoIds = (page: BookPage): string[] => page.slots.map((s) => s.photoId);

export interface Spread {
  left: BookPage | null;
  right: BookPage | null;
}

/** How many photo slots each layout holds. */
export const LAYOUT_SLOTS: Record<PageLayoutId, number> = {
  title: 0,
  full: 1,
  single: 1,
  duo: 2,
  "duo-side": 2,
  collage: 3,
  "trio-strip": 3,
  /** a grid page holds as many as it has frames; this is the most it can */
  grid: MAX_PER_PAGE,
};

/** The most photos THIS page can take: a grid page up to six, the named layouts three. */
export const pageCapacity = (page: Pick<BookPage, "layout">): number =>
  page.layout === "grid" ? MAX_PER_PAGE : MAX_SLOTS_PER_PAGE;

/**
 * The page with a new set of photos on it (one added, removed or moved in).
 *
 * A grid page is laid out again by the engine, so it keeps its promises
 * (shape match, crop cap, sharpness) with the new photos. A named layout
 * changes to the layout of the same character for the new count, as before.
 * Null when the page has no photos left: the caller decides whether that is a
 * page to delete or a drop to refuse.
 */
export function reshapePage(page: BookPage, slots: Placement[], photos: BuilderPhoto[], pageIndex: number): BookPage | null {
  if (page.layout === "grid") return relayoutPage(page, slots, photos, pageIndex);
  const layout = layoutForCount(page.layout, slots.length);
  if (!layout) return null;
  return { ...page, layout, slots, mirror: isMirrorable(layout) ? page.mirror : undefined };
}

/**
 * The picker's contents, in picker order.
 *
 * Names are short and concrete because they sit under a picture of the
 * layout: the thumbnail says what the shape is, the word only has to
 * disambiguate it from its neighbour. "Two photos" became "Stacked" for
 * exactly that reason — the count is already a group header, so spending
 * the label on it was wasted.
 */
export const LAYOUTS: Array<{ id: Exclude<PageLayoutId, "title" | "grid">; name: string; slots: number }> = [
  { id: "full", name: "Full page", slots: 1 },
  { id: "single", name: "Framed", slots: 1 },
  { id: "duo", name: "Stacked", slots: 2 },
  { id: "duo-side", name: "Side by side", slots: 2 },
  { id: "collage", name: "Collage", slots: 3 },
  { id: "trio-strip", name: "Row of three", slots: 3 },
];

/** Only asymmetric layouts can be mirrored; for the rest it's a no-op. */
export const isMirrorable = (layout: PageLayoutId): boolean => layout === "collage";

/**
 * Which layout a page should adopt when its photo count changes under
 * it — a photo removed, or one dragged in from the filmstrip.
 *
 * The page has to re-shape itself, because a layout is a promise about
 * how many photos are on the page and leaving a collage with two photos
 * in it would leave a hole. The only question is WHICH layout, and the
 * answer that surprises people least is the one that looks most like
 * where they already were. So the map is by character, not by index:
 * the airy layouts stay airy, the busy ones stay busy, and a page the
 * user had deliberately made calm does not turn into a collage because
 * they dragged one more photo onto it.
 *
 * Returning null means "this page has no photos left" — the caller
 * decides whether that is a page to delete or a drop to refuse, which
 * are different questions this function has no business answering.
 */
const LAYOUT_LADDER: Record<Exclude<PageLayoutId, "title" | "grid">, Array<Exclude<PageLayoutId, "title" | "grid">>> = {
  //          1 photo    2 photos      3 photos
  full: ["full", "duo", "collage"],
  single: ["single", "duo", "collage"],
  duo: ["single", "duo", "collage"],
  "duo-side": ["single", "duo-side", "trio-strip"],
  collage: ["full", "duo", "collage"],
  "trio-strip": ["single", "duo-side", "trio-strip"],
};

export function layoutForCount(from: PageLayoutId, count: number): PageLayoutId | null {
  if (count <= 0) return null;
  const ladder = LAYOUT_LADDER[from as Exclude<PageLayoutId, "title" | "grid">] ?? LAYOUT_LADDER.single;
  // Above three there is nothing to grow into; the caller is expected to
  // have refused the drop before getting here, but clamping beats
  // returning undefined and rendering an empty page.
  return ladder[Math.min(count, 3) - 1];
}

/** The most photos any one page can hold, i.e. the top of the ladder. */
export const MAX_SLOTS_PER_PAGE = 3;

/**
 * Can this page carry a caption? (owner, 2026-11-22: "a caption never goes
 * over a photo".) A full-page photo and the collage have no paper left for
 * words, so they don't take one; an engine ("grid") page does, by making room
 * for it (captionFrames in editor-v2/book-ops.ts).
 */
export const captionable = (page: Pick<BookPage, "layout">): boolean =>
  page.layout === "single" || page.layout === "duo" || page.layout === "duo-side" || page.layout === "trio-strip" || page.layout === "grid";

/**
 * Caption type size as a fraction of the page width: the golden-ratio type
 * scale (owner, 2026-11-22) puts a caption at title ÷ φ², and the cover title
 * is about 0.054 of the width, so 0.054 / 2.618 ≈ 0.021 (about 18 pt on a
 * 12 in page). builder.css and the print PDFs (server/print/pdf.ts) both use it.
 */
export const CAPTION_SIZE = 0.021;

export function prettyCaption(label: string): string {
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * Books made before 2026-11-11 start with a words-only title page, which stays
 * first (it can't be moved or deleted). New books don't have one.
 */
export const hasTitlePage = (pages: ReadonlyArray<{ layout: string }>): boolean => pages[0]?.layout === "title";

/** Index of the first page that can be moved, deleted or have pages added before it. */
export const firstMovablePage = (pages: ReadonlyArray<{ layout: string }>): number => (hasTitlePage(pages) ? 1 : 0);

/** The number printed on page `idx` (a title page is unnumbered; photo pages count from 1). */
export const pageNumber = (pages: ReadonlyArray<{ layout: string }>, idx: number): number => (hasTitlePage(pages) ? idx : idx + 1);

/** Short label for page `idx`: "Title" for an old book's title page, else "p.N". */
export const pageLabel = (pages: ReadonlyArray<{ layout: string }>, idx: number): string =>
  idx === 0 && hasTitlePage(pages) ? "Title" : "p." + pageNumber(pages, idx);

/**
 * Auto-design: the whole book, laid out by the engine (arrange.ts).
 *
 *  1. The book opens on a photo. There is no words-only title page: the
 *     title lives on the cover (owner, 2026-11-11). Books saved before then
 *     keep their title page at index 0; see hasTitlePage().
 *  2. `density` is the arrangement (Story, Classic or Family Album).
 *  3. `sheets` is the book size the customer chose; absent or null means the
 *     fewest sheets that hold every photo in this arrangement.
 *
 * Pure ((photos, density, sheets) → pages), so re-running it on a change is
 * safe. Every page is a "grid" page; the editors can still turn a page into
 * one of the named layouts.
 */
export function generatePages(photos: BuilderPhoto[], density: DensityId, sheets?: number | null): BookPage[] {
  return arrangeBook(photos, arrangementOf(density), sheets).pages;
}

/**
 * The photos that belong in the book: every photo except the ones the
 * customer took out in an editor (BuilderState.removedPhotoIds). Every
 * "lay the book out again" starts from this list, so a photo taken out stays
 * out and a photo added later goes in.
 */
export function bookPhotos(s: { photos: BuilderPhoto[]; removedPhotoIds?: string[] | null }): BuilderPhoto[] {
  const out = new Set(s.removedPhotoIds ?? []);
  return out.size ? s.photos.filter((p) => !out.has(p.id)) : s.photos;
}

/**
 * Our cover photo when the customer leaves it to us: of the first twelve
 * photos in the book, the one that loses least when cut to a square (the
 * cover is square), the earliest on a tie. Photos of unknown size wait their
 * turn behind measured ones.
 */
export function autoCoverPhotoId(photos: BuilderPhoto[]): string | null {
  let best: BuilderPhoto | null = null;
  let bestLoss = Infinity;
  for (const p of photos.slice(0, 12)) {
    const loss = p.w && p.h ? 1 - Math.min(p.w, p.h) / Math.max(p.w, p.h) : 0.99;
    if (loss < bestLoss - 1e-9) {
      best = p;
      bestLoss = loss;
    }
  }
  return best?.id ?? photos[0]?.id ?? null;
}

/** The photo on the front cover: the customer's choice while it still exists, else ours. */
export function coverPhotoIdFor(s: { photos: BuilderPhoto[]; removedPhotoIds?: string[] | null; coverPhotoId?: string | null }): string | null {
  if (s.coverPhotoId && s.photos.some((p) => p.id === s.coverPhotoId)) return s.coverPhotoId;
  return autoCoverPhotoId(bookPhotos(s));
}

/**
 * Pages → spreads (pairs). The first page sits LEFT of the first spread, so a
 * new book opens on a photo; an older book's title page sits there instead.
 */
export function toSpreads(pages: BookPage[]): Spread[] {
  const spreads: Spread[] = [];
  for (let i = 0; i < pages.length; i += 2) {
    spreads.push({ left: pages[i] ?? null, right: pages[i + 1] ?? null });
  }
  return spreads;
}
