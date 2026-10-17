/**
 * Reframing — drag to reposition, zoom, quarter-turn, reset.
 *
 * The whole feature is two pieces:
 *
 *   SlotHit    the transparent layer over a photo in the customize
 *              spread. A drag pans; a tap opens the bar. It is the same
 *              element that used to be the "swap photo" button, so the
 *              page markup gains nothing and swap simply moves into the
 *              bar where the rest of the controls live.
 *
 *   ReframeBar the controls for the slot you tapped. Four of them, on
 *              one line, under the spread — deliberately not a panel and
 *              not a modal, because reframing is something you do while
 *              LOOKING at the page.
 *
 * The pan arithmetic lives here as pure functions rather than inside the
 * pointer handler, because it is the part that can be wrong in a way you
 * only notice in print, and pure functions can be swept exhaustively.
 *
 * What makes the whole thing safe is that it can only ever emit fx, fy
 * in [0,1] and zoom in [1, slotMaxZoom]. Coverage of the slot is
 * guaranteed by CSS for every value in those ranges (see `Ph`), and
 * slotMaxZoom is derived from the photo's real pixels against the
 * printed inches — so the controls have no reachable state that
 * stretches, gaps, or prints soft.
 */

import type React from "react";
import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { Maximize2, Repeat, RotateCw, Trash2, TriangleRight, Undo2, ZoomIn } from "lucide-react";
import { DEFAULT_FRAMING, type BuilderPhoto, type PageLayoutId, type Placement } from "./data";
import {
  DPI_MIN,
  TILT_MAX,
  clampTilt,
  effectiveDpi,
  framedZoom,
  placedInches,
  printQuality,
  slotAspect as slotAspectOf,
  slotMaxZoom,
  tiltCover,
} from "./print";

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.5);

/** Movement below this is a tap, not a drag. Roughly a fingertip wobble. */
export const DRAG_SLOP = 3;

/* ── Pan arithmetic ─────────────────────────────────────────── */

/**
 * A screen-space drag, expressed in the photo's own axes.
 *
 * The photo sits inside up to two nested rotated wrappers (see `Ph` in
 * book.tsx), so a drag has to be carried inwards through both before it
 * means anything to `fx`/`fy`.
 *
 *  1. The tilt wrapper rotates by `tilt` and scales by `cover`. Undoing
 *     it is a rotation by −tilt followed by a division: on screen the
 *     wrapper's contents are magnified by `cover`, so a 100px drag is
 *     only 100/cover px of movement inside it. Skipping that division is
 *     the bug where a straightened photo runs slightly ahead of the
 *     cursor.
 *  2. The turn wrapper rotates by a multiple of 90°. Rotating a local
 *     vector (u,v) by θ puts it on screen at (u·cosθ − v·sinθ,
 *     u·sinθ + v·cosθ); the four cases below are those inverses, written
 *     out because at right angles they are exact and free of rounding.
 *
 * With tilt 0 and cover 1 — every placement in a book nobody has
 * straightened — this reduces to exactly what it did before.
 */
export function localDelta(
  dx: number,
  dy: number,
  turn: Placement["turn"],
  tilt = 0,
  cover = 1,
): { x: number; y: number } {
  let x = dx;
  let y = dy;
  const deg = Number.isFinite(tilt) ? tilt : 0;
  if (deg !== 0) {
    const t = (-deg * Math.PI) / 180;
    const c = Math.cos(t);
    const s = Math.sin(t);
    x = dx * c - dy * s;
    y = dx * s + dy * c;
  }
  const k = Number.isFinite(cover) && cover > 0 ? cover : 1;
  x /= k;
  y /= k;
  switch (turn) {
    case 90:
      return { x: y, y: -x };
    case 180:
      return { x: -x, y: -y };
    case 270:
      return { x: -y, y: x };
    default:
      return { x, y };
  }
}

