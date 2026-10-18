/**
 * Builder ⇄ server sync — the book document's journey to Postgres.
 *
 * The reducer in state.ts is the source of truth for the *session*;
 * localStorage keeps it across reloads on this device. This hook adds
 * the third tier: `projects.document` on the server, so a book survives
 * a cleared browser, appears on another device, and can be ordered.
 *
 * Responsibilities
 *  1. RESUME — `/wizard?project=<id>` (from /books) loads the server
 *     document over whatever local draft exists.
 *  2. RECONCILE on mount — if the local draft points at a project we
 *     also have on the server, and the server copy is newer than our
 *     last successful save (edited elsewhere), adopt the server copy.
 *  3. AUTOSAVE — debounced PUT of the document whenever the book
 *     changes (not on UI-only changes like `pos` or `screen`), carrying
 *     the version we last saw. 409 → adopt the server's copy (last
 *     writer elsewhere wins, we tell the user). 401 → mint a guest
 *     session and retry. 404 → the session lost the project: redeem
 *     the claim token and retry.
 *
 * Per-project sync metadata (version, last save time) is kept in its
 * own localStorage key so this module owns it end-to-end and the
 * reducer state stays exactly what the screens expect.
 */

import { useEffect, useRef, useState } from "react";
import type { BuilderDocument } from "@shared/document";
import { apiRequest } from "@/lib/queryClient";
import { getClaim, forgetClaim } from "@/lib/claims";
import { THEME_COLOUR } from "./palette";
import { useToast } from "@/hooks/use-toast";
import type { BuilderState } from "./state";

/* ── sync metadata (localStorage) ─────────────────────────────── */

