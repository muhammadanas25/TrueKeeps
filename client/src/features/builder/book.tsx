/**
 * Book builder — book rendering: photo tiles, page layouts, covers,
 * the closed mini book, and the 3-D flip book.
 *
 * Ported from the design-system prototype (`book_builder/book.jsx`) and
 * typed, with one product adaptation: `Ph` renders the REAL uploaded
 * photo (`photo.url`, a data URL) when present and falls back to the
 * brand-striped labelled placeholder otherwise — so the same page
 * components serve both the prototype look and real user books.
 *
 * The 3-D flip book (Book3D) works on one invariant:
 *   pos = 0 → closed (cover visible on the right)
 *   pos = k → spread k−1 open
 * A turn renders a single animating "sheet" (front/back faces) between
 * two static page stacks, commits `pos` on transition end, and has
 * timer fallbacks so a missed transitionend can never wedge the book.
 */

import { useEffect, useRef, useState, type CSSProperties, type MutableRefObject } from "react";
import { Repeat } from "lucide-react";
import { themeById, type BookPage, type BookTheme, type BuilderPhoto, type CoverStyleId, type Occasion, type Spread } from "./data";

/* ── Photo tile ─────────────────────────────────────────────── */

/** tiny hex lighten/darken for stripe tint variation */
export function shiftColor(hex: string, amt: number): string {
  if (!amt) return hex;
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + amt * 255)));
  const r = f(n >> 16);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return "#" + ((r << 16) | (g << 8) | b).toString(16).padStart(6, "0");
}

/**
 * Ph — a photo slot. Real image when `photo.url` exists; otherwise the
 * design-system striped placeholder with the photo's label chip.
 */
export function Ph({
  photo,
  theme,
  className = "",
  showLabel = true,
}: {
  photo: BuilderPhoto | undefined | null;
  theme?: BookTheme;
  className?: string;
  showLabel?: boolean;
}) {
  if (!photo) return null;
  const t = theme ?? themeById("ivory");
  if (photo.url) {
    return (
      <div className={"bb-ph has-img " + className}>
        <img src={photo.url} alt={photo.label} draggable={false} />
      </div>
    );
  }
  const mix = [0, 0.06, -0.05][photo.shade ?? 0];
  const a = shiftColor(t.stripeA, mix);
  const b = shiftColor(t.stripeB, mix);
  const dark = t.id === "cobalt";
  return (
    <div className={"bb-ph " + (dark ? "dark " : "") + className} style={{ "--ph-a": a, "--ph-b": b } as CSSProperties}>
      {showLabel ? <small>{photo.label}</small> : null}
    </div>
  );
}

/* ── Inner page ─────────────────────────────────────────────── */

export function PageFace({
  page,
  photos,
  theme,
  title,
  occasion,
  onSlotClick,
}: {
  page: BookPage | null | undefined;
  photos: BuilderPhoto[];
  theme: BookTheme;
  title: string;
  occasion: Occasion;
  /** when provided, photo slots become "swap photo" hit targets */
  onSlotClick?: (slotIdx: number) => void;
}) {
  if (!page) return <div className="bb-page" style={{ background: theme.page }}></div>;
  const ph = (i: number) => photos.find((p) => p.id === page.photoIds[i]);

  // A slot is either a plain tile, or (in customize mode) a tile with a
  // full-cover "Swap photo" button layered on top.
  const slot = (i: number, cls?: string) => {
    const photo = ph(i);
    if (!photo) return null;
    if (!onSlotClick) return <Ph key={i} photo={photo} theme={theme} className={cls || ""} />;
    return (
      <div
        key={i}
        className={"bb-slot-wrap " + (cls || "")}
        style={{ position: cls ? "absolute" : "relative", flex: cls ? undefined : 1, minHeight: 0, display: "flex" }}
      >
        <Ph photo={photo} theme={theme} />
        <button
          className="bb-slot-hit"
          onClick={(e) => {
            e.stopPropagation();
            onSlotClick(i);
          }}
          aria-label={"Swap photo: " + photo.label}
        >
          <span className="bb-swap-tag">
            <Repeat size={12} /> Swap photo
          </span>
        </button>
      </div>
    );
  };

  const base: CSSProperties = { background: theme.page, color: theme.ink };
  if (page.layout === "title") {
    return (
      <div className="bb-page bb-page-title" style={base}>
        <div className="t">{title}</div>
        <div className="rule" style={{ background: theme.accent }}></div>
        <div className="s">{occasion.subtitle}</div>
      </div>
    );
  }
  if (page.layout === "full") {
    return (
      <div className="bb-page bb-page-full" style={base}>
        {onSlotClick ? slot(0) : <Ph photo={ph(0)} theme={theme} />}
        {page.caption ? (
          <div className="bb-page-caption" style={{ color: theme.ink }}>
            <span style={{ "--scrim": theme.scrim } as CSSProperties}>{page.caption}</span>
          </div>
        ) : null}
      </div>
    );
  }
  if (page.layout === "duo") {
    return (
      <div className="bb-page bb-page-duo" style={base}>
        {slot(0)}
        {slot(1)}
        {page.caption ? <div className="bb-page-caption">{page.caption}</div> : null}
      </div>
    );
  }
  if (page.layout === "collage") {
    return (
      <div className="bb-page bb-page-collage" style={base}>
        {slot(0, "c0")}
        {slot(1, "c1")}
        {slot(2, "c2")}
      </div>
    );
  }
  // single (framed)
  return (
    <div className="bb-page bb-page-single" style={base}>
      {slot(0)}
      {page.caption ? <div className="bb-page-caption">{page.caption}</div> : null}
    </div>
  );
}

