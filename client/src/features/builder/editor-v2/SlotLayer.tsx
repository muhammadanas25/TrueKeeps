/**
 * SlotLayer — the touch/mouse layer over one photo in the v2 editor.
 *
 * Gesture map (phone first, mouse equivalent in brackets):
 *
 *   tap                    select the photo (bar of actions appears)
 *   tap a selected photo   start adjusting it              [click again]
 *   two-finger pinch       zoom — starts adjusting on its own, no
 *                          button needed                   [wheel, slider]
 *   two fingers moving     reposition while pinching
 *   one-finger drag        reposition, ONLY while adjusting [drag]
 *   one-finger swipe       not handled here → bubbles to the stage,
 *                          which turns the page
 *
 * Why one-finger drag only pans while adjusting: on a phone the same
 * gesture is "next page". Making the photo grab it by default is what
 * made the old editor feel stuck between pages. Two fingers are never
 * ambiguous, so a pinch works straight away on any photo.
 *
 * Every number emitted is clamped exactly like the classic editor:
 * focal point via panFrame() into [0,1], zoom into [1, slotMaxZoom] (the
 * print-quality ceiling, already shortened for any straightening). So no
 * gesture can produce a stretched, gapped or blurry print.
 *
 * Pointers are tracked on window once a gesture starts, so the second
 * finger of a pinch is caught even if it lands outside this photo.
 */

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { BuilderPhoto, PageLayoutId, Placement } from "../data";
import { panFrame, panOverflow } from "../reframe";
import { clampTilt, slotMaxZoom, tiltCover } from "../print";

export const PHOTO_MIME = "application/x-tk-photo";
const TAP_SLOP = 8;

export interface SlotLayerProps {
  photo: BuilderPhoto;
  placement: Placement;
  layout: PageLayoutId;
  slotIdx: number;
  aspect: number;
  selected: boolean;
  cropping: boolean;
  /** show the cut-off part of the photo faintly while adjusting */
  ghost: boolean;
  onTap: () => void;
  /** a pinch started on a photo that wasn't being adjusted yet */
  onEnterCrop: () => void;
  /** called once at the start of a pan/zoom so it can be undone as one step */
  onGestureStart: () => void;
  onFrame: (patch: Partial<Placement>) => void;
  /** desktop: a photo dragged in from the Photos panel */
  onDropPhoto?: (photoId: string) => void;
}

type Pt = { x: number; y: number };

