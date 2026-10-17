/**
 * UploadScreen — step 2 of 3: real photo upload, persisted server-side.
 *
 * Ported from `book_builder/screens1.jsx`; upload path is the Phase 1
 * media pipeline (client/src/lib/uploads.ts):
 *  - a backing project is created lazily on the first upload (the
 *    builder is otherwise fully client-side until then)
 *  - each file is compressed in a worker, PUT directly to the media
 *    store via presigned URL, and registered — the returned server URL
 *    is small enough to persist in the localStorage draft, so photos
 *    now SURVIVE reloads
 *  - if the server is unreachable, we fall back to an in-memory data
 *    URL so the flow never blocks (that photo just won't survive
 *    reload — same as the pre-Phase-1 behavior)
 *  - each photo gets a curated caption label from the chosen occasion,
 *    assigned round-robin (a vision captioner slots in later)
 *
 * The live page-count estimate re-runs the pure generatePages() on the
 * current photo set so "N photos — a M-page book" is always truthful.
 */

import { useRef, useState } from "react";
import { CheckCircle2, ImagePlus, Plus, Sparkles } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { readImageSize, uploadPhotoFile } from "@/lib/uploads";
import { Ph } from "../book";
import { generatePages, occasionById, type BookTheme, type BuilderPhoto, type CopyVoice } from "../data";
import type { BuilderState } from "../state";

/** "IMG_2041.jpeg" → "img 2041"; falls back to occasion labels for captions. */
function cleanLabel(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .trim()
    .toLowerCase()
    .slice(0, 28);
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function UploadScreen({
  state,
  set,
  copy,
  theme,
  onContinue,
}: {
  state: BuilderState;
  set: (patch: Partial<BuilderState>) => void;
  copy: CopyVoice;
  theme: BookTheme;
  onContinue: () => void;
}) {
  const { photos } = state;
  const hasPhotos = photos.length > 0;
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);

  const occ = occasionById(state.occasion);

  /** Create the backing server project on first use (name = book title). */
  const ensureProject = async (): Promise<string | null> => {
    if (state.projectId) return state.projectId;
    try {
      const res = await apiRequest("POST", "/api/projects", {
        name: state.title.trim() || occ.suggestedTitle,
        status: "draft",
      });
      const project: { id: string } = await res.json();
      set({ projectId: project.id });
      return project.id;
    } catch {
      return null; // offline/dev hiccup → photos fall back to data URLs
    }
  };

  /** Ingest files: upload server-side (preferred) → BuilderPhoto[]. */
  const addFiles = async (files: FileList | File[] | null) => {
    if (!files || busy) return;
    const images = Array.from(files).filter((f) => f.type.startsWith("image/") || /\.heic$/i.test(f.name));
    if (!images.length) return;
    setBusy(true);
    const projectId = await ensureProject();
    const startIdx = photos.length;
    const next: BuilderPhoto[] = [];
    for (let i = 0; i < images.length; i++) {
      const file = images[i];
      const n = startIdx + i;
      let id = "p" + Date.now().toString(36) + "-" + n;
      let url: string | undefined;
      // True pixel size of the uploaded bytes. Recorded on the photo so
      // the editor can bound zoom and flag soft pages WITHOUT re-reading
      // the file or waiting on the server's async sharp pass.
      let w: number | undefined;
      let h: number | undefined;
      if (projectId) {
        try {
          const uploaded = await uploadPhotoFile(file, projectId);
          id = uploaded.id;
          url = uploaded.url; // server URL — persists across reloads
          w = uploaded.width ?? undefined;
          h = uploaded.height ?? undefined;
        } catch {
          url = undefined; // fall through to the local-only path below
        }
      }
      if (!url) {
        try {
          url = await readAsDataURL(file); // offline fallback, session-only
          // the upload path never ran, so measure the original directly
          const size = await readImageSize(file);
          w = size?.w;
          h = size?.h;
        } catch {
          url = undefined; // unreadable file → labelled placeholder tile
        }
      }
      next.push({
        id,
        // occasion labels give captions charm; filename is the fallback
        label: occ.photoLabels[n % occ.photoLabels.length] || cleanLabel(file.name),
        shade: n % 3,
        url,
        w,
        h,
      });
    }
    set({ photos: [...photos, ...next] });
    setBusy(false);
  };

  const openPicker = () => inputRef.current?.click();
  const estPages = photos.length ? generatePages(photos, state.density).length : 0;

  return (
    <div className="bb-screen bb-upload">
      <div className="bb-upload-inner">
        <div className="bb-kicker">Step 2 — photos</div>
        <h1>{copy.uploadTitle}</h1>
        <p className="bb-sub">{copy.uploadSub}</p>

        {/* hidden real input drives both the dropzone and "Add more" */}
        <input
          ref={inputRef}
          type="file"
          accept="image/*,.heic"
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = ""; // allow re-picking the same files
          }}
        />

        {!hasPhotos ? (
          <div
            className={"bb-dropzone" + (dragOver ? " drag" : "")}
            onClick={openPicker}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter") openPicker();
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              addFiles(e.dataTransfer.files);
            }}
          >
            <ImagePlus size={40} strokeWidth={1.4} />
            <p>{busy ? "Adding your photos…" : "Drop your photos here, or browse your device"}</p>
            <button className="bb-btn bb-btn-primary" onClick={openPicker}>
              {copy.uploadCta}
            </button>
            <span className="bb-formats">JPG, PNG, and HEIC — we handle the rest</span>
          </div>
        ) : (
          <>
            <div
              className="bb-photo-grid"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                addFiles(e.dataTransfer.files);
              }}
            >
              {photos.map((p) => (
                <Ph key={p.id} photo={p} theme={theme} />
              ))}
            </div>
            <div className="bb-upload-meta">
              <span className="bb-upload-count">
                <CheckCircle2 size={17} />
                {photos.length} photos — a {estPages}-page book
              </span>
              <button className="bb-btn bb-btn-ghost" onClick={openPicker} disabled={busy}>
                <Plus size={16} /> {busy ? "Adding…" : copy.uploadMore}
              </button>
            </div>
          </>
        )}
      </div>

      {hasPhotos ? (
        <div className="bb-actionbar">
          <button className="bb-btn bb-btn-primary bb-btn-lg" onClick={onContinue}>
            <Sparkles size={18} /> Design my book
          </button>
        </div>
      ) : null}
    </div>
  );
}