/**
 * How much photo hangs outside the slot, per axis, in screen pixels —
 * i.e. how far there is to pan.
 *
 * `object-fit: cover` scales the photo by whichever axis needs the most
 * magnification, so the drawn size is (W, H) × cover × zoom; subtracting
 * the box leaves the slack. At zoom 1 exactly one axis has slack (the
 * other is the one that determined the cover scale), which is why a
 * freshly placed photo pans in one direction only — correct, and the
 * reason the bar offers zoom right next to the drag.
 *
 * When the photo's pixel size is unknown (an undecodable HEIC), we
 * assume it matches the box: the slack then comes purely from zoom,
 * which is conservative and never over-pans.
 *
 * Tilt does not appear here, deliberately. The tilt wrapper is inset to
 * the slot exactly and only magnified by a transform, so in the local
 * units this function speaks the box is still the slot's own size — the
 * magnification is accounted for once, in `localDelta`, by dividing the
 * incoming screen delta. Applying it in both places would halve the
 * drag speed of every straightened photo.
 */
export function panOverflow(
  rect: { w: number; h: number },
  photo: Pick<BuilderPhoto, "w" | "h"> | null | undefined,
  turn: Placement["turn"],
  zoom: number,
): { x: number; y: number } {
  // The box the photo actually fills is the slot, transposed on a quarter turn.
  const box = turn === 90 || turn === 270 ? { w: rect.h, h: rect.w } : { w: rect.w, h: rect.h };
  if (!(box.w > 0 && box.h > 0)) return { x: 0, y: 0 };
  const pw = photo?.w && photo.w > 0 ? photo.w : box.w;
  const ph = photo?.h && photo.h > 0 ? photo.h : box.h;
  const cover = Math.max(box.w / pw, box.h / ph);
  const z = Math.max(1, Number.isFinite(zoom) ? zoom : 1);
  return { x: Math.max(0, pw * cover * z - box.w), y: Math.max(0, ph * cover * z - box.h) };
}

/**
 * Focal point after a drag of (dx, dy) screen pixels from `start`.
 *
 * The sign is inverted because fx is a viewport position, not an image
 * position: fx = 1 shows the RIGHT edge of the photo, so dragging the
 * photo rightwards has to DECREASE it. Dividing by the overflow makes
 * the photo track the pointer exactly — one pixel of drag moves one
 * pixel of photo — and an axis with no overflow simply doesn't move
 * rather than snapping to a clamp.
 */
export function panFrame(
  start: { fx: number; fy: number },
  dx: number,
  dy: number,
  turn: Placement["turn"],
  overflow: { x: number; y: number },
  tilt = 0,
  cover = 1,
): { fx: number; fy: number } {
  const d = localDelta(dx, dy, turn, tilt, cover);
  return {
    fx: overflow.x > 0.5 ? clamp01(start.fx - d.x / overflow.x) : clamp01(start.fx),
    fy: overflow.y > 0.5 ? clamp01(start.fy - d.y / overflow.y) : clamp01(start.fy),
  };
}

/** True when the placement is untouched — used to grey out "Reset".
 *  `tilt` is compared through `?? 0` because an untilted placement may
 *  carry the key as 0, as undefined (loaded from a document, where it is
 *  omitted), or not at all (an old draft). All three mean level. */
export const isDefaultFraming = (p: Placement): boolean =>
  p.fx === DEFAULT_FRAMING.fx &&
  p.fy === DEFAULT_FRAMING.fy &&
  p.zoom === DEFAULT_FRAMING.zoom &&
  p.turn === DEFAULT_FRAMING.turn &&
  (p.tilt ?? 0) === 0;

/* ── The drag surface ───────────────────────────────────────── */

