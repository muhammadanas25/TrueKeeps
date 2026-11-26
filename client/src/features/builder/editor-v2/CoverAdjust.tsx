/**
 * Adjusting the front cover's photo in the editor (owner, 2026-11-26: "add
 * the option to adjust the image like the other images, on the front too").
 *
 * What: the same three controls page photos have, for the cover photo of the
 * two cover styles that show one (Minimal and Photo cover): drag to move it
 * in its frame, a Zoom slider and a Straighten slider, plus Reset and Done.
 *
 * Approach: the framing is one Placement on the album (BuilderState
 * .coverFrame), tied to the photo it was made for, so choosing another cover
 * photo starts it fresh. Every cover drawing reads it through the look
 * (CoverFace), and the print crops the cover with the very function page
 * photos use (server/print/render.ts renderSlot), so what is framed here is
 * what prints. The pan and zoom arithmetic is reframe.tsx's and print.ts's;
 * nothing here is new maths.
 *
 * Zoom is capped where the cover would print below DPI_MIN, as for pages.
 */

import { useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { Crop, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { DEFAULT_FRAMING, type BuilderPhoto, type CoverStyleId, type Placement } from "../data";
import { DPI_MIN, TILT_MAX, clampTilt, effectiveDpi, printQuality, tiltCover } from "../print";
import { panFrame, panOverflow } from "../reframe";

/** Printed size of the cover photo, in inches (pdf.ts composeCover geometry). */
export function coverPhotoInches(style: CoverStyleId): number | null {
  // Minimal: a square in the top 61.8% of the 10.5 in live area, at 92%
  if (style === "classic") return 10.5 * 0.618 * 0.92;
  // Photo cover: the whole 12 in cover inside a 0.5 in border
  if (style === "moment") return 11;
  return null;
}

/** The cover framing for this photo: the saved one when it was made for it, else untouched. */
export function coverFrameFor(frame: Placement | null | undefined, photoId: string): Placement {
  return frame && frame.photoId === photoId ? frame : { ...DEFAULT_FRAMING, photoId };
}

/** Highest zoom that still prints at DPI_MIN or better (at least 1, at most 4). */
function maxZoomFor(photo: BuilderPhoto, inches: number, tilt: number): number {
  if (!photo.w || !photo.h) return 2;
  const dpi = effectiveDpi({ w: photo.w, h: photo.h }, { w: inches, h: inches }, tiltCover(tilt, 1));
  return Math.max(1, Math.min(4, dpi / DPI_MIN));
}

/** "Adjust photo", shown on the cover while it isn't being adjusted. */
export function CoverAdjustButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="tke-cover-adjust" onClick={onClick}>
      <Crop size={15} aria-hidden="true" /> Adjust photo
    </button>
  );
}

/**
 * The drag surface over the cover while adjusting. It covers the whole cover
 * (a bigger target than the photo), measures the photo's box on screen when a
 * drag starts, and moves the photo exactly with the pointer (panFrame).
 */
export function CoverDragLayer({ photo, frame, onFrame }: { photo: BuilderPhoto; frame: Placement; onFrame: (patch: Partial<Placement>) => void }) {
  const drag = useRef<{ x: number; y: number; fx: number; fy: number; box: { w: number; h: number } } | null>(null);
  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    const ph = e.currentTarget.parentElement?.querySelector<HTMLElement>(".bb-cover .bb-ph");
    if (!ph) return;
    const r = ph.getBoundingClientRect();
    drag.current = { x: e.clientX, y: e.clientY, fx: frame.fx, fy: frame.fy, box: { w: r.width, h: r.height } };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const tilt = clampTilt(frame.tilt);
    const next = panFrame(
      { fx: d.fx, fy: d.fy },
      e.clientX - d.x,
      e.clientY - d.y,
      frame.turn,
      panOverflow(d.box, photo, frame.turn, frame.zoom),
      tilt,
      tiltCover(tilt, 1),
    );
    onFrame(next);
  };
  const up = () => {
    drag.current = null;
  };
  return (
    <div
      className="tke-cover-drag"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      role="application"
      aria-label="Drag to move the cover photo"
    />
  );
}

/** Zoom, Straighten, print quality, Reset and Done: the page photos' bar, for the cover. */
export function CoverAdjustBar({
  photo,
  frame,
  inches,
  mobile,
  onFrame,
  onReset,
  onDone,
}: {
  photo: BuilderPhoto;
  frame: Placement;
  inches: number;
  mobile: boolean;
  onFrame: (patch: Partial<Placement>) => void;
  onReset: () => void;
  onDone: () => void;
}) {
  const tilt = clampTilt(frame.tilt);
  const maxZ = maxZoomFor(photo, inches, tilt);
  const zoom = Math.min(maxZ, Math.max(1, frame.zoom));
  const pct = (zoom - 1) / Math.max(0.001, maxZ - 1);
  const dpi = photo.w && photo.h ? effectiveDpi({ w: photo.w, h: photo.h }, { w: inches, h: inches }, zoom * tiltCover(tilt, 1)) : 0;
  const quality = printQuality(dpi);
  return (
    <div className={"tke-cropbar" + (mobile ? " m" : "")}>
      <p className="tke-cb-tip">Cover photo · drag to move</p>
      <div className="tke-cb-row">
        <ZoomOut size={16} />
        <input
          type="range"
          min={1}
          max={maxZ}
          step={0.01}
          value={zoom}
          aria-label="Zoom the cover photo"
          style={{ "--p": pct * 100 + "%" } as CSSProperties}
          onChange={(e) => onFrame({ zoom: Number(e.target.value) })}
          disabled={maxZ <= 1.001}
        />
        <ZoomIn size={16} />
      </div>
      <div className="tke-cb-row">
        <RotateCcw size={15} />
        <input
          type="range"
          min={-TILT_MAX}
          max={TILT_MAX}
          step={0.5}
          value={tilt}
          aria-label="Straighten the cover photo"
          className="tilt"
          onChange={(e) => {
            const deg = clampTilt(Number(e.target.value));
            onFrame({ tilt: deg, zoom: Math.min(frame.zoom, maxZoomFor(photo, inches, deg)) });
          }}
          onDoubleClick={() => onFrame({ tilt: 0 })}
        />
        <span className="tke-cb-val">
          {tilt > 0 ? "+" : ""}
          {tilt.toFixed(1)}°
        </span>
      </div>
      {quality !== "unknown" ? (
        <span className={"tke-q q-" + quality}>
          <i />
          {quality === "great" ? "Prints sharp" : quality === "good" ? "Good for print" : "May look soft"}
        </span>
      ) : null}
      <button type="button" className="tke-btn ghost sm" onClick={onReset}>
        Reset
      </button>
      <button type="button" className="tke-btn sm" onClick={onDone}>
        Done
      </button>
    </div>
  );
}
