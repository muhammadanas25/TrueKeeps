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
}

export const BOOK_THEMES: BookTheme[] = [
  { id: "ivory", name: "Timeless Ivory", page: "#FAF7EE", ink: "#3C3C3B", accent: "#1D46A0", soft: "#EFEAD9", stripeA: "#EFE9D6", stripeB: "#E5DEC6", scrim: "rgba(250,247,238,0.88)" },
  { id: "cobalt", name: "Bold Cobalt", page: "#1D46A0", ink: "#FFFFFF", accent: "#F5D547", soft: "#2a5cc0", stripeA: "#2A57B4", stripeB: "#3160BD", scrim: "rgba(20,52,120,0.82)" },
  { id: "blush", name: "Soft Blush", page: "#F9EEEF", ink: "#3C3C3B", accent: "#DB3069", soft: "#F2DEE0", stripeA: "#F4E2E4", stripeB: "#EBD3D6", scrim: "rgba(249,238,239,0.88)" },
  { id: "gallery", name: "Gallery White", page: "#FFFFFF", ink: "#3C3C3B", accent: "#3C3C3B", soft: "#F1F1EE", stripeA: "#F1F1EE", stripeB: "#E5E5E0", scrim: "rgba(255,255,255,0.88)" },
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
  price: number;
}
export const BINDINGS: Binding[] = [
  { id: "softcover", name: "Softcover", price: 24 },
  { id: "hardcover", name: "Hardcover", price: 34 },
  { id: "layflat", name: "Layflat", price: 46 },
];

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
    placeOrder: "Place my order",
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
    placeOrder: "Place order",
    confirmTitle: "Order placed",
    confirmSub: "We'll email you when it ships.",
  },
};

/* ── Photos ─────────────────────────────────────────────────── */

/**
 * A photo in the builder. `url` is a data URL held in memory for the
 * session; it is intentionally NOT persisted to localStorage (quota),
 * so after a reload the tile falls back to its labelled placeholder —
 * the book structure (pages/photoIds/captions) survives regardless.
 */
export interface BuilderPhoto {
  id: string;
  label: string;
  /** 0–2, subtly varies the placeholder tint */
  shade: number;
  url?: string;
}

/* ── Page generation ────────────────────────────────────────── */

export type PageLayoutId = "title" | "full" | "single" | "duo" | "collage";

export interface BookPage {
  id: string;
  layout: PageLayoutId;
  photoIds: string[];
  caption: string;
}

export interface Spread {
  left: BookPage | null;
  right: BookPage | null;
}

/** How many photo slots each layout holds. */
export const LAYOUT_SLOTS: Record<PageLayoutId, number> = { title: 0, full: 1, single: 1, duo: 2, collage: 3 };

export const LAYOUTS: Array<{ id: Exclude<PageLayoutId, "title">; name: string; slots: number }> = [
  { id: "full", name: "Full page", slots: 1 },
  { id: "single", name: "Framed", slots: 1 },
  { id: "duo", name: "Two photos", slots: 2 },
  { id: "collage", name: "Collage", slots: 3 },
];

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
  const pages: BookPage[] = [{ id: "pg-title", layout: "title", photoIds: [], caption: "" }];
  let pi = 0;
  let step = 0;
  let n = 0;
  while (pi < photos.length) {
    const layout = pattern[step % pattern.length];
    const slots = Math.min(LAYOUT_SLOTS[layout], photos.length - pi);
    const ids = photos.slice(pi, pi + slots).map((p) => p.id);
    const caption = layout === "single" ? prettyCaption(photos[pi].label) : "";
    pages.push({
      id: "pg" + n,
      layout: slots < LAYOUT_SLOTS[layout] ? (slots === 1 ? "single" : "duo") : layout,
      photoIds: ids,
      caption,
    });
    pi += slots;
    step++;
    n++;
  }
  if (pages.length % 2 === 1 && pages.length > 1) {
    pages.push({ id: "pg-end", layout: "single", photoIds: [pages[1].photoIds[0]], caption: "until next time" });
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