export function SlotLayer(p: SlotLayerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [dropOver, setDropOver] = useState(false);
  // latest props for window listeners, which outlive a render
  const live = useRef(p);
  live.current = p;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !p.cropping) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [p.cropping]);

  /* ── gesture state machine ─────────────────────────────────── */
  const g = useRef<{
    pts: Map<number, Pt>;
    mode: "tap" | "pan" | "pinch";
    start: Pt;
    moved: boolean;
    began: boolean;
    from: Placement;
    dist0: number;
    mid0: Pt;
    rect: { w: number; h: number };
  } | null>(null);

  const maxZoomFor = (pl: Placement) =>
    slotMaxZoom(live.current.photo, live.current.layout, live.current.slotIdx, pl.turn, undefined, clampTilt(pl.tilt));

  const twoPts = (pts: Map<number, Pt>) => {
    const [a, b] = Array.from(pts.values());
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  };

  const begin = () => {
    const s = g.current!;
    if (!s.began) {
      s.began = true;
      live.current.onGestureStart();
    }
  };

  const startPinch = () => {
    const s = g.current!;
    if (!live.current.cropping) live.current.onEnterCrop();
    begin();
    const { dist, mid } = twoPts(s.pts);
    Object.assign(s, { mode: "pinch", dist0: Math.max(10, dist), mid0: mid, from: { ...live.current.placement }, moved: true });
  };

  const restartPan = () => {
    const s = g.current!;
    const [only] = Array.from(s.pts.values());
    Object.assign(s, { mode: "pan", start: only, from: { ...live.current.placement } });
  };

  const onWinDown = (e: PointerEvent) => {
    const s = g.current;
    if (!s) return;
    s.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (s.pts.size === 2) startPinch();
  };

  const onWinMove = (e: PointerEvent) => {
    const s = g.current;
    if (!s || !s.pts.has(e.pointerId)) return;
    s.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const L = live.current;
    const pl = s.from;
    const tilt = clampTilt(pl.tilt);
    const cover = tiltCover(tilt, L.aspect);

    if (s.mode === "pinch" && s.pts.size >= 2) {
      const { dist, mid } = twoPts(s.pts);
      const zoom = Math.min(maxZoomFor(pl), Math.max(1, pl.zoom * (dist / s.dist0)));
      const overflow = panOverflow(s.rect, L.photo, pl.turn, zoom);
      const f = panFrame(pl, mid.x - s.mid0.x, mid.y - s.mid0.y, pl.turn, overflow, tilt, cover);
      L.onFrame({ zoom, fx: f.fx, fy: f.fy });
      return;
    }
    const dx = e.clientX - s.start.x;
    const dy = e.clientY - s.start.y;
    if (!s.moved && Math.hypot(dx, dy) < TAP_SLOP) return;
    s.moved = true;
    if (!L.cropping) return; // a swipe — the stage handles it
    if (s.mode === "tap") {
      s.mode = "pan";
      begin();
    }
    const overflow = panOverflow(s.rect, L.photo, pl.turn, pl.zoom);
    L.onFrame(panFrame(pl, dx, dy, pl.turn, overflow, tilt, cover));
  };

  const onWinUp = (e: PointerEvent) => {
    const s = g.current;
    if (!s) return;
    s.pts.delete(e.pointerId);
    if (s.pts.size === 1 && s.mode === "pinch") {
      restartPan(); // lift one finger mid-pinch → keep dragging with the other
      return;
    }
    if (s.pts.size > 0) return;
    const wasTap = s.mode === "tap" && !s.moved;
    cleanup();
    if (wasTap && e.type === "pointerup") live.current.onTap();
  };

  const cleanup = () => {
    g.current = null;
    window.removeEventListener("pointerdown", onWinDown, true);
    window.removeEventListener("pointermove", onWinMove);
    window.removeEventListener("pointerup", onWinUp);
    window.removeEventListener("pointercancel", onWinUp);
  };
  useEffect(() => cleanup, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button > 0) return;
    if (g.current) {
      // second finger landed on this same photo
      g.current.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (g.current.pts.size === 2) startPinch();
      e.stopPropagation();
      return;
    }
    const r = ref.current!.getBoundingClientRect();
    g.current = {
      pts: new Map([[e.pointerId, { x: e.clientX, y: e.clientY }]]),
      mode: "tap",
      start: { x: e.clientX, y: e.clientY },
      moved: false,
      began: false,
      from: { ...p.placement },
      dist0: 1,
      mid0: { x: 0, y: 0 },
      // the slot's size on screen; a collage tile's tilt is tiny, so the
      // bounding box is a good stand-in for its own box
      rect: { w: r.width, h: r.height },
    };
    // While adjusting, this photo owns the gesture — no page swipe.
    if (p.cropping) {
      e.stopPropagation();
      e.preventDefault();
    }
    window.addEventListener("pointerdown", onWinDown, true);
    window.addEventListener("pointermove", onWinMove);
    window.addEventListener("pointerup", onWinUp);
    window.addEventListener("pointercancel", onWinUp);
  };

  // A burst of wheel ticks is one undo step: snapshot on the first tick,
  // then stay quiet until the wheel has been still for 400 ms.
  const wheelIdle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onWheel = (e: React.WheelEvent) => {
    if (!p.cropping) return;
    e.stopPropagation();
    if (!wheelIdle.current) p.onGestureStart();
    else clearTimeout(wheelIdle.current);
    wheelIdle.current = setTimeout(() => (wheelIdle.current = null), 400);
    const zoom = Math.min(maxZoomFor(p.placement), Math.max(1, p.placement.zoom * (1 - e.deltaY * 0.0015)));
    p.onFrame({ zoom });
  };

  const drop = p.onDropPhoto
    ? {
        onDragOver: (e: React.DragEvent) => {
          if (!e.dataTransfer.types.includes(PHOTO_MIME)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          setDropOver(true);
        },
        onDragLeave: () => setDropOver(false),
        onDrop: (e: React.DragEvent) => {
          e.preventDefault();
          setDropOver(false);
          const id = e.dataTransfer.getData(PHOTO_MIME);
          if (id) p.onDropPhoto!(id);
        },
      }
    : {};

  return (
    <div
      ref={ref}
      className={
        "tke-slot" + (p.selected ? " is-sel" : "") + (p.cropping ? " is-crop" : "") + (dropOver ? " is-drop" : "")
      }
      onPointerDown={onPointerDown}
      onWheel={onWheel}
      onClick={(e) => e.stopPropagation()}
      role="button"
      tabIndex={0}
      aria-label={(p.cropping ? "Adjusting " : "Photo: ") + p.photo.label}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          p.onTap();
        }
      }}
      {...drop}
    >
      {p.cropping && p.ghost ? <Ghost photo={p.photo} placement={p.placement} size={size} aspect={p.aspect} /> : null}
      {p.cropping ? <div className="tke-thirds" /> : null}
    </div>
  );
}

/**
 * The cropped-off part of the photo, drawn faintly around the slot while
 * adjusting, so people can see what they're cutting away. Same geometry
 * as `Ph` (cover-fit, focal-point offset, zoom about the focal point,
 * straighten about the centre). Skipped for quarter-turned photos and
 * photos of unknown size, where it would need the full turn maths for
 * little benefit.
 */
function Ghost({ photo, placement, size, aspect }: { photo: BuilderPhoto; placement: Placement; size: { w: number; h: number }; aspect: number }) {
  if (!photo.url || !photo.w || !photo.h || placement.turn !== 0 || !size.w || !size.h) return null;
  const cover = Math.max(size.w / photo.w, size.h / photo.h);
  const Iw = photo.w * cover * Math.max(1, placement.zoom);
  const Ih = photo.h * cover * Math.max(1, placement.zoom);
  const img: CSSProperties = {
    position: "absolute",
    left: (size.w - Iw) * placement.fx,
    top: (size.h - Ih) * placement.fy,
    width: Iw,
    height: Ih,
    maxWidth: "none",
  };
  const deg = clampTilt(placement.tilt);
  return (
    <div
      className="tke-ghost"
      style={deg ? { transform: `rotate(${deg}deg) scale(${tiltCover(deg, aspect)})` } : undefined}
      aria-hidden="true"
    >
      <img src={photo.url} alt="" draggable={false} style={img} />
    </div>
  );
}
