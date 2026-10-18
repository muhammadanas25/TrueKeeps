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
  { id: "cobalt", name: "Bold Cobalt", page: "#1D46A0", ink: "#FFFFFF", accent: "#F5D547", soft: "#2a5cc0", stripeA: "#2A57B4", stripeB: "#3160BD", scrim: "rgba(20,52,120,0.82)", dark: true },
  { id: "blush", name: "Soft Blush", page: "#F9EEEF", ink: "#3C3C3B", accent: "#DB3069", soft: "#F2DEE0", stripeA: "#F4E2E4", stripeB: "#EBD3D6", scrim: "rgba(249,238,239,0.88)", dark: false },
  { id: "gallery", name: "Gallery White", page: "#FFFFFF", ink: "#3C3C3B", accent: "#3C3C3B", soft: "#F1F1EE", stripeA: "#F1F1EE", stripeB: "#E5E5E0", scrim: "rgba(255,255,255,0.88)", dark: false },
];

export const themeById = (id: string | null | undefined): BookTheme =>
  BOOK_THEMES.find((t) => t.id === id) ?? BOOK_THEMES[0];

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
    id: "wedding", label: "Our wedding", icon: "Heart", suggestedTitle: "The Day We Said Yes", subtitle: "June, twenty twenty-six",
    photoLabels: ["getting ready", "the first look", "walking down", "the vows", "ring exchange", "the first kiss", "family portrait", "golden hour", "the speeches", "first dance", "cake cutting", "on the dance floor", "quiet moment", "the send-off", "the details", "her bouquet"],
  },
  {
    id: "baby", label: "A new baby", icon: "Baby", suggestedTitle: "Hello, Little One", subtitle: "The first year",
    photoLabels: ["coming home", "tiny toes", "first yawn", "nap time", "little hands", "bath time", "first smile", "with grandma", "the nursery", "sunday morning", "first steps", "messy lunch", "story time", "fast asleep", "first birthday", "family of three"],
  },
  {
    id: "travel", label: "A trip we took", icon: "Plane", suggestedTitle: "The Long Way Home", subtitle: "An adventure in pictures",
    photoLabels: ["the departure", "street market", "morning coffee", "mountain pass", "local faces", "the old town", "sunset point", "roadside stop", "hidden beach", "night lights", "the long road", "last evening", "window seat", "city rooftops", "the harbour", "souvenirs"],
  },
  {
    id: "birthday", label: "Birthday or grad", icon: "Cake", suggestedTitle: "What a Day It Was", subtitle: "A celebration to keep",
    photoLabels: ["the setup", "guests arriving", "party hats", "make a wish", "the candles", "best friends", "the big laugh", "gift opening", "group photo", "the cake", "confetti", "dancing", "quiet smiles", "the toast", "one more slice", "goodnight"],
  },
  {
    id: "mix", label: "A bit of everything", icon: "Sparkles", suggestedTitle: "The Good Days", subtitle: "Moments worth keeping",
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
  { id: "cobalt", name: "Bold", blurb: "Deep cobalt, confident" },
  { id: "blush", name: "Soft", blurb: "Gentle blush, romantic" },
  { id: "gallery", name: "Minimal", blurb: "Pure white, gallery-calm" },
];

/* ── Cover styles / densities / bindings ────────────────────── */

export type CoverStyleId = "full" | "framed" | "minimal" | "split";
export const COVER_STYLES: Array<{ id: CoverStyleId; name: string }> = [
  { id: "full", name: "Full photo" },
  { id: "framed", name: "Framed" },
  { id: "minimal", name: "Title only" },
  { id: "split", name: "Split" },
];

export type DensityId = "minimal" | "balanced" | "collage";
export const DENSITIES: Array<{ id: DensityId; name: string; blurb: string }> = [
  { id: "minimal", name: "Airy", blurb: "One photo per page" },
  { id: "balanced", name: "Balanced", blurb: "A gentle mix" },
  { id: "collage", name: "Playful", blurb: "More photos, collaged" },
];

export interface Binding {
  id: string;
  name: string;
  /** price per copy in PAISA — from the shared PKR price list */
  priceMinor: number;
}
/** Bindings + prices come from shared/pricing.ts so the server's quote
 *  and what the customer sees can never drift. */
export const BINDINGS: Binding[] = PRICE_LIST.bindings.map((b) => ({ id: b.id, name: b.name, priceMinor: b.unitMinor }));

/* ── Copy voices ────────────────────────────────────────────── */
/* Every user-facing headline/CTA lives here so tone is switchable
   (and later A/B-testable) without touching components. */