/* ── Front cover ────────────────────────────────────────────── */

export function CoverFace({
  theme,
  coverStyle,
  title,
  occasion,
  photos,
  editable,
  onTitle,
}: {
  theme: BookTheme;
  coverStyle: CoverStyleId;
  title: string;
  occasion: Occasion;
  photos: BuilderPhoto[];
  /** contentEditable title, committed on blur (Enter blurs) */
  editable?: boolean;
  onTitle?: (title: string) => void;
}) {
  const photo: BuilderPhoto = photos[0]
    ? { ...photos[0], label: photos[0].url ? photos[0].label : "your cover photo" }
    : { id: "c", label: "your cover photo", shade: 0 };
  const titleEl = editable ? (
    <div
      className="bb-cover-title"
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      onBlur={(e) => onTitle && onTitle((e.target as HTMLElement).textContent?.trim().slice(0, 48) || title)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLElement).blur();
        }
      }}
    >
      {title}
    </div>
  ) : (
    <div className="bb-cover-title">{title}</div>
  );
  const sub = <div className="bb-cover-sub">{occasion.subtitle}</div>;
  const base: CSSProperties = { background: theme.page, color: theme.ink };

  if (coverStyle === "minimal") {
    return (
      <div className="bb-cover bb-cover-minimal" style={base}>
        <div>
          {titleEl}
          {sub}
          <div className="rule" style={{ background: theme.accent }}></div>
        </div>
      </div>
    );
  }
  if (coverStyle === "framed") {
    return (
      <div className="bb-cover bb-cover-framed" style={base}>
        <Ph photo={photo} theme={theme} />
        <div className="bb-cover-text">
          {titleEl}
          {sub}
        </div>
      </div>
    );
  }
  if (coverStyle === "split") {
    return (
      <div className="bb-cover bb-cover-split" style={base}>
        <Ph photo={photo} theme={theme} />
        <div className="bb-cover-text">
          {titleEl}
          {sub}
        </div>
      </div>
    );
  }
  // full-bleed photo + scrim text panel
  return (
    <div className="bb-cover bb-cover-full" style={{ color: theme.ink }}>
      <Ph photo={photo} theme={theme} />
      <div className="bb-cover-text" style={{ background: theme.scrim }}>
        {titleEl}
        {sub}
      </div>
    </div>
  );
}

/* ── Mini closed book (reveal cards + order summary) ────────── */

export function MiniBook({
  theme,
  coverStyle,
  title,
  occasion,
  photos,
  size,
}: {
  theme: BookTheme;
  coverStyle: CoverStyleId;
  title: string;
  occasion: Occasion;
  photos: BuilderPhoto[];
  size?: number;
}) {
  return (
    <div
      className="bb-mini-book"
      style={(size ? { "--mini": size + "px", "--pw": size + "px" } : { "--pw": "168px" }) as unknown as CSSProperties}
    >
      <div className="bb-mini-inner">
        <div className="bb-mini-spine" style={{ background: theme.id === "cobalt" ? "#16398a" : "rgba(0,0,0,0.18)" }}></div>
        <div className="bb-mini-pages"></div>
        <div className="bb-mini-cover">
          <CoverFace theme={theme} coverStyle={coverStyle} title={title} occasion={occasion} photos={photos} />
        </div>
      </div>
    </div>
  );
}

/* ── The 3-D flip book ──────────────────────────────────────── */

export interface Book3DApi {
  next: () => void;
  prev: () => void;
}

interface FlipAnim {
  /** which sheet index is turning */
  sheet: number;
  dir: "fwd" | "back";
  /** false while mounted at rest pose; true once the turn is kicked */
  go: boolean;
}