export function SlotHit({
  photo,
  placement,
  focused,
  slotAspect = 1,
  onTap,
  onFrame,
}: {
  photo: BuilderPhoto;
  placement: Placement;
  focused: boolean;
  /** the slot's own w/h — only read to price the tilt magnification */
  slotAspect?: number;
  onTap: () => void;
  /** live during the drag — the parent commits every move */
  onFrame: (patch: Pick<Placement, "fx" | "fy">) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const drag = useRef<{
    x: number;
    y: number;
    from: { fx: number; fy: number };
    overflow: { x: number; y: number };
    turn: Placement["turn"];
    tilt: number;
    cover: number;
    moved: boolean;
  } | null>(null);

  const down = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const el = ref.current;
    if (!el || e.button !== 0) return;
    const r = el.getBoundingClientRect();
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      from: { fx: placement.fx, fy: placement.fy },
      // Measured once, at grab time: the slot cannot resize mid-drag, and
      // re-measuring per move would fight the very transform we're setting.
      overflow: panOverflow({ w: r.width, h: r.height }, photo, placement.turn, placement.zoom),
      turn: placement.turn,
      tilt: clampTilt(placement.tilt),
      cover: tiltCover(placement.tilt, slotAspect),
      moved: false,
    };
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* capture unsupported — drag still works while the pointer stays inside */
    }
  };

  const move = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.abs(dx) < DRAG_SLOP && Math.abs(dy) < DRAG_SLOP) return;
    d.moved = true;
    onFrame(panFrame(d.from, dx, dy, d.turn, d.overflow, d.tilt, d.cover));
  };

  const up = () => {
    const d = drag.current;
    drag.current = null;
    // A press that never moved is a tap: open the controls for this slot.
    if (d && !d.moved) onTap();
  };

  /**
   * Keyboard equivalent. Dragging is the obvious gesture but it is also
   * the only one, so without this the whole feature is unreachable
   * without a pointer: arrows nudge the photo, Enter/Space opens the
   * bar (a keyboard activation fires `click`, never our pointer path).
   */
  const NUDGE = 8; // px, the same units a drag speaks
  const key = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onTap();
      return;
    }
    const step: Record<string, [number, number]> = {
      ArrowLeft: [-NUDGE, 0],
      ArrowRight: [NUDGE, 0],
      ArrowUp: [0, -NUDGE],
      ArrowDown: [0, NUDGE],
    };
    const s = step[e.key];
    const el = ref.current;
    if (!s || !el) return;
    e.preventDefault();
    const r = el.getBoundingClientRect();
    const overflow = panOverflow({ w: r.width, h: r.height }, photo, placement.turn, placement.zoom);
    onFrame(
      panFrame(placement, s[0], s[1], placement.turn, overflow, clampTilt(placement.tilt), tiltCover(placement.tilt, slotAspect)),
    );
  };

  return (
    <button
      ref={ref}
      className={"bb-slot-hit" + (focused ? " on" : "")}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={() => (drag.current = null)}
      onKeyDown={key}
      onClick={(e) => e.stopPropagation()}
      aria-label={"Adjust photo: " + photo.label}
    >
      <span className="bb-slot-tag">
        <Maximize2 size={12} /> Drag to reposition
      </span>
    </button>
  );
}

/* ── The controls ───────────────────────────────────────────── */

