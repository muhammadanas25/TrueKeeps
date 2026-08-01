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

import { useEffect, useReducer } from "react";
import type { BookPage, BuilderPhoto, CoverStyleId, DensityId } from "./data";

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
  density: DensityId;
  coverStyle: CoverStyleId;
  voice: "warm" | "concise";
  /** preview position: 0 = closed cover, k = spread k−1 open */
  pos: number;
  qty: number;
  binding: string;
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
  density: "balanced",
  coverStyle: "full",
  voice: "warm",
  pos: 0,
  qty: 1,
  binding: "hardcover",
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

const STORAGE_KEY = "tk_builder_v1";

/** Restore a persisted draft; sanitizes transient screens (a reload
 *  mid-"generating" resumes at reveal/upload, never a stuck spinner). */
function loadState(): BuilderState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<BuilderState>;
    if (!s || typeof s !== "object") return null;
    if (s.screen === "generating") s.screen = s.pages && s.pages.length ? "reveal" : "upload";
    return { ...DEFAULT_STATE, ...s };
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

  // persist (debounced) — cheap JSON, photos stripped of data URLs
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(persistable(state)));
      } catch {
        /* quota exceeded or private mode — draft just won't survive reload */
      }
    }, 350);
    return () => clearTimeout(t);
  }, [state]);

  const set = (patch: Partial<BuilderState>) => dispatch({ type: "patch", patch });
  const reset = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    dispatch({ type: "reset" });
  };

  return { state, set, reset };
}