export function Book3D({
  spreads,
  pos,
  onPos,
  theme,
  coverStyle,
  title,
  occasion,
  photos,
  editableTitle,
  onTitle,
  apiRef,
}: {
  spreads: Spread[];
  pos: number;
  onPos: (pos: number) => void;
  theme: BookTheme;
  coverStyle: CoverStyleId;
  title: string;
  occasion: Occasion;
  photos: BuilderPhoto[];
  editableTitle?: boolean;
  onTitle?: (title: string) => void;
  /** exposes next()/prev() to parent arrow buttons */
  apiRef?: MutableRefObject<Book3DApi | null>;
}) {
  const [anim, setAnim] = useState<FlipAnim | null>(null);
  const animRef = useRef<FlipAnim | null>(null);
  const n = spreads.length;

  // content helpers — what's on each face at a given position
  const rightContent = (p: number) => {
    if (p === 0)
      return (
        <CoverFace theme={theme} coverStyle={coverStyle} title={title} occasion={occasion} photos={photos} editable={!!editableTitle && !anim} onTitle={onTitle} />
      );
    const s = spreads[p - 1];
    return <PageFace page={s && s.right} photos={photos} theme={theme} title={title} occasion={occasion} />;
  };
  const leftContent = (p: number) => {
    if (p === 0) return null;
    const s = spreads[p - 1];
    return <PageFace page={s && s.left} photos={photos} theme={theme} title={title} occasion={occasion} />;
  };

  const finish = () => {
    if (!animRef.current) return;
    const target = animRef.current.dir === "fwd" ? pos + 1 : pos - 1;
    animRef.current = null;
    setAnim(null);
    onPos(target);
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;

  const start = (a: FlipAnim) => {
    animRef.current = a;
    setAnim(a);
    // kick the transition on a timer (not rAF — rAF may never fire in headless captures)
    setTimeout(() => {
      if (animRef.current === a) setAnim({ ...a, go: true });
    }, 20);
    // safety: if transitionend never fires, commit anyway
    setTimeout(() => {
      if (animRef.current && animRef.current.sheet === a.sheet) finishRef.current();
    }, 850);
  };
  const next = () => {
    if (animRef.current || pos >= n) return;
    start({ sheet: pos, dir: "fwd", go: false });
  };
  const prev = () => {
    if (animRef.current || pos <= 0) return;
    start({ sheet: pos - 1, dir: "back", go: false });
  };

  // expose next/prev for parent arrow buttons (kept fresh every render)
  useEffect(() => {
    if (apiRef) apiRef.current = { next, prev };
  });

  // swipe / drag to turn
  const downX = useRef<number | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    downX.current = e.clientX;
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (downX.current == null) return;
    const dx = e.clientX - downX.current;
    downX.current = null;
    if (dx < -40) next();
    else if (dx > 40) prev();
  };

  // visible static faces during animation
  const statLeftPos = anim ? (anim.dir === "fwd" ? pos : pos - 1) : pos;
  const statRightPos = anim ? (anim.dir === "fwd" ? pos + 1 : pos) : pos;
  const closed = pos === 0 && !anim;
  const edgeW = (p: number, total: number) => Math.max(2, Math.round((8 * p) / Math.max(1, total)));

  return (
    <div className={"bb-book" + (closed ? " closed" : "")} onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
      <div className="bb-book-shadow"></div>
      {/* static left */}
      {statLeftPos > 0 ? (
        <div className="bb-static left" style={{ background: theme.page }}>
          {leftContent(statLeftPos)}
          <div className="bb-edges-l" style={{ "--edge": edgeW(statLeftPos, n + 1) + "px" } as CSSProperties}></div>
        </div>
      ) : null}
      {/* static right */}
      {statRightPos <= n ? (
        <div className="bb-static right" style={{ background: theme.page }}>
          {rightContent(statRightPos)}
          <div className="bb-edges-r" style={{ "--edge": edgeW(n + 1 - statRightPos, n + 1) + "px" } as CSSProperties}></div>
        </div>
      ) : null}
      {/* animating sheet */}
      {anim ? (
        <div
          className={"bb-sheet" + ((anim.dir === "fwd" && anim.go) || (anim.dir === "back" && !anim.go) ? " flipped" : "")}
          onTransitionEnd={finish}
        >
          <div className="bb-face front" style={{ background: theme.page }}>
            {rightContent(anim.sheet)}
          </div>
          <div className="bb-face back" style={{ background: theme.page }}>
            {leftContent(anim.sheet + 1)}
          </div>
        </div>
      ) : null}
      {/* click hotspots — when the cover title is editable, shrink the front hotspot so the title stays clickable */}
      {pos > 0 ? <div className="bb-hotspot l" onClick={prev} aria-label="Previous page"></div> : null}
      <div
        className="bb-hotspot r"
        onClick={next}
        aria-label="Next page"
        style={{ ...(pos >= n ? { cursor: "default" } : null), ...(pos === 0 && editableTitle ? { width: "22%" } : null) }}
      ></div>
    </div>
  );
}
