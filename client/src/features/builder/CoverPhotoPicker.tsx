/**
 * CoverPhotoPicker — choose the photo on the front cover (2026-11-21).
 *
 * What: a row that shows the cover photo with "Change photo", and the picker
 * it opens: every photo the customer added, in a grid, the current one ticked.
 * "Let us pick" hands the choice back to us (coverPhotoIdFor in data.ts: the
 * photo of the first twelve that loses least on a square cover).
 *
 * Why its own choice: the cover used to be "the first photo", and the
 * editor's way to change it moved the chosen photo to the front of the list.
 * The photo order is the book's reading order, so that quietly reshuffled the
 * book the next time it was laid out. The choice is now stored by itself
 * (BuilderState.coverPhotoId) and the photos never move.
 *
 * Layout: a centred window on wide screens, a bottom sheet on phones (CSS in
 * flow.css). The choice is applied when the customer taps "Use this photo";
 * closing the picker any other way changes nothing.
 */

import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { Ph } from "./book";
import { autoCoverPhotoId, bookPhotos, type BookTheme, type BuilderPhoto, type CoverStyleId } from "./data";

/** Wider than this loses more than a quarter of itself on a square cover. */
const WIDE = 4 / 3 + 0.01;
const isWide = (p: BuilderPhoto) => Boolean(p.w && p.h && p.w / p.h > WIDE);

/** The row on steps 3 and 6: the cover photo, a line about it, and "Change photo". */
export function CoverPhotoRow({
  photo,
  chosen,
  theme,
  onOpen,
  compact = false,
}: {
  photo: BuilderPhoto | undefined;
  /** true when the customer picked it, false when it is ours */
  chosen: boolean;
  theme: BookTheme;
  onOpen: () => void;
  /** phones: one tappable line */
  compact?: boolean;
}) {
  if (compact) {
    return (
      <button type="button" className="cp-row compact" onClick={onOpen}>
        <span className="cp-thumb">{photo ? <Ph photo={photo} theme={theme} showLabel={false} variant="thumb" /> : null}</span>
        <span className="cp-text">
          Cover photo: <b>{chosen ? "your choice" : "our pick"}</b>
        </span>
        <span className="cp-change">Change</span>
      </button>
    );
  }
  return (
    <div className="cp-row">
      <span className="cp-thumb">{photo ? <Ph photo={photo} theme={theme} showLabel={false} variant="thumb" /> : null}</span>
      <span className="cp-text">
        <b>Cover photo</b>
        <span>{chosen ? "Chosen by you" : "We picked this one for you. Change it anytime."}</span>
      </span>
      <button type="button" className="bb-btn bb-btn-secondary cp-btn" onClick={onOpen}>
        Change photo
      </button>
    </div>
  );
}

/** The picker itself. Applies nothing until "Use this photo". */
export function CoverPhotoPicker({
  photos,
  removedPhotoIds,
  current,
  coverStyle,
  theme,
  onPick,
  onClose,
}: {
  photos: BuilderPhoto[];
  removedPhotoIds: string[];
  /** BuilderState.coverPhotoId: a chosen photo, or null for ours */
  current: string | null;
  coverStyle: CoverStyleId;
  theme: BookTheme;
  /** a photo id, or null for "let us pick" */
  onPick: (id: string | null) => void;
  onClose: () => void;
}) {
  const ours = autoCoverPhotoId(bookPhotos({ photos, removedPhotoIds }));
  const [sel, setSel] = useState<string | null>(current && photos.some((p) => p.id === current) ? current : ours);
  const [squareOnly, setSquareOnly] = useState(false);
  const full = coverStyle === "moment";
  const shown = squareOnly ? photos.filter((p) => !isWide(p)) : photos;
  const dialog = useRef<HTMLDivElement>(null);

  // Escape closes; focus starts inside the window so keyboard users land in it.
  useEffect(() => {
    dialog.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="cp-veil" onClick={onClose}>
      <div
        ref={dialog}
        className="cp-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cp-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="bk-grip cp-grip" aria-hidden="true" />
        <div className="cp-head">
          <div>
            <h2 id="cp-title">Choose your cover photo</h2>
            <p>{full ? "The cover is square, so square and upright photos keep the most of themselves." : "Any of your photos. It sits in the frame on the cover."}</p>
          </div>
          <button type="button" className="cp-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {full ? (
          <div className="bk-seg cp-filter" role="radiogroup" aria-label="Which photos">
            <button type="button" role="radio" aria-checked={!squareOnly} className={!squareOnly ? "on" : ""} onClick={() => setSquareOnly(false)}>
              All {photos.length} photos
            </button>
            <button type="button" role="radio" aria-checked={squareOnly} className={squareOnly ? "on" : ""} onClick={() => setSquareOnly(true)}>
              Best for a square cover
            </button>
          </div>
        ) : null}
        <div className="cp-grid" role="radiogroup" aria-label="Your photos">
          {shown.map((p) => {
            const on = p.id === sel;
            return (
              <button key={p.id} type="button" role="radio" aria-checked={on} aria-label={`Photo ${photos.indexOf(p) + 1}`} className={"cp-tile" + (on ? " on" : "")} onClick={() => setSel(p.id)}>
                <Ph photo={p} theme={theme} showLabel={false} variant="thumb" />
                {on ? (
                  <span className="cp-tick" aria-hidden="true">
                    <Check size={13} strokeWidth={3} />
                  </span>
                ) : null}
                {p.id === ours ? <span className="cp-ours">Our pick</span> : null}
              </button>
            );
          })}
        </div>
        <div className="cp-foot">
          <button type="button" className="cp-auto" onClick={() => onPick(null)}>
            Let us pick
          </button>
          <button type="button" className="bb-btn bb-btn-primary" onClick={() => onPick(sel)} disabled={!sel}>
            Use this photo
          </button>
        </div>
      </div>
    </div>
  );
}
