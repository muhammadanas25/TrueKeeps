/**
 * Filmstrip + "All pages" view + the reorder gesture they share.
 *
 * Reorder works the same with a mouse and a finger, but starts
 * differently on purpose:
 *  - mouse: drag starts after a few pixels of movement
 *  - touch: press and HOLD (260 ms), then drag. A quick swipe is left to
 *    the browser so the strip scrolls normally — the old editor's strip
 *    grabbed every touch, which is why you couldn't scroll past page 3
 *    on a phone.
 * While dragging near an edge the container auto-scrolls, so a page can
 * travel the whole book without letting go.
 *
 * Thumbnails are the real PageFace at thumbnail size, so they show the
 * book's actual typeface, edges and colours.
 */

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { LayoutGrid, Plus, Trash2 } from "lucide-react";
import { PageFace } from "../book";
import { toSpreads, type BookPage, type BookTheme, type BuilderPhoto, type Occasion } from "../data";
import { indexPhotos, pageHasLowQuality } from "../print";
import { PageLookContext, usePageLook } from "../looks";

interface DragState {
  from: number;
  x: number;
  y: number;
  over: number | null;
  side: "before" | "after";
}

export function useReorder(onMove: (from: number, to: number) => void, scrollRef: React.RefObject<HTMLElement>, axis: "x" | "y") {
  const [drag, setDrag] = useState<DragState | null>(null);
  const s = useRef<{
    idx: number;
    x0: number;
    y0: number;
    active: boolean;
    pt: string;
    over: number | null;
    side: "before" | "after";
    wasDrag: boolean;
    timer?: ReturnType<typeof setTimeout>;
    auto?: ReturnType<typeof setInterval>;
  }>({ idx: 0, x0: 0, y0: 0, active: false, pt: "mouse", over: null, side: "before", wasDrag: false });
  const cb = useRef(onMove);
  cb.current = onMove;

  const tm = (e: TouchEvent) => {
    if (s.current.active) e.preventDefault(); // stop the strip scrolling under a lifted page
  };
  const cleanup = () => {
    clearTimeout(s.current.timer);
    clearInterval(s.current.auto);
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", cancel);
    window.removeEventListener("touchmove", tm);
  };
  const move = (e: PointerEvent) => {
    const r = s.current;
    const d = Math.hypot(e.clientX - r.x0, e.clientY - r.y0);
    if (!r.active) {
      if (d < 6) return;
      if (r.pt === "mouse") r.active = true;
      else {
        cleanup(); // touch moved before the hold → it's a scroll
        return;
      }
    }
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const t = el?.closest<HTMLElement>("[data-ridx]");
    if (t) {
      const b = t.getBoundingClientRect();
      r.over = Number(t.dataset.ridx);
      r.side = (axis === "y" ? e.clientY > b.top + b.height / 2 : e.clientX > b.left + b.width / 2) ? "after" : "before";
    } else r.over = null;
    clearInterval(r.auto);
    const sc = scrollRef.current;
    if (sc) {
      const b = sc.getBoundingClientRect();
      const v =
        axis === "y"
          ? e.clientY < b.top + 48 ? -10 : e.clientY > b.bottom - 48 ? 10 : 0
          : e.clientX < b.left + 48 ? -12 : e.clientX > b.right - 48 ? 12 : 0;
      if (v) r.auto = setInterval(() => (axis === "y" ? (sc.scrollTop += v) : (sc.scrollLeft += v)), 16);
    }
    setDrag({ from: r.idx, x: e.clientX, y: e.clientY, over: r.over, side: r.side });
  };
  const up = () => {
    const r = s.current;
    cleanup();
    r.wasDrag = r.active;
    if (r.active && r.over != null) {
      let to = r.over + (r.side === "after" ? 1 : 0);
      if (to < 1) to = 1;
      if (to !== r.idx && to !== r.idx + 1) cb.current(r.idx, to);
    }
    r.active = false;
    setDrag(null);
    setTimeout(() => (r.wasDrag = false), 50);
  };
  const cancel = () => {
    cleanup();
    s.current.active = false;
    setDrag(null);
  };
  useEffect(() => cleanup, []); // eslint-disable-line react-hooks/exhaustive-deps

  const down = (e: React.PointerEvent, idx: number) => {
    if (idx === 0 || e.button > 0) return; // the title page stays first
    const r = s.current;
    Object.assign(r, { idx, x0: e.clientX, y0: e.clientY, active: false, pt: e.pointerType, over: null, side: "before", wasDrag: false });
    if (e.pointerType !== "mouse") {
      r.timer = setTimeout(() => {
        r.active = true;
        setDrag({ from: idx, x: r.x0, y: r.y0, over: null, side: "before" });
        navigator.vibrate?.(8);
      }, 260);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("touchmove", tm, { passive: false });
  };
  return { drag, down, wasDrag: () => s.current.wasDrag };
}

export interface ThumbCtx {
  photos: BuilderPhoto[];
  theme: BookTheme;
  title: string;
  occasion: Occasion;
}

function PageThumb({ page, size, ctx }: { page: BookPage; size: number; ctx: ThumbCtx }) {
  // Thumbnails show the look but must never be editable: drop the
  // editor's inline-edit callbacks for this subtree.
  const { fontId, edge, subtitle, captionsHidden } = usePageLook();
  return (
    <PageLookContext.Provider value={{ fontId, edge, subtitle, captionsHidden }}>
      <div className="tke-th-pg" style={{ width: size, height: size, "--pw": size + "px" } as CSSProperties} aria-hidden="true">
        <PageFace page={page} photos={ctx.photos} theme={ctx.theme} title={ctx.title} occasion={ctx.occasion} />
      </div>
    </PageLookContext.Provider>
  );
}

function Thumb({
  page,
  idx,
  size,
  ctx,
  active,
  R,
  onJump,
  onDelete,
  soft,
}: {
  page: BookPage | null;
  idx: number;
  size: number;
  ctx: ThumbCtx;
  active: boolean;
  R: ReturnType<typeof useReorder>;
  onJump: (idx: number) => void;
  onDelete?: (idx: number) => void;
  soft: boolean;
}) {
  if (!page)
    return (
      <div className="tke-th tke-th-empty" style={{ width: size }}>
        <div style={{ width: size, height: size }} />
        <span />
      </div>
    );
  const d = R.drag;
  const cls =
    "tke-th" +
    (active ? " on" : "") +
    (d && d.from === idx ? " is-lifted" : "") +
    (d && d.over === idx ? " drop-" + d.side : "") +
    (idx === 0 ? " fixed" : "");
  return (
    <div
      className={cls}
      data-ridx={idx}
      style={{ width: size }}
      onPointerDown={(e) => R.down(e, idx)}
      onClick={() => !R.wasDrag() && onJump(idx)}
      onContextMenu={(e) => e.preventDefault()}
    >
      <PageThumb page={page} size={size} ctx={ctx} />
      <span>
        {idx === 0 ? "Title" : "p." + idx}
        {soft ? <i className="tke-warn" title="A photo here may print soft" /> : null}
      </span>
      {onDelete && idx !== 0 ? (
        <button
          className="tke-th-del"
          aria-label={"Delete page " + idx}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onDelete(idx);
          }}
        >
          <Trash2 size={13} />
        </button>
      ) : null}
    </div>
  );
}

