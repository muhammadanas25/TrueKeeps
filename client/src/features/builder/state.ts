/**
 * Book builder — state machine + persistence.
 *
 * Ported from the updated prototype shell (`~/Downloads/app.jsx`) and
 * typed. One state object drives the whole flow:
 *
 *   quiz → upload → compose → book → preview ↔ (customize | order) → confirm
 *
 * which are the owner's seven steps (flow v2, 2026-11-15): 1 occasion
 * (quiz), 2 photos (upload), 3 the feel and 4 name and lettering (compose,
 * qstep 0 and 1), 5 pick your book (book), 6 check and approve (preview),
 * 7 pay (order). "generating" and "reveal" were retired on 2026-11-17; a
 * draft saved on either resumes at "book".
 *
 * State ownership (per project conventions): this is pure client flow
 * state — server data stays in TanStack Query; ephemeral UI stays in
 * component-local state. The reducer accepts a typed `patch` action
 * (the screens are cooperative and always patch valid shapes) plus a
 * `reset`; screen transitions are ordinary patches of `screen`.
 *
 * Persistence: debounced snapshot to localStorage. Photos are stored by
 * server URL; their in-browser copies live in upload/previews.ts, because
 * those die with the tab. A photo that hadn't reached the server when the
 * tab closed comes back as a labelled placeholder until it's added again.
 */

import type { PatternId } from "@shared/patterns";
import { useEffect, useReducer, useRef } from "react";
import { DEFAULT_FINISH, type FinishId } from "@shared/pricing";
import { normalizeMediaUrl } from "@shared/media";
import type { EdgeId, FontId } from "./looks";
import { LAYOUT_SLOTS, placement, type BookPage, type BuilderPhoto, type CoverStyleId, type DensityId, type PageFrame, type PageLayoutId } from "./data";

export type BuilderScreen =
  | "quiz"
  | "upload"
  | "compose"
  | "book"
  | "preview"
  | "customize"
  | "order"
  | "confirm";

export interface BuilderState {
  screen: BuilderScreen;
  /** compose sub-step, while photos upload: 0 the feel (step 3), 1 name and lettering (step 4) */
  qstep: 0 | 1;
  occasion: string | null;
  vibe: string | null;
  title: string;
  /** server project backing this draft — created lazily on first upload */
  projectId: string | null;
  photos: BuilderPhoto[];
  pages: BookPage[];
  themeId: string;
  /**
   * Page-colour override, whole book — a `PAGE_COLOURS` id from
   * `palette.ts`, or `THEME_COLOUR` ("theme") to leave the theme's own
   * page colour alone. Deliberately not folded into `themeId`: the
   * theme owns the typography and the accent, the colour owns the
   * paper, and multiplying them out would mean 44 themes to maintain.
   */
  pageColor: string;
  /** the arrangement: minimal = Story, balanced = Classic, collage = Family Album (arrange.ts) */
  density: DensityId;
  /**
   * Sheets the customer chose on "Pick your book"; null = the fewest that
   * hold every photo in the arrangement. Not saved to the server: the pages
   * themselves are the book, and the price counts them.
   */
  sheets: number | null;
  /**
   * True once pages were changed by anything other than "Pick your book"
   * (an editor, a resumed book). That step then keeps the pages as they are
   * until the customer changes a choice there, instead of laying them out
   * again and losing the hand edits. Set by the reducer, not by callers.
   */
  pagesEdited: boolean;
  /**
   * The front cover's photo: a photo id the customer chose, or null for
   * "let us pick" (coverPhotoIdFor in data.ts). Picking it never reorders the
   * photos, because photo order is the book's reading order.
   */
  coverPhotoId: string | null;
  /**
   * Photos the customer took out of the book in an editor. Laying the book
   * out again (step 5, an arrangement in the editor) leaves them out until
   * they are put back. Maintained by the reducer from page edits.
   */
  removedPhotoIds: string[];
  coverStyle: CoverStyleId;
  /** the pattern on a "pattern" cover (shared/patterns.ts) */
  coverPattern: PatternId;
  /**
   * How the book was made, for the owner's "customised vs ready-made" count
   * (2026-11-22): "none" = ordered as we laid it out, "looked" = opened the
   * editor but changed nothing, "changed" = made at least one edit there.
   * Saved on the book, so it travels with the order.
   */
  customized: "none" | "looked" | "changed";
  voice: "warm" | "concise";
  /** preview position: 0 = closed cover, k = spread k−1 open */
  pos: number;
  qty: number;
  binding: string;
  /** paper finish, chosen on the order screen */
  finish: FinishId;
  /* ── editor v2 style (looks.ts) ── */
  /** typeface for titles/captions; defaults reproduce the pre-v2 look */
  fontId: FontId;
  /** photo edge treatment on non-bleed slots */
  edge: EdgeId;
  /** line under the title on the title page; null = occasion default */
  subtitle: string | null;
  captionsHidden: boolean;
  /** last page colours picked in the editor's colour grid (device-local) */
  recentColors: string[];
}

