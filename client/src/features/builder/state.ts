/**
 * Book builder — state machine + persistence.
 *
 * Ported from the updated prototype shell (`~/Downloads/app.jsx`) and
 * typed. One state object drives the whole flow:
 *
 *   quiz → upload → generating → reveal → preview ↔ (customize | order) → confirm
 *
 * State ownership (per project conventions): this is pure client flow
 * state — server data stays in TanStack Query; ephemeral UI stays in
 * component-local state. The reducer accepts a typed `patch` action
 * (the screens are cooperative and always patch valid shapes) plus a
 * `reset`; screen transitions are ordinary patches of `screen`.
 *
 * Persistence: debounced snapshot to localStorage, minus photo data
 * URLs (they blow the ~5MB quota — same trade-off as the classic
 * wizard). After a reload the book structure survives; photo tiles
 * fall back to labelled placeholders until re-upload (Phase 1 of the
 * roadmap moves originals to object storage and removes this caveat).
 */

import { useEffect, useReducer, useRef } from "react";
import type { EdgeId, FontId } from "./looks";
import { LAYOUT_SLOTS, placement, type BookPage, type BuilderPhoto, type CoverStyleId, type DensityId, type PageLayoutId } from "./data";

export type BuilderScreen =
  | "quiz"
  | "upload"
  | "generating"
  | "reveal"
  | "preview"
  | "customize"
  | "order"
  | "confirm";

export interface BuilderState {
  screen: BuilderScreen;
  /** quiz sub-step: 0 occasion, 1 vibe, 2 title */
  qstep: 0 | 1 | 2;
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
  density: DensityId;
  coverStyle: CoverStyleId;
  voice: "warm" | "concise";
  /** preview position: 0 = closed cover, k = spread k−1 open */
  pos: number;
  qty: number;
  binding: string;
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
  themeId: "ivory",
  pageColor: "theme",
  density: "balanced",
  coverStyle: "full",
  voice: "warm",
  pos: 0,
  qty: 1,
  binding: "hardcover",
  fontId: "classic",
  edge: "clean",
  subtitle: null,
  captionsHidden: false,
  recentColors: [],
};

/** Where "back" goes from each screen (quiz handles its own sub-steps). */
export const BACK_MAP: Partial<Record<BuilderScreen, BuilderScreen>> = {
  upload: "quiz",
  reveal: "upload",
  preview: "reveal",
  customize: "preview",
  order: "preview",
};

/** Header context label per screen. */
export const SCREEN_CONTEXT: Record<BuilderScreen, string> = {
  quiz: "Step 1 of 3 — about your book",
  upload: "Step 2 of 3 — your photos",
  generating: "Designing…",
  reveal: "Step 3 of 3 — pick a feel",
  preview: "Your book",
  customize: "Customizing",
  order: "Order",
  confirm: "",
};

type BuilderAction = { type: "patch"; patch: Partial<BuilderState> } | { type: "reset" };

function reducer(state: BuilderState, action: BuilderAction): BuilderState {
  switch (action.type) {
    case "patch":
      return { ...state, ...action.patch };
    case "reset":
      return { ...DEFAULT_STATE };
  }
}

const STORAGE_KEY = "tk_builder_v2";
/** Pre-Placement drafts: pages carried `photoIds: string[]`. */
const STORAGE_KEY_V1 = "tk_builder_v1";

/** The v1 page shape, kept only so the migration can be type-checked. */
type LegacyPage = Omit<BookPage, "slots"> & { slots?: unknown; photoIds?: unknown };

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

    return [
      {
        id: typeof page.id === "string" ? page.id : "pg" + Math.random().toString(36).slice(2, 8),
        layout: safeLayout(page.layout, slots.length),
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
 *  mid-"generating" resumes at reveal/upload, never a stuck spinner). */
function loadState(): BuilderState | null {
  try {
    // Prefer v2; fall back to a v1 draft and upgrade it in place.
    const fromV2 = localStorage.getItem(STORAGE_KEY);
    const raw = fromV2 ?? localStorage.getItem(STORAGE_KEY_V1);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<BuilderState>;
    if (!s || typeof s !== "object") return null;

    const pages = migratePages(s.pages);
    if (s.screen === "generating") s.screen = pages.length ? "reveal" : "upload";

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
  const reset = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_KEY_V1);
    } catch {
      /* ignore */
    }
    dispatch({ type: "reset" });
  };

  return { state, set, reset };
}
