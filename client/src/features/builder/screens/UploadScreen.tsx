/**
 * UploadScreen — step 2 of 7: choose photos.
 *
 * At least MIN_PHOTOS (10): the smallest book has 10 pages and a page needs a
 * photo (owner, 2026-11-16: one photo a page is the customer's call). Under
 * 30 there's a gentle note that 30 to 50 make a fuller book; from 30, a tick.
 *
 * Choosing is the whole job. The moment files are picked they go to the upload
 * engine (see ../upload/engine.ts) and the customer moves straight on to
 * ComposeScreen, so nobody waits here. Coming back shows every photo with its
 * state, and a way to add more or to re-add any whose original was lost when a
 * tab closed mid-upload.
 *
 * Print advice lives on this screen, before the picker, because it can still
 * change what they choose. Afterwards it's only worth saying about the actual
 * photos they picked (see ../upload/tips.ts).
 */

import { useRef, useState } from "react";
import { ArrowRight, CheckCircle2, ImagePlus, Info, Lock, Plus, RotateCcw, X } from "lucide-react";
import { Ph } from "../book";
import { generatePages, type BookTheme, type CopyVoice } from "../data";
import type { BuilderState } from "../state";
import { uploadEngine } from "../upload/engine";
import { BEFORE_TIPS } from "../upload/tips";
import { useUploads } from "../upload/UploadContext";
import { TipLine } from "../upload/UploadStatus";
import { MIN_PHOTOS } from "./BookScreen";
import "../flow.css";

/** From here a book feels full; below it we say so, gently. */
const FULL_BOOK = 30;

export function UploadScreen({
  state,
  copy,
  theme,
  onContinue,
}: {
  state: BuilderState;
  copy: CopyVoice;
  theme: BookTheme;
  onContinue: () => void;
}) {
  const { photos } = state;
  const hasPhotos = photos.length > 0;
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const { addFiles, progress, snapshot } = useUploads();

  /**
   * The first pick of a book carries straight on to the next questions while
   * it uploads, when it is enough for a book; adding more stays here to review.
   */
  const take = (files: FileList | File[] | null) => {
    const first = !hasPhotos;
    void addFiles(files);
    if (first && files && files.length >= MIN_PHOTOS) onContinue();
  };
  const enough = photos.length >= MIN_PHOTOS;

  const openPicker = () => inputRef.current?.click();
  const estPages = photos.length ? generatePages(photos, state.density).length : 0;

  return (
    <div className="bb-screen bb-upload">
      <div className="bb-upload-inner">
        <h1>{copy.uploadTitle}</h1>
        <p className="bb-sub">{copy.uploadSub}</p>

        {/* hidden real input drives both the dropzone and "Add more" */}
        <input
          ref={inputRef}
          type="file"
          accept="image/*,.heic,.heif"
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            take(e.target.files ? Array.from(e.target.files) : null);
            e.target.value = ""; // allow re-picking the same files
          }}
        />

        {!hasPhotos ? (
          <>
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
                take(e.dataTransfer.files);
              }}
            >
              <ImagePlus size={40} strokeWidth={1.4} />
              <p>Drop your photos here, or browse your device</p>
              <button
                type="button"
                className="bb-btn bb-btn-primary"
                onClick={(e) => {
                  e.stopPropagation();
                  openPicker();
                }}
              >
                {copy.uploadCta}
              </button>
              {/* the minimum, before they pick rather than after (owner, 2026-11-21) */}
              <span className="up-need">Pick at least {MIN_PHOTOS}. 30 to 50 make a fuller book.</span>
              <span className="bb-formats">JPG, PNG, and HEIC. We handle the rest.</span>
            </div>
            <TipLine className="ck-before" lineFor={(n) => BEFORE_TIPS[n % BEFORE_TIPS.length]} />
          </>
        ) : (
          <>
            {progress.needRepick > 0 && !progress.active ? (
              <div className="ck-repick" role="status">
                <p>
                  <b>
                    {progress.needRepick} {progress.needRepick === 1 ? "photo needs" : "photos need"} adding again.
                  </b>{" "}
                  The page closed before the full-quality {progress.needRepick === 1 ? "copy" : "copies"} finished. Choose the same photos and we'll pick up where we left off.
                </p>
                <button type="button" className="bb-btn bb-btn-secondary" onClick={openPicker}>
                  <RotateCcw size={15} /> Choose photos
                </button>
              </div>
            ) : null}
            {snapshot.rejected.length ? (
              <div className="ck-rejected" role="alert">
                <p>
                  We couldn't open {snapshot.rejected.length === 1 ? snapshot.rejected[0] : `${snapshot.rejected.length} files`}, so{" "}
                  {snapshot.rejected.length === 1 ? "it isn't" : "they aren't"} in your book.
                </p>
                <button type="button" aria-label="Dismiss" onClick={() => uploadEngine.dismissRejected()}>
                  <X size={15} />
                </button>
              </div>
            ) : null}
            {!enough ? (
              <p className="up-status lock" role="status">
                <Lock size={17} /> Add at least {MIN_PHOTOS} photos to make your book. You have {photos.length} so far.
              </p>
            ) : photos.length < FULL_BOOK ? (
              <p className="up-status" role="status">
                <Info size={17} /> You can go on with {photos.length}. We recommend 30 to 50 photos for a fuller book.
              </p>
            ) : (
              <p className="up-status ok" role="status">
                <CheckCircle2 size={17} /> {photos.length} photos added. That makes a full book.
              </p>
            )}
            <div
              className="bb-photo-grid"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                take(e.dataTransfer.files);
              }}
            >
              {photos.map((p) => (
                <div key={p.id} className={"ck-tile" + (p.url ? "" : " waiting")}>
                  <Ph photo={p} theme={theme} variant="thumb" showLabel={Boolean(p.url)} />
                </div>
              ))}
            </div>
            <div className="bb-upload-meta">
              <span className="bb-upload-count">
                <CheckCircle2 size={17} />
                {photos.length} {photos.length === 1 ? "photo" : "photos"}
                {enough ? `, a ${estPages}-page book` : ""}
              </span>
              <button type="button" className="bb-btn bb-btn-ghost" onClick={openPicker}>
                <Plus size={16} /> {copy.uploadMore}
              </button>
            </div>
          </>
        )}
      </div>

      {hasPhotos ? (
        <div className="bb-actionbar">
          <button type="button" className="bb-btn bb-btn-primary bb-btn-lg" onClick={onContinue} disabled={!enough}>
            Continue <ArrowRight size={18} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