export const DEFAULT_STATE: BuilderState = {
  screen: "quiz",
  qstep: 0,
  occasion: null,
  vibe: null,
  title: "",
  projectId: null,
  photos: [],
  pages: [],
  // new books start white (owner, 2026-11-22); saved books keep their colour
  themeId: "gallery",
  pageColor: "theme",
  density: "balanced",
  sheets: null,
  pagesEdited: false,
  coverPhotoId: null,
  removedPhotoIds: [],
  coverStyle: "full",
  coverPattern: "floral",
  customized: "none",
  voice: "warm",
  pos: 0,
  qty: 1,
  binding: "hardcover",
  finish: DEFAULT_FINISH,
  fontId: "classic",
  edge: "clean",
  subtitle: null,
  captionsHidden: false,
  recentColors: [],
};

/** Where "back" goes from each screen (quiz handles its own sub-steps). */
export const BACK_MAP: Partial<Record<BuilderScreen, BuilderScreen>> = {
  upload: "quiz",
  compose: "upload",
  book: "compose",
  preview: "book",
  customize: "preview",
  order: "preview",
};

/** Header context label per screen. */
export const SCREEN_CONTEXT: Record<BuilderScreen, string> = {
  quiz: "Step 1 of 7",
  upload: "Step 2 of 7",
  compose: "Steps 3 and 4 of 7",
  book: "Step 5 of 7",
  preview: "Step 6 of 7",
  customize: "Making changes",
  order: "Step 7 of 7",
  confirm: "",
};

type BuilderAction =
  | { type: "patch"; patch: Partial<BuilderState> }
  /** Functional, because uploads finish while the customer edits: a stale list would undo their edit. */
  | { type: "photos"; update: (photos: BuilderPhoto[]) => BuilderPhoto[] }
  | { type: "reset" };

/**
 * The taken-out list after a hand edit: photos that were in the book and no
 * longer are join it; photos that are in the book now leave it. A photo moved
 * from one page to another is in both lists of pages, so it is never counted.
 */
export function trackRemovals(before: BookPage[], after: BookPage[], removed: string[]): string[] {
  const was = new Set(before.flatMap((p) => p.slots.map((s) => s.photoId)));
  const now = new Set(after.flatMap((p) => p.slots.map((s) => s.photoId)));
  const out = removed.filter((id) => !now.has(id));
  was.forEach((id) => {
    if (!now.has(id) && !out.includes(id)) out.push(id);
  });
  return out;
}

function reducer(state: BuilderState, action: BuilderAction): BuilderState {
  switch (action.type) {
    case "patch":
      // New pages from anywhere but the layout step count as a hand edit, and
      // a hand edit is where photos leave or rejoin the book.
      if (action.patch.pages && action.patch.pages !== state.pages && !("pagesEdited" in action.patch)) {
        const removed = "removedPhotoIds" in action.patch ? action.patch.removedPhotoIds! : trackRemovals(state.pages, action.patch.pages, state.removedPhotoIds);
        return { ...state, ...action.patch, pagesEdited: true, removedPhotoIds: removed };
      }
      return { ...state, ...action.patch };
    case "photos":
      return { ...state, photos: action.update(state.photos) };
    case "reset":
      return { ...DEFAULT_STATE };
  }
}

const STORAGE_KEY = "tk_builder_v2";
/** Pre-Placement drafts: pages carried `photoIds: string[]`. */
const STORAGE_KEY_V1 = "tk_builder_v1";

/** The v1 page shape, kept only so the migration can be type-checked. */
type LegacyPage = Omit<BookPage, "slots" | "frames"> & { slots?: unknown; photoIds?: unknown; frames?: unknown };