function DragGhost({ drag, pages, ctx }: { drag: DragState | null; pages: BookPage[]; ctx: ThumbCtx }) {
  if (!drag) return null;
  return (
    <div className="tke-dragghost" style={{ left: drag.x, top: drag.y }}>
      <PageThumb page={pages[drag.from]} size={56} ctx={ctx} />
    </div>
  );
}

export function Filmstrip({
  pages,
  ctx,
  activeIdx,
  isMobile,
  onJump,
  onMove,
  onAdd,
  onArrange,
}: {
  pages: BookPage[];
  ctx: ThumbCtx;
  activeIdx: number;
  isMobile: boolean;
  onJump: (idx: number) => void;
  onMove: (from: number, to: number) => void;
  onAdd: () => void;
  onArrange: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const R = useReorder(onMove, ref, "x");
  const size = isMobile ? 46 : 60;
  const spreads = toSpreads(pages);
  const spreadIdx = Math.floor(activeIdx / 2);
  const index = indexPhotos(ctx.photos);

  // keep the current spread in view
  useEffect(() => {
    const sc = ref.current;
    const el = sc?.querySelector<HTMLElement>(`[data-spread="${spreadIdx}"]`);
    if (!sc || !el) return;
    sc.scrollTo({ left: el.offsetLeft - sc.clientWidth / 2 + el.offsetWidth / 2, behavior: "smooth" });
  }, [spreadIdx]);

  return (
    <div className="tke-strip">
      <div
        className="tke-strip-scroll"
        ref={ref}
        onWheel={(e) => {
          if (ref.current && Math.abs(e.deltaY) > Math.abs(e.deltaX)) ref.current.scrollLeft += e.deltaY;
        }}
      >
        {spreads.map((sp, k) => (
          <div key={k} data-spread={k} className={"tke-fs-spread" + (k === spreadIdx ? " on" : "")}>
            {[sp.left, sp.right].map((pg, j) => {
              const idx = 2 * k + j;
              return (
                <Thumb
                  key={j}
                  page={pg}
                  idx={idx}
                  size={size}
                  ctx={ctx}
                  active={isMobile && idx === activeIdx}
                  R={R}
                  onJump={onJump}
                  soft={Boolean(pg && pageHasLowQuality(pg, index))}
                />
              );
            })}
          </div>
        ))}
        <button className="tke-fs-add" style={{ height: size }} onClick={onAdd} aria-label="Add a page">
          <Plus size={18} />
        </button>
      </div>
      {!isMobile ? (
        <button className="tke-strip-all" onClick={onArrange}>
          <LayoutGrid size={16} /> All pages
        </button>
      ) : null}
      <DragGhost drag={R.drag} pages={pages} ctx={ctx} />
    </div>
  );
}

export function Arrange({
  pages,
  ctx,
  activeIdx,
  isMobile,
  onMove,
  onDelete,
  onAdd,
  onJump,
  onClose,
}: {
  pages: BookPage[];
  ctx: ThumbCtx;
  activeIdx: number;
  isMobile: boolean;
  onMove: (from: number, to: number) => void;
  onDelete: (idx: number) => void;
  onAdd: () => void;
  onJump: (idx: number) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const R = useReorder(onMove, ref, "y");
  const size = isMobile ? 74 : 112;
  const spreadIdx = Math.floor(activeIdx / 2);
  const index = indexPhotos(ctx.photos);
  return (
    <div className="tke-arrange" role="dialog" aria-label="All pages">
      <header>
        <div>
          <h2>All pages</h2>
          <p>
            {pages.length} pages · {isMobile ? "press and hold a page, then drag it" : "drag a page to move it"}
          </p>
        </div>
        <button className="tke-btn" onClick={onClose}>
          Done
        </button>
      </header>
      <div className="tke-arrange-grid" ref={ref} style={{ "--th": size + "px" } as CSSProperties}>
        {toSpreads(pages).map((sp, k) => (
          <div key={k} className={"tke-ar-spread" + (k === spreadIdx ? " on" : "")}>
            <div className="tke-ar-pair">
              {[sp.left, sp.right].map((pg, j) => (
                <Thumb
                  key={j}
                  page={pg}
                  idx={2 * k + j}
                  size={size}
                  ctx={ctx}
                  active={false}
                  R={R}
                  onJump={(i) => {
                    onJump(i);
                    onClose();
                  }}
                  onDelete={onDelete}
                  soft={Boolean(pg && pageHasLowQuality(pg, index))}
                />
              ))}
            </div>
          </div>
        ))}
        <button className="tke-ar-add" style={{ height: size }} onClick={onAdd}>
          <Plus size={18} /> Add page
        </button>
      </div>
      <DragGhost drag={R.drag} pages={pages} ctx={ctx} />
    </div>
  );
}
