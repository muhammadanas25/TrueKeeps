/**
 * UploadScreen — step 2 of 7: choose photos.
 *
 * At least MIN_PHOTOS (10): the smallest book has 10 pages and a page needs a
 * photo (owner, 2026-11-16: one photo a page is the customer's call). Under
 * 30 there's a gentle note that 30 to 50 make a fuller book; from 30, a tick.
 *
 * Choosing is the whole job. The moment files are picked they go to the upload
 * engine (see ../upload/engine.ts), which works in the background, and the
 * customer stays here: photos often live in more than one folder, so they can
 * add more before pressing Continue (owner, 2026-11-22; this used to jump to
 * step 3 on the first pick). Every photo has a remove button (with Undo), and
 * the few that would print badly are flagged (../quality.ts).
 *
 * Print advice lives on this screen, before the picker, because it can still
 * change what they choose. Afterwards it's only worth saying about the actual
 * photos they picked (see ../upload/tips.ts).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, ImagePlus, Info, Lock, Plus, RotateCcw, X } from "lucide-react";
import { Ph } from "../book";
import { coverPhotoIdFor, generatePages, type BookTheme, type BuilderPhoto, type CopyVoice } from "../data";
import { flagLabel, flaggedPhotos } from "../quality";
import type { BuilderState } from "../state";
import { uploadEngine } from "../upload/engine";
import { BEFORE_TIPS } from "../upload/tips";
import { useUploads } from "../upload/UploadContext";
import { TipLine } from "../upload/UploadStatus";
import { RepickSheet } from "../upload/RepickSheet";
import { MIN_PHOTOS } from "./BookScreen";
import "../flow.css";

/** From here a book feels full; below it we say so, gently. */
const FULL_BOOK = 30;

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
  const { addFiles, removePhoto, progress, snapshot } = useUploads();
  const flags = useMemo(() => flaggedPhotos(photos), [photos]);

  /** Picked files start uploading; the customer stays to add more (see the header). */
  const take = (files: FileList | File[] | null) => {
    void addFiles(files);
  };
  const enough = photos.length >= MIN_PHOTOS;
  // the re-add list (design A4): only photos the phone couldn't keep
  const [repickOpen, setRepickOpen] = useState(false);
  const toRepick = photos.filter((p) => p.hd === false && !uploadEngine.canFinish(p.id));

  /**
   * Undo for the remove button: what the book looked like just before, for a
   * few seconds. A photo whose full-quality copy hadn't finished uploading
   * comes back marked "needs adding again", like after a closed tab.
   */
  const [undo, setUndo] = useState<{
    photo: BuilderPhoto;
    at: number;
    book: Pick<BuilderState, "pages" | "pagesEdited" | "removedPhotoIds" | "coverPhotoId">;
  } | null>(null);
  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 6000);
    return () => clearTimeout(t);
  }, [undo]);
  const remove = (p: BuilderPhoto) => {
    setUndo({
      photo: p,
      at: photos.indexOf(p),
      book: { pages: state.pages, pagesEdited: state.pagesEdited, removedPhotoIds: state.removedPhotoIds, coverPhotoId: state.coverPhotoId },
    });
    removePhoto(p.id);
  };
  const putBack = () => {
    if (!undo) return;
    const { photo, at, book } = undo;
    set({ ...book, photos: [...photos.slice(0, at), photo, ...photos.slice(at)] });
    setUndo(null);
  };

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
              {/* website copy v1: different words on a computer and a phone (upload.css .up-desk / .up-phone) */}
              <p>
                <span className="up-desk">Drag your photos here, or choose from your computer</span>
                <span className="up-phone">Choose photos from your gallery</span>
              </p>
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
              <span className="up-need">You'll need at least {MIN_PHOTOS} photos. 30 to 50 works best.</span>
              <span className="bb-formats">Upload from any device. We handle the rest.</span>
              <span className="bb-formats up-safe">
                <Lock size={13} /> Your memories are safe: encrypted and never shared.
              </span>
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
                <button type="button" className="bb-btn bb-btn-secondary" onClick={() => setRepickOpen(true)}>
                  <RotateCcw size={15} /> See which photos
                </button>
              </div>
            ) : null}
            {repickOpen && toRepick.length ? (
              <RepickSheet photos={toRepick} pages={state.pages} coverPhotoId={coverPhotoIdFor(state)} onClose={() => setRepickOpen(false)} />
            ) : null}
            {snapshot.rejected.length ? (
              <div className="ck-rejected" role="alert">
                <p>
                  We couldn't open {snapshot.rejected.length === 1 ? snapshot.rejected[0] : `${snapshot.rejected.length} files`}, so{" "}
                  {snapshot.rejected.length === 1 ? "it isn't" : "they aren't"} in your album.
                </p>
                <button type="button" aria-label="Dismiss" onClick={() => uploadEngine.dismissRejected()}>
                  <X size={15} />
                </button>
              </div>
            ) : null}
            {!enough ? (
              <p className="up-status lock" role="status">
                <Lock size={17} /> Add at least {MIN_PHOTOS} photos to make your album. You have {photos.length} so far.
              </p>
            ) : photos.length < FULL_BOOK ? (
              <p className="up-status" role="status">
                <Info size={17} /> You can go on with {photos.length}. 30 to 50 photos works best.
              </p>
            ) : (
              <p className="up-status ok" role="status">
                <CheckCircle2 size={17} /> {photos.length} photos added. That makes a full album.
              </p>
            )}
            {flags.size ? (
              <p className="up-status warn" role="status">
                <Info size={17} />
                <span>
                  <b>
                    {flags.size} {flags.size === 1 ? "photo" : "photos"} may print soft.
                  </b>{" "}
                  We'll keep {flags.size === 1 ? "it" : "them"} small in your album. You can also remove {flags.size === 1 ? "it" : "them"} and add a sharper copy.
                </span>
              </p>
            ) : null}
            <div
              className="bb-photo-grid"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                take(e.dataTransfer.files);
              }}
            >
              {photos.map((p) => {
                const flag = flags.get(p.id);
                return (
                  <div key={p.id} className="ck-tile">
                    <Ph photo={p} theme={theme} variant="thumb" showLabel={Boolean(p.url) && !flag} />
                    {/* always visible: phones can't hover */}
                    <button type="button" className="ck-tile-x" aria-label="Remove this photo" onClick={() => remove(p)}>
                      <X size={14} strokeWidth={2.6} />
                    </button>
                    {flag ? <span className="ck-tile-flag">{flagLabel(p, flag)}</span> : null}
                  </div>
                );
              })}
            </div>
            <div className="bb-upload-meta">
              <span className="bb-upload-count">
                <CheckCircle2 size={17} />
                {photos.length} {photos.length === 1 ? "photo" : "photos"}
                {enough ? `, a ${estPages}-page album` : ""}
              </span>
              <button type="button" className="bb-btn bb-btn-ghost" onClick={openPicker}>
                <Plus size={16} /> {copy.uploadMore}
              </button>
            </div>
          </>
        )}
      </div>

      {undo ? (
        <div className="up-undo" role="status">
          <span>Photo removed.</span>
          <button type="button" onClick={putBack}>
            Undo
          </button>
        </div>
      ) : null}

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