/**
 * v1 → v2: `page.photoIds: string[]` becomes `page.slots: Placement[]`.
 *
 * This runs against a live deployment, so there are real half-finished
 * books sitting in real browsers. Dropping them and starting the user
 * over would be the easy implementation and the wrong one — a v1 draft
 * migrates cleanly, because every v1 photo was implicitly centred and
 * unzoomed, which is exactly DEFAULT_FRAMING.
 *
 * Written defensively (it parses untrusted localStorage that may have
 * been hand-edited, truncated, or written by an older build): anything
 * unrecognisable degrades to an empty slot list rather than throwing,
 * because a page that renders blank is recoverable and a builder that
 * crashes on boot is not.
 */
/**
 * A layout id we can actually render.
 *
 * The set of layouts grows (Phase C added `duo-side` and `trio-strip`,
 * per-occasion templates will add more), and localStorage is the one
 * place a FUTURE id can arrive from — a user with two tabs open on two
 * builds, or one who rolls back. An unknown id used to be trusted
 * verbatim and would fall through every branch in PageFace to the
 * `single` renderer while `slotAspect` looked up an undefined slot, so
 * the failure was silent and slightly wrong rather than loud.
 *
 * Rewriting it to a real layout with the same slot count is the least
 * destructive repair available: the photos and their framing all
 * survive, only the arrangement is approximated.
 */
const KNOWN_LAYOUTS = Object.keys(LAYOUT_SLOTS) as PageLayoutId[];

function safeLayout(raw: unknown, slotCount: number): PageLayoutId {
  if (typeof raw === "string" && (KNOWN_LAYOUTS as string[]).includes(raw)) return raw as PageLayoutId;
  if (slotCount >= 3) return "collage";
  if (slotCount === 2) return "duo";
  return "single";
}

/** A grid page's rectangles, if every one is a sane fraction of the page and there is one per slot. */
function validFrames(raw: unknown, count: number): PageFrame[] | null {
  if (!Array.isArray(raw) || raw.length !== count || count === 0) return null;
  const ok = (v: unknown, min: number) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= 1;
  const frames = raw.flatMap((f): PageFrame[] => {
    if (!f || typeof f !== "object") return [];
    const { x, y, w, h } = f as Record<string, unknown>;
    return ok(x, 0) && ok(y, 0) && ok(w, 0.001) && ok(h, 0.001) ? [{ x: x as number, y: y as number, w: w as number, h: h as number }] : [];
  });
  return frames.length === count ? frames : null;
}

/** Exported for tests: this is the one function that parses bytes the
 *  user's browser could have written under any past or future build. */
export function migratePages(input: unknown): BookPage[] {
  if (!Array.isArray(input)) return [];
  return input.flatMap((raw): BookPage[] => {
    if (!raw || typeof raw !== "object") return [];
    const page = raw as LegacyPage;

    let slots: BookPage["slots"];
    if (Array.isArray(page.slots)) {
      // Already v2 — still normalise, in case of a partial write.
      slots = page.slots.flatMap((s) => {
        if (typeof s === "string") return [placement(s)]; // tolerate a mixed array
        if (!s || typeof s !== "object") return [];
        const p = s as Partial<BookPage["slots"][number]>;
        return typeof p.photoId === "string" ? [placement(p.photoId, p)] : [];
      });
    } else if (Array.isArray(page.photoIds)) {
      slots = page.photoIds.filter((id): id is string => typeof id === "string").map((id) => placement(id));
    } else {
      slots = [];
    }

    // A grid page draws its slots from its own rectangles, one per slot. One
    // that lost them (a truncated write) is re-labelled by its photo count,
    // so it still renders, rather than drawing every photo full-bleed.
    const frames = page.layout === "grid" ? validFrames(page.frames, slots.length) : null;
    const layout = page.layout === "grid" && !frames ? safeLayout(null, slots.length) : safeLayout(page.layout, slots.length);

    return [
      {
        id: typeof page.id === "string" ? page.id : "pg" + Math.random().toString(36).slice(2, 8),
        layout,
        ...(frames ? { frames } : null),
        slots,
        caption: typeof page.caption === "string" ? page.caption : "",
        // spread rather than assigned so the common case stays absent
        // from the JSON instead of shipping `"mirror":false` per page
        ...(page.mirror === true ? { mirror: true } : null),
      },
    ];
  });
}