export function ReframeBar({
  photo,
  placement,
  layout,
  slotIdx,
  onFrame,
  onSwap,
  onRemove,
  removeLabel,
}: {
  photo: BuilderPhoto | undefined;
  placement: Placement;
  layout: PageLayoutId;
  slotIdx: number;
  onFrame: (patch: Partial<Placement>) => void;
  onSwap: () => void;
  onRemove: () => void;
  /** what removing this photo will do to the page, in plain words */
  removeLabel: string;
}) {
  const tilt = clampTilt(placement.tilt);
  const max = slotMaxZoom(photo, layout, slotIdx, placement.turn, undefined, tilt);
  const zoom = Math.min(max, Math.max(1, placement.zoom));

  // The DPI is never shown. It only decides whether the one honest
  // sentence appears — and because the slider stops at `max`, the user
  // can only get here by starting with a small photo, not by dragging.
  const px = photo?.w && photo?.h ? { w: photo.w, h: photo.h } : null;
  const dpi = px
    ? effectiveDpi(px, placedInches(layout, slotIdx, placement.turn), framedZoom({ zoom, tilt }, layout, slotIdx))
    : 0;
  const soft = printQuality(dpi) === "low";

  /**
   * Turning changes which slot edge the photo has to cover, so the zoom
   * ceiling moves with it. Re-clamping here is what stops a rotate from
   * quietly carrying an old zoom past the quality floor.
   */
  const rotate = () => {
    const turn = (((placement.turn + 90) % 360) as Placement["turn"]);
    const lim = slotMaxZoom(photo, layout, slotIdx, turn, undefined, tilt);
    onFrame({ turn, zoom: Math.min(zoom, lim) });
  };

  /**
   * Straightening spends the same budget zoom does, so the two have to
   * be re-reconciled on every move of the dial — otherwise a photo
   * zoomed to its limit and then straightened would sail past the
   * quality floor while both individual controls still looked legal.
   * The zoom slider visibly shortens as the dial moves; this line is
   * what pulls the handle back with it.
   */
  const straighten = (next: number) => {
    const deg = clampTilt(next);
    const lim = slotMaxZoom(photo, layout, slotIdx, placement.turn, undefined, deg);
    onFrame({ tilt: deg, zoom: Math.min(zoom, lim) });
  };

  // How much of the photo straightening is currently eating. Shown only
  // once it is worth knowing about, and phrased as cropping rather than
  // as resolution, because cropping is the part the user can see.
  const cover = tiltCover(tilt, slotAspectOf(layout, slotIdx));
  const cropPct = Math.round((1 - 1 / cover) * 100);

  return (
    <div className="bb-reframe">
      <span className="bb-reframe-name" title={photo?.label}>
        {photo?.label ?? "photo"}
      </span>

      <label className="bb-reframe-zoom">
        <ZoomIn size={15} />
        <input
          type="range"
          min={1}
          max={max}
          step={0.01}
          value={zoom}
          // The track physically ends at `max`, so there is nothing to
          // validate: the control cannot express a blurry page.
          onChange={(e) => onFrame({ zoom: Number(e.target.value) })}
          aria-label="Zoom"
        />
        <b>{zoom.toFixed(1)}×</b>
      </label>

      {/* Straighten. Double-click the readout snaps back to level —
          the dial's own centre is hard to hit with a mouse and being
          one degree off is worse than being ten. */}
      <label className={"bb-reframe-tilt" + (tilt ? " on" : "")}>
        <TriangleRight size={15} />
        <input
          type="range"
          min={-TILT_MAX}
          max={TILT_MAX}
          step={0.5}
          value={tilt}
          onChange={(e) => straighten(Number(e.target.value))}
          aria-label="Straighten"
        />
        <b onDoubleClick={() => straighten(0)} title="Double-click to level">
          {tilt > 0 ? "+" : ""}
          {tilt.toFixed(1)}°
        </b>
      </label>

      <button className="bb-btn bb-btn-ghost bb-btn-sm" onClick={rotate}>
        <RotateCw size={15} /> Turn
      </button>
      <button className="bb-btn bb-btn-ghost bb-btn-sm" onClick={onSwap}>
        <Repeat size={15} /> Replace
      </button>
      <button className="bb-btn bb-btn-ghost bb-btn-sm bb-reframe-del" onClick={onRemove} title={removeLabel}>
        <Trash2 size={15} /> Remove
      </button>
      <button
        className="bb-btn bb-btn-ghost bb-btn-sm"
        onClick={() => onFrame({ ...DEFAULT_FRAMING })}
        disabled={isDefaultFraming(placement)}
      >
        <Undo2 size={15} /> Reset
      </button>

      {soft ? (
        <span className="bb-reframe-soft">
          This photo is small — it may look soft in print{dpi < DPI_MIN / 2 ? "" : " at this size"}.
        </span>
      ) : cropPct >= 10 ? (
        <span className="bb-reframe-note">Straightening crops about {cropPct}% off the edges.</span>
      ) : null}
    </div>
  );
}
