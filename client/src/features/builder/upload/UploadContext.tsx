/**
 * Connects the upload engine to the builder.
 *
 * The engine lives outside React; this is the bridge. The provider sits at the
 * shell so any screen can add photos and read progress, and it owns the three
 * things that keep a long upload alive on a phone:
 *   - a screen wake lock, because a sleeping phone suspends the page
 *   - a warning before leaving with originals still to send
 *   - creating the backing project once, however many uploads ask at the same time
 *
 * Progress counts come from the builder's photos where possible, so what the
 * screen says survives a reload and can't drift from the book itself.
 */

import { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";
import { apiRequest } from "@/lib/queryClient";
import { occasionById, type BuilderPhoto } from "../data";
import type { BuilderState } from "../state";
import { uploadEngine, type UploadSnapshot } from "./engine";

export interface UploadProgress {
  /** photos in the book */
  total: number;
  /** photos whose display copy has reached the server */
  inBook: number;
  /** photos whose HD original has reached the server */
  hdDone: number;
  /** photos needing an HD original this tab no longer has the file for */
  needRepick: number;
  /** still something this tab is sending */
  active: boolean;
  /** from 0 to 1 across both stages, for the tips */
  fraction: number;
}

export interface UploadApi {
  addFiles: (files: FileList | File[] | null) => Promise<void>;
  snapshot: UploadSnapshot;
  progress: UploadProgress;
}

const Ctx = createContext<UploadApi | null>(null);

/** Access the upload engine from inside the builder. */
export function useUploads(): UploadApi {
  const api = useContext(Ctx);
  if (!api) throw new Error("useUploads must be used inside UploadProvider");
  return api;
}

/** "IMG_2041.jpeg" → "img 2041"; falls back to occasion labels for captions. */
function cleanLabel(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .trim()
    .toLowerCase()
    .slice(0, 28);
}

const isImageFile = (f: File) => f.type.startsWith("image/") || /\.hei[cf]$/i.test(f.name);

/** Keep the screen on while there's work to do. Quietly does nothing where unsupported. */
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        const next = await navigator.wakeLock.request("screen");
        if (cancelled) void next.release();
        else lock = next;
      } catch {
        /* refused (low battery, background tab); uploading carries on regardless */
      }
    };
    // the browser drops the lock whenever the tab is hidden
    const onVisible = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release();
    };
  }, [active]);
}

export function UploadProvider({
  state,
  set,
  updatePhotos,
  children,
}: {
  state: BuilderState;
  set: (patch: Partial<BuilderState>) => void;
  updatePhotos: (fn: (photos: BuilderPhoto[]) => BuilderPhoto[]) => void;
  children: ReactNode;
}) {
  const snapshot = useSyncExternalStore(uploadEngine.subscribe, uploadEngine.getSnapshot);
  const stateRef = useRef(state);
  stateRef.current = state;
  const projectPromise = useRef<Promise<string> | null>(null);

  useEffect(
    () =>
      uploadEngine.attach({
        projectId: () => stateRef.current.projectId,
        ensureProject: () => {
          const existing = stateRef.current.projectId;
          if (existing) return Promise.resolve(existing);
          projectPromise.current ??= (async () => {
            try {
              const s = stateRef.current;
              const res = await apiRequest("POST", "/api/projects", {
                name: s.title.trim() || occasionById(s.occasion).suggestedTitle,
                status: "draft",
              });
              const project = (await res.json()) as { id: string };
              set({ projectId: project.id });
              stateRef.current = { ...stateRef.current, projectId: project.id };
              return project.id;
            } finally {
              projectPromise.current = null; // a failure must be retryable
            }
          })();
          return projectPromise.current;
        },
        patchPhoto: (id, patch) => updatePhotos((photos) => photos.map((p) => (p.id === id ? { ...p, ...patch } : p))),
        removePhoto: (id) =>
          updatePhotos((photos) => photos.filter((p) => p.id !== id)),
      }),
    // the callbacks read through refs and dispatch, so one attach is enough
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const addFiles = async (files: FileList | File[] | null) => {
    if (!files) return;
    const all = Array.from(files);
    const images = all.filter(isImageFile);
    const refused = all.filter((f) => !isImageFile(f)).map((f) => f.name);
    if (refused.length) uploadEngine.noteRejected(refused);
    if (!images.length) return;
    const occ = occasionById(stateRef.current.occasion);
    await uploadEngine.add(
      images,
      stateRef.current.photos,
      (file, id, fp, n) => ({
        id,
        fp,
        // occasion labels give captions charm; filename is the fallback
        label: occ.photoLabels[n % occ.photoLabels.length] || cleanLabel(file.name),
        shade: n % 3,
        hd: false,
      }),
      (fresh) => updatePhotos((photos) => [...photos, ...fresh]),
    );
  };

  const { photos } = state;
  const progress = useMemo<UploadProgress>(() => {
    const total = photos.length;
    const inBook = photos.filter((p) => p.url).length;
    const hdDone = photos.filter((p) => p.hd !== false).length;
    const needRepick = photos.filter((p) => p.hd === false && !uploadEngine.holdsFile(p.id)).length;
    return {
      total,
      inBook,
      hdDone,
      needRepick,
      active: snapshot.active,
      fraction: total ? (inBook + hdDone) / (total * 2) : 0,
    };
    // the snapshot version moves when holdsFile's answer can change
  }, [photos, snapshot.version, snapshot.active]);

  useWakeLock(snapshot.active);

  // Warn before leaving only while leaving would actually lose something.
  useEffect(() => {
    if (!snapshot.active) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [snapshot.active]);

  const api = useMemo<UploadApi>(() => ({ addFiles, snapshot, progress }), [snapshot, progress]); // eslint-disable-line react-hooks/exhaustive-deps
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