/** Restore a persisted draft; sanitizes transient screens (a reload
 *  a draft saved on a retired screen resumes at "book" or "upload"). */
function loadState(): BuilderState | null {
  try {
    // Prefer v2; fall back to a v1 draft and upgrade it in place.
    const fromV2 = localStorage.getItem(STORAGE_KEY);
    const raw = fromV2 ?? localStorage.getItem(STORAGE_KEY_V1);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<BuilderState>;
    if (!s || typeof s !== "object") return null;

    const pages = migratePages(s.pages);
    // Screens retired on 2026-11-17 resume at "Pick your book".
    const screen = s.screen as string;
    if (screen === "generating" || screen === "reveal") s.screen = pages.length ? "book" : "upload";
    if (!s.screen || !(s.screen in SCREEN_CONTEXT)) s.screen = pages.length ? "preview" : "quiz";
    if ((s.qstep as number) > 1) s.qstep = 1;
    // The occasion was once followed by vibe and title on the same screen; a
    // draft saved there continues at the photos, which come first now.
    if (s.screen === "quiz" && s.occasion) s.screen = "upload";
    if (s.screen === "upload" || s.screen === "compose") s.qstep = s.screen === "upload" ? 0 : (s.qstep ?? 0);
    // Older books point at a public bucket that's going private.
    if (Array.isArray(s.photos)) s.photos = s.photos.map((p) => ({ ...p, url: normalizeMediaUrl(p.url) }));

    if (!fromV2) {
      // One-way upgrade: the next persist writes v2, so retire the old
      // key now rather than leaving a stale draft to be picked up by an
      // older tab still running the previous build.
      try {
        localStorage.removeItem(STORAGE_KEY_V1);
      } catch {
        /* ignore */
      }
    }
    // A draft from before the cover choice keeps the cover it had: its first photo.
    if (s.coverPhotoId === undefined) s.coverPhotoId = pages.length ? (s.photos?.[0]?.id ?? null) : null;
    if (!Array.isArray(s.removedPhotoIds)) s.removedPhotoIds = [];
    return { ...DEFAULT_STATE, ...s, pages };
  } catch {
    return null;
  }
}

/** Snapshot for localStorage: server URLs are tiny and survive reloads,
 *  but inline data URLs (offline fallback) would blow the ~5MB quota —
 *  those are stripped, and their tiles fall back to placeholders. */
function persistable(state: BuilderState): unknown {
  return {
    ...state,
    photos: state.photos.map((p) => (p.url && p.url.startsWith("data:") ? { ...p, url: undefined } : p)),
  };
}

/**
 * useBuilderState — reducer + auto-persist.
 * `initial` lets callers seed from URL params (e.g. ?occasion=wedding
 * from the landing page's occasion cards) when no draft exists.
 */
export function useBuilderState(initial?: Partial<BuilderState>) {
  const [state, dispatch] = useReducer(
    reducer,
    undefined,
    () => loadState() ?? { ...DEFAULT_STATE, ...initial },
  );

  // persist (debounced) — cheap JSON, photos stripped of data URLs.
  //
  // The debounce must never DROP a write: the last edit before the user
  // leaves (in-app link to /books, closing the tab) happens inside the
  // 350 ms window by definition. So a pending write is flushed, not
  // cancelled, on unmount and on `pagehide`.
  const latest = useRef(state);
  latest.current = state;
  const pending = useRef(false);
  const write = () => {
    pending.current = false;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persistable(latest.current)));
    } catch {
      /* quota exceeded or private mode — draft just won't survive reload */
    }
  };
  useEffect(() => {
    pending.current = true;
    const t = setTimeout(write, 350);
    return () => clearTimeout(t);
  }, [state]);
  useEffect(() => {
    const flush = () => pending.current && write();
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush(); // unmount (route change) with a write still pending
    };
  }, []);

  const set = (patch: Partial<BuilderState>) => dispatch({ type: "patch", patch });
  const updatePhotos = (update: (photos: BuilderPhoto[]) => BuilderPhoto[]) => dispatch({ type: "photos", update });
  const reset = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_KEY_V1);
    } catch {
      /* ignore */
    }
    dispatch({ type: "reset" });
  };

  return { state, set, updatePhotos, reset };
}
