/**
 * Connects the upload engine to the builder.
 *
 * The engine lives outside React; this is the bridge. The provider sits at the
 * shell so any screen can add photos and read progress, and it creates the
 * backing project once, however many uploads ask at the same time.
 *
 * Keeping a long upload alive (the screen wake lock, the warning before
 * leaving) lives in UploadNotices at the app shell instead, so it works on
 * every page of the site, not only inside the builder.
 *
 * Progress counts come from the builder's photos where possible, so what the
 * screen says survives a reload and can't drift from the book itself.
 */

import { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";
import { apiRequest } from "@/lib/queryClient";
import { occasionById, reshapePage, type BookPage, type BuilderPhoto } from "../data";
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
  /**
   * Add photos to the book. With `onlyMissing`, only photos the book is
   * waiting on are taken (the re-add list); the result says how many.
   */
  addFiles: (files: FileList | File[] | null, opts?: { onlyMissing?: boolean }) => Promise<{ added: number; resumed: number }>;
  /**
   * Delete a photo for good (the remove button on the photos step): it leaves
   * the photo list, every page it was on (that page lays itself out again, or
   * goes if it was the page's only photo), the taken-out list and the cover
   * choice, and the upload engine stops working on it.
   */
  removePhoto: (id: string) => void;
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

  /*
   * Uploads that finished while the builder was closed (on another page, or
   * before a reload) never reached this book's state. Ask the server once the
   * book is open, and once more when the photos carried over from an earlier
   * visit have all finished, so a photo that's safe never shows blank or asks
   * to be added again.
   */
  const restoredLeft = snapshot.restored?.left;
  useEffect(() => {
    const s = stateRef.current;
    if (!s.projectId || !s.photos.some((p) => (p.hd === false || !p.url) && !uploadEngine.holdsFile(p.id))) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiRequest("GET", `/api/projects/${s.projectId}/photo-status`);
        const { photos: known } = (await res.json()) as { photos: Array<{ id: string; url: string; hd: boolean }> };
        const byId = new Map(known.map((k) => [k.id, k]));
        if (cancelled || !byId.size) return;
        updatePhotos((photos) =>
          photos.map((p) => {
            const k = byId.get(p.id);
            if (!k) return p;
            const patch: Partial<BuilderPhoto> = {};
            if (!p.url && k.url.startsWith("/media/")) patch.url = k.url;
            if (p.hd === false && k.hd) patch.hd = true;
            return Object.keys(patch).length ? { ...p, ...patch } : p;
          }),
        );
      } catch {
        /* offline: the next open asks again */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state.projectId, restoredLeft === 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const addFiles = async (files: FileList | File[] | null, opts: { onlyMissing?: boolean } = {}) => {
    const none = { added: 0, resumed: 0 };
    if (!files) return none;
    const all = Array.from(files);
    const images = all.filter(isImageFile);
    const refused = all.filter((f) => !isImageFile(f)).map((f) => f.name);
    if (refused.length && !opts.onlyMissing) uploadEngine.noteRejected(refused);
    if (!images.length) return none;
    const occ = occasionById(stateRef.current.occasion);
    return uploadEngine.add(
      images,
      stateRef.current.photos,
      (file, id, fp, n, meta) => ({
        id,
        fp,
        name: file.name.slice(0, 255),
        ...(meta.taken ? { taken: Math.round(meta.taken) } : null),
        // occasion labels give captions charm; filename is the fallback
        label: occ.photoLabels[n % occ.photoLabels.length] || cleanLabel(file.name),
        shade: n % 3,
        hd: false,
      }),
      (fresh) => updatePhotos((photos) => [...photos, ...fresh]),
      opts,
    );
  };

  const { photos } = state;
  const progress = useMemo<UploadProgress>(() => {
    const total = photos.length;
    const inBook = photos.filter((p) => p.url).length;
    const hdDone = photos.filter((p) => p.hd !== false).length;
    const needRepick = photos.filter((p) => p.hd === false && !uploadEngine.canFinish(p.id)).length;
    return {
      total,
      inBook,
      hdDone,
      needRepick,
      active: snapshot.active,
      fraction: total ? (inBook + hdDone) / (total * 2) : 0,
    };
    // the snapshot version moves when canFinish's answer can change
  }, [photos, snapshot.version, snapshot.active]);

  const removePhoto = (id: string) => {
    uploadEngine.forget(id);
    const s = stateRef.current;
    const left = s.photos.filter((p) => p.id !== id);
    const pages: BookPage[] = [];
    s.pages.forEach((page) => {
      if (!page.slots.some((x) => x.photoId === id)) return pages.push(page);
      const slots = page.slots.filter((x) => x.photoId !== id);
      const next = slots.length ? reshapePage(page, slots, left, pages.length) : null;
      if (next) pages.push(next);
    });
    // pagesEdited and removedPhotoIds are passed so the reducer doesn't count this as taking a photo out
    set({
      pages,
      pagesEdited: s.pagesEdited,
      removedPhotoIds: s.removedPhotoIds.filter((x) => x !== id),
      ...(s.coverPhotoId === id ? { coverPhotoId: null } : null),
    });
    updatePhotos((photos) => photos.filter((p) => p.id !== id));
  };

  const api = useMemo<UploadApi>(() => ({ addFiles, removePhoto, snapshot, progress }), [snapshot, progress]); // eslint-disable-line react-hooks/exhaustive-deps
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