const META_KEY = "tk_sync_v1";
interface SyncMeta {
  version: number;
  /** ms epoch of our last successful save (or load) of this project */
  savedAt: number;
}
function readMeta(projectId: string): SyncMeta | null {
  try {
    const all = JSON.parse(localStorage.getItem(META_KEY) || "{}") as Record<string, SyncMeta>;
    return all[projectId] ?? null;
  } catch {
    return null;
  }
}
function writeMeta(projectId: string, meta: SyncMeta) {
  try {
    const all = JSON.parse(localStorage.getItem(META_KEY) || "{}") as Record<string, SyncMeta>;
    all[projectId] = meta;
    localStorage.setItem(META_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

/* ── state ⇄ document mapping ─────────────────────────────────── */

/** The book part of BuilderState (UI-only fields excluded). */
export function toDocument(s: BuilderState): BuilderDocument {
  return {
    v: 1,
    occasion: s.occasion,
    vibe: s.vibe,
    title: s.title,
    // inline data URLs are session-only fallbacks; never persist them
    photos: s.photos.map((p) => ({
      id: p.id,
      label: p.label,
      shade: p.shade,
      url: p.url && !p.url.startsWith("data:") ? p.url : undefined,
      w: p.w,
      h: p.h,
    })),
    pages: s.pages.map((pg) => ({
      id: pg.id,
      layout: pg.layout,
      slots: pg.slots.map((sl) => ({
        photoId: sl.photoId,
        fx: sl.fx,
        fy: sl.fy,
        zoom: sl.zoom,
        turn: sl.turn,
        // `|| undefined` rather than the raw value: level is the case for
        // all but a handful of placements in any book, and omitting it
        // keeps a 200-page document from carrying 600 copies of `"tilt":0`.
        tilt: sl.tilt || undefined,
      })),
      caption: pg.caption,
      // Named explicitly, like every other field: the document schema is
      // non-strict, so anything not listed here is stripped in silence
      // and the user's edit is gone after one server round-trip.
      mirror: pg.mirror,
      bg: pg.bg ?? undefined,
    })),
    themeId: s.themeId,
    pageColor: s.pageColor,
    fontId: s.fontId,
    edge: s.edge,
    subtitle: s.subtitle,
    captionsHidden: s.captionsHidden,
    density: s.density,
    coverStyle: s.coverStyle,
    voice: s.voice,
    qty: s.qty,
    binding: s.binding,
  };
}

export function fromDocument(d: BuilderDocument): Partial<BuilderState> {
  return {
    occasion: d.occasion,
    vibe: d.vibe,
    title: d.title,
    photos: d.photos.map((p) => ({ id: p.id, label: p.label, shade: p.shade, url: p.url, w: p.w, h: p.h })),
    pages: d.pages.map((pg) => ({
      id: pg.id,
      layout: pg.layout,
      slots: pg.slots.map((s) => ({ ...s })),
      caption: pg.caption,
      mirror: pg.mirror,
      bg: pg.bg ?? null,
    })),
    themeId: d.themeId,
    // A document written before page colours existed has no field here;
    // `?? THEME_COLOUR` keeps it on the theme's own page rather than
    // patching `undefined` over the state's default.
    pageColor: d.pageColor ?? THEME_COLOUR,
    // pre-v2 documents have none of these; defaults = the pre-v2 look
    fontId: d.fontId ?? "classic",
    edge: d.edge ?? "clean",
    subtitle: d.subtitle ?? null,
    captionsHidden: d.captionsHidden ?? false,
    density: d.density,
    coverStyle: d.coverStyle,
    voice: d.voice,
    qty: d.qty,
    binding: d.binding,
  };
}

/** Where to land when resuming a server document. */
function resumeScreen(d: BuilderDocument): BuilderState["screen"] {
  if (d.pages.length > 1) return "preview";
  if (d.photos.length > 0) return "upload";
  return "quiz";
}

/* ── the hook ─────────────────────────────────────────────────── */

export type SyncStatus = "idle" | "saving" | "saved" | "error";

interface ServerProject {
  id: string;
  document: BuilderDocument | null;
  documentVersion: number;
  updatedAt: string;
}

export function useBuilderSync(state: BuilderState, set: (patch: Partial<BuilderState>) => void) {
  const { toast } = useToast();
  const [status, setStatus] = useState<SyncStatus>("idle");
  const lastSent = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef(false);
  const loadedRef = useRef(false);
  // latest state for the debounced save closure
  const stateRef = useRef(state);
  stateRef.current = state;

  const adopt = (project: ServerProject) => {
    if (!project.document) return;
    const patch = fromDocument(project.document);
    set({ ...patch, projectId: project.id, screen: resumeScreen(project.document), pos: 0 });
    writeMeta(project.id, { version: project.documentVersion, savedAt: Date.now() });
    lastSent.current = JSON.stringify(project.document);
  };

  const fetchProject = async (id: string, retried = false): Promise<ServerProject | null> => {
    const res = await fetch(`/api/projects/${id}`, { credentials: "include" });
    if (res.status === 401 && !retried) {
      // no session at all (new browser, cleared cookies) → guest session,
      // then the 404 branch below can redeem the claim token
      const { ensureSession } = await import("@/features/auth/client");
      if (await ensureSession()) return fetchProject(id, true);
      return null;
    }
    if (res.status === 404) {
      // session may have lost it — try the claim token once
      const token = getClaim(id);
      if (token) {
        try {
          const claimed = await apiRequest("POST", `/api/projects/${id}/claim`, { claimToken: token });
          forgetClaim(id);
          return (await claimed.json()) as ServerProject;
        } catch {
          return null;
        }
      }
      return null;
    }
    if (!res.ok) return null;
    return (await res.json()) as ServerProject;
  };

  /* 1 + 2: resume / reconcile once on mount */
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    const params = new URLSearchParams(window.location.search);
    const wanted = params.get("project");
    (async () => {
      if (wanted) {
        const project = await fetchProject(wanted);
        if (project?.document) {
          adopt(project);
        } else if (project) {
          // project exists but nothing saved yet — just attach to it
          set({ projectId: project.id });
        } else {
          toast({ title: "That book isn't available", description: "It may have been deleted or belong to another account." });
        }
        params.delete("project");
        const qs = params.toString();
        window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
        return;
      }
      const localId = stateRef.current.projectId;
      if (!localId) return;
      const project = await fetchProject(localId);
      if (!project) return;
      const meta = readMeta(localId);
      const serverAt = new Date(project.updatedAt).getTime();
      // server newer than our last save by a margin → edited elsewhere
      if (project.document && (!meta || serverAt > meta.savedAt + 2000)) {
        if (meta) toast({ title: "Loaded your latest changes", description: "This book was edited on another device." });
        adopt(project);
      } else if (project.document) {
        lastSent.current = JSON.stringify(toDocument(stateRef.current));
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* 3: debounced autosave */
  const docJson = state.projectId ? JSON.stringify(toDocument(state)) : null;
  useEffect(() => {
    if (!docJson || !state.projectId) return;
    if (docJson === lastSent.current) return;
    // nothing worth saving until there's a title or a photo
    if (!state.title.trim() && state.photos.length === 0) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), 1500);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [docJson, state.projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (retried = false): Promise<void> => {
    const s = stateRef.current;
    const projectId = s.projectId;
    if (!projectId || inflight.current) return;
    const document = toDocument(s);
    const json = JSON.stringify(document);
    if (json === lastSent.current) return;
    inflight.current = true;
    setStatus("saving");
    const version = readMeta(projectId)?.version ?? 0;
    try {
      const res = await fetch(`/api/projects/${projectId}/document`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document, documentVersion: version }),
      });
      if (res.ok) {
        const data = (await res.json()) as { documentVersion: number };
        writeMeta(projectId, { version: data.documentVersion, savedAt: Date.now() });
        lastSent.current = json;
        setStatus("saved");
        return;
      }
      if (res.status === 409) {
        const data = (await res.json()) as { documentVersion: number; document: BuilderDocument | null; updatedAt: string };
        if (data.document) {
          adopt({ id: projectId, document: data.document, documentVersion: data.documentVersion, updatedAt: data.updatedAt });
          toast({ title: "Updated from another device", description: "We loaded the newer version of this book." });
        } else {
          writeMeta(projectId, { version: data.documentVersion, savedAt: 0 });
        }
        setStatus("saved");
        return;
      }
      if ((res.status === 401 || res.status === 404) && !retried) {
        // 401: no session (cookie gone) → guest session; 404: session
        // doesn't own it → claim. Then retry exactly once.
        const { ensureSession } = await import("@/features/auth/client");
        await ensureSession();
        if (res.status === 404 || getClaim(projectId)) {
          const token = getClaim(projectId);
          if (token) {
            await apiRequest("POST", `/api/projects/${projectId}/claim`, { claimToken: token }).then(() => forgetClaim(projectId)).catch(() => undefined);
          }
        }
        inflight.current = false;
        return save(true);
      }
      setStatus("error");
    } catch {
      setStatus("error"); // offline — the local draft still has everything
    } finally {
      inflight.current = false;
    }
  };

  // flush a pending save when the tab goes to the background
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden" && timer.current) {
        clearTimeout(timer.current);
        void save();
      }
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { status };
}