export interface CopyVoice {
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
    quizHello: "Let's make your book",
    quizSub: "Three small questions, then we do the rest.",
    qOccasion: "What are we celebrating?",
    qVibe: "Pick a feel for your book",
    qTitle: "What should we call it?",
    titleHint: "You can change this anytime — even on the cover.",
    uploadTitle: "Now, your photos",
    uploadSub: "Don't worry about the order or the layout — that's our job.",
    uploadCta: "Add photos",
    uploadMore: "Add more",
    generating: ["Looking through your photos…", "Choosing the best moments…", "Laying out your pages…", "Adding the finishing touches…"],
    revealTitle: "Here is your book — three ways",
    revealSub: "Same photos, three feels. Pick the one that feels like you.",
    ourPick: "Our pick for you",
    openBook: "Open this book",
    previewHint: "Click the right-hand page to turn — just like a real book.",
    orderCta: "I love it — order my book",
    customizeCta: "Make it mine",
    customizeTitle: "Make it yours",
    customizeSub: "Tap any page to change it. Nothing can go wrong.",
    orderTitle: "Almost there",
    orderSub: "Check the details — then we print, bind, and ship it.",
    placeOrder: "Continue to secure payment",
    confirmTitle: "It's on its way to print",
    confirmSub: "We'll email you the moment it ships. Your book is saved here — come back anytime.",
  },
  concise: {
    quizHello: "Create your book",
    quizSub: "Three quick questions.",
    qOccasion: "What's the occasion?",
    qVibe: "Choose a style",
    qTitle: "Name your book",
    titleHint: "You can edit this later.",
    uploadTitle: "Upload photos",
    uploadSub: "We arrange everything automatically.",
    uploadCta: "Add photos",
    uploadMore: "Add more",
    generating: ["Analyzing photos…", "Selecting highlights…", "Building layouts…", "Finalizing…"],
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
export type PageLayoutId = "title" | "full" | "single" | "duo" | "duo-side" | "collage" | "trio-strip";

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
};

/**
 * The picker's contents, in picker order.
 *
 * Names are short and concrete because they sit under a picture of the
 * layout: the thumbnail says what the shape is, the word only has to
 * disambiguate it from its neighbour. "Two photos" became "Stacked" for
 * exactly that reason — the count is already a group header, so spending
 * the label on it was wasted.
 */
export const LAYOUTS: Array<{ id: Exclude<PageLayoutId, "title">; name: string; slots: number }> = [
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
const LAYOUT_LADDER: Record<Exclude<PageLayoutId, "title">, Array<Exclude<PageLayoutId, "title">>> = {
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
  const ladder = LAYOUT_LADDER[from as Exclude<PageLayoutId, "title">] ?? LAYOUT_LADDER.single;
  // Above three there is nothing to grow into; the caller is expected to
  // have refused the drop before getting here, but clamping beats
  // returning undefined and rendering an empty page.
  return ladder[Math.min(count, 3) - 1];
}

/** The most photos any one page can hold, i.e. the top of the ladder. */
export const MAX_SLOTS_PER_PAGE = 3;

/** Repeating layout rhythm per density — tuned in the design prototype. */
const DENSITY_PATTERNS: Record<DensityId, PageLayoutId[]> = {
  minimal: ["full", "single", "single", "full"],
  balanced: ["full", "single", "duo", "single", "full", "duo"],
  collage: ["collage", "full", "duo", "collage", "single", "duo"],
};

export function prettyCaption(label: string): string {
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * Deterministic auto-design.
 *
 * Walk the density's layout pattern, dealing photos into slots:
 *  1. Page 0 is always the title page (no photos).
 *  2. Each step takes the next pattern layout; if fewer photos remain
 *     than the layout wants, it degrades (duo→single etc.).
 *  3. "single" (framed) pages get the photo's label as a caption —
 *     the quiet pages are where captions read best.
 *  4. Books must have an even page count to bind; an odd book gets a
 *     closing page reprising the first photo ("until next time").
 */
export function generatePages(photos: BuilderPhoto[], density: DensityId): BookPage[] {
  const pattern = DENSITY_PATTERNS[density] ?? DENSITY_PATTERNS.balanced;
  const pages: BookPage[] = [{ id: "pg-title", layout: "title", slots: [], caption: "" }];
  let pi = 0;
  let step = 0;
  let n = 0;
  while (pi < photos.length) {
    const layout = pattern[step % pattern.length];
    const slots = Math.min(LAYOUT_SLOTS[layout], photos.length - pi);
    const placed = photos.slice(pi, pi + slots).map((p) => placement(p.id));
    const caption = layout === "single" ? prettyCaption(photos[pi].label) : "";
    pages.push({
      id: "pg" + n,
      layout: slots < LAYOUT_SLOTS[layout] ? (slots === 1 ? "single" : "duo") : layout,
      slots: placed,
      caption,
    });
    pi += slots;
    step++;
    n++;
  }
  if (pages.length % 2 === 1 && pages.length > 1) {
    // reprise the opening photo, but as its OWN placement — sharing the
    // object would make reframing the first page silently reframe the last
    pages.push({
      id: "pg-end",
      layout: "single",
      slots: pages[1].slots[0] ? [{ ...pages[1].slots[0] }] : [],
      caption: "until next time",
    });
  }
  return pages;
}

/** Pages → spreads (pairs). The title page sits LEFT of the first spread. */
export function toSpreads(pages: BookPage[]): Spread[] {
  const spreads: Spread[] = [];
  for (let i = 0; i < pages.length; i += 2) {
    spreads.push({ left: pages[i] ?? null, right: pages[i + 1] ?? null });
  }
  return spreads;
}
