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

import { memo, useEffect, useRef, useState, type CSSProperties, type MutableRefObject, type ReactNode } from "react";
import { GripVertical, ImageOff } from "lucide-react";
import {
  DEFAULT_FRAMING,
  LAYOUT_SLOTS,
  placement,
  themeById,
  type BookPage,
  type BookTheme,
  type BuilderPhoto,
  type CoverStyleId,
  type Occasion,
  type PageLayoutId,
  type Placement,
  type Spread,
} from "./data";
import { clampTilt, slotAspect, tiltCover } from "./print";
import { deriveTheme, mix } from "./palette";
import { lookClasses, usePageLook } from "./looks";
import { SlotHit } from "./reframe";

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
 * Geometry for the quarter-turn wrapper: a box centred on the slot,
 * sized so that rotating it lands exactly on the slot.
 *
 * For a slot w×h (aspect a = w/h) and a 90°/270° turn, the wrapper is
 * laid out h wide by w tall — i.e. (100/a)% × (100·a)% of the slot,
 * since percentage width resolves against w and percentage height
 * against h. Offsetting each axis by half the overflow centres it, and
 * a centred rotation then maps h×w back onto w×h with no gap and no
 * overdraw. 180° needs no resize, only the centred rotation.
 */
function turnBox(turn: Placement["turn"], aspect: number): CSSProperties {
  const rotate = { transform: `rotate(${turn}deg)`, transformOrigin: "50% 50%" };
  if (turn !== 90 && turn !== 270) return rotate;
  // A non-finite or zero aspect can only come from a bad call site;
  // falling back to square keeps the photo on screen instead of
  // collapsing it to nothing.
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const w = 100 / a;
  const h = 100 * a;
  return { ...rotate, left: `${(100 - w) / 2}%`, top: `${(100 - h) / 2}%`, width: `${w}%`, height: `${h}%` };
}

/**
 * Ph — a photo slot. Real image when `photo.url` exists; otherwise the
 * design-system striped placeholder with the photo's label chip.
 *
 * Framing (`fx`/`fy`/`zoom`/`turn`) is applied here and ONLY here, so
 * every surface that shows a photo — the 3-D book, the customize
 * spread, the mini book, the cover, the upload grid — reframes
 * identically and for free. The CSS is chosen so the photo can never
 * distort:
 *
 *   object-fit: cover        (in builder.css) never changes the aspect
 *                            ratio; it scales to fill and crops the
 *                            overflow
 *   object-position fx% fy%  aligns the image's (fx,fy) point with the
 *                            box's (fx,fy) point — which the CSS spec
 *                            guarantees keeps the box covered for any
 *                            fx,fy in [0,1]
 *   scale(zoom) about that   same origin, so the focal point stays
 *                            pinned under the zoom and coverage holds
 *                            for any zoom >= 1
 *
 * There is deliberately no `width`/`height` override and no non-uniform
 * scale anywhere in this path: stretching is not something we guard
 * against at runtime, it is something the render simply cannot express.
 *
 * A quarter turn cannot ride on the same transform, for two reasons.
 * Rotating about the focal origin translates the photo off the slot
 * (only a rotation about the CENTRE maps the box back onto itself), and
 * a 90° turn of a box fitted to a w×h slot occupies h×w, which does not
 * cover that slot unless it is w×h square. So a turn gets its own
 * wrapper element, pre-sized to the TRANSPOSED slot and rotated about
 * its centre: it lands back on the slot exactly, and the photo inside
 * was cover-fitted to the box it actually fills, so the turn costs no
 * resolution at all. `slotAspect` is how the wrapper learns the shape it
 * has to transpose — passed down rather than measured, because `Ph`
 * returns early on a missing photo and so cannot hold hooks.
 */
export function Ph({
  photo,
  theme,
  className = "",
  showLabel = true,
  placement,
  slotAspect = 1,
}: {
  photo: BuilderPhoto | undefined | null;
  theme?: BookTheme;
  className?: string;
  showLabel?: boolean;
  /** how this photo sits in its slot; omitted = centred and unzoomed */
  placement?: Placement | null;
  /** printed w/h of the slot this tile fills; only read when turned */
  slotAspect?: number;
}) {
  if (!photo) return null;
  // The striped tile is the fallback for BOTH "no image yet" and "the
  // image failed to load". Built here, once, so the loaded path can hand
  // it back on error without duplicating the markup.
  const stripes = <Stripes photo={photo} theme={theme} className={className} showLabel={showLabel} />;
  if (!photo.url) return stripes;
  return (
    <LoadedTile
      photo={photo}
      className={className}
      placement={placement}
      slotAspect={slotAspect}
      fallback={stripes}
    />
  );
}

/**
 * The real photo. Split out of `Ph` purely so it can hold the one piece
 * of state `Ph` cannot: whether the image 404'd. A dropped media file
 * used to render as an empty frame with no explanation, which reads as
 * a design choice rather than a fault — so a failure now falls back to
 * the same labelled placeholder an un-uploaded photo gets.
 */
function LoadedTile({
  photo,
  className,
  placement,
  slotAspect = 1,
  fallback,
}: {
  photo: BuilderPhoto;
  className: string;
  placement?: Placement | null;
  slotAspect?: number;
  fallback: JSX.Element;
}) {
  const [broken, setBroken] = useState(false);
  // A new src deserves a fresh attempt — otherwise replacing a missing
  // photo would keep showing the placeholder for the photo that worked.
  useEffect(() => setBroken(false), [photo.url]);
  if (broken) return fallback;
  const { fx, fy, zoom, turn, tilt } = { ...DEFAULT_FRAMING, ...(placement ?? {}) };
  // Guard against a corrupt/old draft rather than trusting the type:
  // a NaN here would blank the photo with no clue why.
  const px = Number.isFinite(fx) ? Math.min(1, Math.max(0, fx)) * 100 : 50;
  const py = Number.isFinite(fy) ? Math.min(1, Math.max(0, fy)) * 100 : 50;
  const z = Number.isFinite(zoom) ? Math.max(1, zoom) : 1;
  const img = (
    <img
      src={photo.url}
      alt={photo.label}
      draggable={false}
      onError={() => setBroken(true)}
      style={{
        objectPosition: `${px}% ${py}%`,
        ...(z !== 1 ? { transform: `scale(${z})`, transformOrigin: `${px}% ${py}%` } : null),
      }}
    />
  );
  const turned = turn ? <div className="bb-ph-turn" style={turnBox(turn, slotAspect)}>{img}</div> : img;
  /**
   * Straightening rides on its own wrapper, OUTSIDE the turn wrapper,
   * for the same reason the turn has one: only a rotation about the
   * centre maps a box back onto itself, and `scale(zoom)` is anchored
   * to the focal point, so the two cannot share a transform.
   *
   * The wrapper is inset to the slot exactly, then rotated and scaled
   * up by `tiltCover` about its centre. That scale is the whole safety
   * argument — it is the smallest factor that guarantees the rotated
   * wrapper still contains the slot, so no corner of page background
   * can appear no matter the angle. Everything inside it is unchanged:
   * the wrapper has the slot's own aspect ratio, so `turnBox` transposes
   * against the same number it always did, and the photo still meets
   * its box with plain `object-fit: cover`.
   */
  const deg = clampTilt(tilt);
  return (
    <div className={"bb-ph has-img " + className}>
      {deg ? (
        <div
          className="bb-ph-tilt"
          style={{ transform: `rotate(${deg}deg) scale(${tiltCover(deg, slotAspect)})` }}
        >
          {turned}
        </div>
      ) : (
        turned
      )}
    </div>
  );
}

/**
 * The brand-striped tile. It stands in for a photo whose image is not
 * there — either not uploaded yet, or uploaded and since lost. When the
 * tile is labelled (i.e. it is a real page, not a layout wireframe) it
 * now says which of the two it is, because a silent stripe reads as a
 * design flourish and users reasonably ask why "the default" keeps
 * coming back.
 */
function Stripes({
  photo,
  theme,
  className,
  showLabel,
}: {
  photo: BuilderPhoto;
  theme?: BookTheme;
  className: string;
  showLabel: boolean;
}) {
  const t = theme ?? themeById("ivory");
  const mix = [0, 0.06, -0.05][photo.shade ?? 0];
  const a = shiftColor(t.stripeA, mix);
  const b = shiftColor(t.stripeB, mix);
  // `t.dark`, not `t.id === "cobalt"` — with page colours on, any theme
  // can be sitting on a dark page, and the label has to invert with it.
  const dark = t.dark;
  return (
    <div className={"bb-ph " + (dark ? "dark " : "") + className} style={{ "--ph-a": a, "--ph-b": b } as CSSProperties}>
      {showLabel ? (
        <small>
          <ImageOff size={11} style={{ verticalAlign: "-1.5px", marginRight: 4 }} />
          {photo.label} — image missing
        </small>
      ) : null}
    </div>
  );
}

/* ── Inner page ─────────────────────────────────────────────── */

/**
 * Inline-editable text printed on a page (editor v2 only).
 *
 * Uncontrolled contentEditable: the DOM owns the text while focused and
 * we commit once, on blur (Enter blurs, Escape cancels). Writing the
 * value back on every keystroke would move the caret to the start.
 * Pointer events stop here so tapping text never selects the photo
 * underneath or starts a page swipe.
 */
function Editable({
  value,
  placeholder,
  onCommit,
  maxLength = 120,
}: {
  value: string;
  placeholder: string;
  onCommit: (v: string) => void;
  maxLength?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el && document.activeElement !== el) el.textContent = value;
  }, [value]);
  return (
    <span
      ref={ref}
      className="bb-editable"
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-label={placeholder}
      data-ph={placeholder}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === "Escape") {
          e.currentTarget.textContent = value;
          e.currentTarget.blur();
        }
      }}
      onBlur={(e) => {
        const v = (e.currentTarget.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
        if (v !== value) onCommit(v);
      }}
    />
  );
}

/**
 * Memoised, because a drag commits a new framing on every pointer move
 * and the customize screen re-renders the whole thumbnail rail each
 * time. Every prop here is either a primitive or a stable reference —
 * `photos` is the state array, `theme`/`occasion` are singletons from
 * their lookup tables, and a page object's identity changes only when
 * that page is edited — so the rail re-renders exactly the one thumb
 * that actually moved.
 */
function PageFaceImpl({
  page,
  photos,
  theme,
  title,
  occasion,
  onSlotClick,
  onSlotFrame,
  focusSlot,
  dnd,
  renderSlotOverlay,
}: {
  page: BookPage | null | undefined;
  photos: BuilderPhoto[];
  theme: BookTheme;
  title: string;
  occasion: Occasion;
  /** when provided, photo slots become draggable, tappable hit targets */
  onSlotClick?: (slotIdx: number) => void;
  /** live framing updates from a drag; required for panning to do anything */
  onSlotFrame?: (slotIdx: number, patch: Pick<Placement, "fx" | "fy">) => void;
  /** which slot currently owns the reframe bar */
  focusSlot?: number | null;
  /**
   * Drag-and-drop wiring, when this page is on the customize spread.
   *
   * Native HTML5 drag is used rather than the pointer-based scheme the
   * rest of the screen uses, and for one reason: the slot's pointer
   * events are already spoken for by panning, which is the gesture
   * people reach for a hundred times more often. Dragging a photo OUT of
   * a slot therefore starts from a small grab handle, and dropping onto
   * one is a separate event stream that cannot be confused with a pan.
   */
  dnd?: {
    /** encode what is being dragged, for the receiving slot to read */
    onDragStart: (slotIdx: number, e: React.DragEvent) => void;
    onDropOnSlot: (slotIdx: number, e: React.DragEvent) => void;
    /** true while something droppable is in flight, so slots can light up */
    active: boolean;
    /** the slot currently under the cursor, or null */
    over: number | null;
    onDragOverSlot: (slotIdx: number | null) => void;
  };
  /**
   * Editor v2: draw an interaction layer over each photo (selection,
   * crop gestures, drop target). Replaces the classic SlotHit drag-to-pan,
   * which the v2 editor deliberately does NOT want — there a one-finger
   * drag on a photo has to stay free for swiping to the next page.
   */
  renderSlotOverlay?: (slotIdx: number, photo: BuilderPhoto, placement: Placement, aspect: number) => ReactNode;
}) {
  // Hooks first: the early return below must not change the hook count.
  const look = usePageLook();
  if (!page) return <div className={"bb-page" + lookClasses(look)} style={{ background: theme.page }}></div>;
  // "This spread" colour scope: a page may carry its own paper colour.
  if (page.bg) theme = deriveTheme(theme, page.bg);
  const lc = lookClasses(look);
  const at = (i: number) => page.slots[i] ?? null;
  const ph = (i: number) => {
    const s = at(i);
    return s ? photos.find((p) => p.id === s.photoId) : undefined;
  };

  // A slot is either a plain tile, or (in customize mode) a tile with a
  // full-cover "Swap photo" button layered on top.
  // Printed shape of each slot, so a turned photo knows what box it has
  // to land back on. Comes from print.ts (which transcribes builder.css)
  // rather than from measuring the DOM, so it is identical in the 72px
  // rail thumbnail and on the press.
  const aspect = (i: number) => slotAspect(page.layout, i);

  const slot = (i: number, cls?: string) => {
    const photo = ph(i);
    if (!photo) return null;
    if (renderSlotOverlay)
      return (
        <div
          key={i}
          className={"bb-slot-wrap bb-slot-v2 " + (cls || "")}
          style={{ position: cls ? "absolute" : "relative", flex: cls ? undefined : 1, minHeight: 0, display: "flex" }}
        >
          <Ph photo={photo} theme={theme} placement={at(i)} slotAspect={aspect(i)} />
          {renderSlotOverlay(i, photo, at(i) ?? placement(photo.id), aspect(i))}
        </div>
      );
    if (!onSlotClick)
      return <Ph key={i} photo={photo} theme={theme} className={cls || ""} placement={at(i)} slotAspect={aspect(i)} />;
    return (
      <div
        key={i}
        className={
          "bb-slot-wrap " + (cls || "") + (dnd?.active ? " dnd" : "") + (dnd?.over === i ? " dnd-over" : "")
        }
        style={{ position: cls ? "absolute" : "relative", flex: cls ? undefined : 1, minHeight: 0, display: "flex" }}
        onDragOver={
          dnd
            ? (e) => {
                // preventDefault is what makes an element a drop target at
                // all; without it the browser refuses the drop silently.
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = "move";
                if (dnd.over !== i) dnd.onDragOverSlot(i);
              }
            : undefined
        }
        onDrop={
          dnd
            ? (e) => {
                e.preventDefault();
                e.stopPropagation();
                dnd.onDropOnSlot(i, e);
              }
            : undefined
        }
      >
        <Ph photo={photo} theme={theme} placement={at(i)} slotAspect={aspect(i)} />
        <SlotHit
          photo={photo}
          placement={at(i) ?? placement(photo.id)}
          focused={focusSlot === i}
          slotAspect={aspect(i)}
          onTap={() => onSlotClick(i)}
          onFrame={(patch) => onSlotFrame && onSlotFrame(i, patch)}
        />
        {/* The move handle. Small, corner-anchored and only visible on
            hover or focus, because the slot's main gesture is panning
            and a large permanent grip would invite the wrong one. */}
        {dnd ? (
          <span
            className="bb-slot-grab"
            draggable
            onDragStart={(e) => dnd.onDragStart(i, e)}
            onDragEnd={() => dnd.onDragOverSlot(null)}
            title="Drag to another slot"
            aria-hidden="true"
          >
            <GripVertical size={13} />
          </span>
        ) : null}
      </div>
    );
  };

  const base: CSSProperties = { background: theme.page, color: theme.ink };
  const editing = Boolean(look.onEditCaption);
  /**
   * The caption element. Hidden entirely when captions are switched off
   * (not merely emptied — an empty caption still takes height and would
   * change the slot size print.ts quotes). In the editor an empty
   * caption shows a placeholder so it can be typed into in place.
   */
  const caption = (wrapScrim = false) => {
    if (look.captionsHidden) return null;
    if (!page.caption && !editing) return null;
    const text = editing ? (
      <Editable value={page.caption} placeholder="Add a caption" onCommit={(v) => look.onEditCaption!(page.id, v)} />
    ) : (
      page.caption
    );
    return (
      <div className={"bb-page-caption" + (!page.caption ? " is-empty" : "")} style={wrapScrim ? { color: theme.ink } : undefined}>
        {wrapScrim ? <span style={{ "--scrim": theme.scrim } as CSSProperties}>{text}</span> : text}
      </div>
    );
  };
  if (page.layout === "title") {
    const sub = look.subtitle ?? occasion.subtitle;
    return (
      <div className={"bb-page bb-page-title" + lc} style={base}>
        <div className="t">
          {look.onEditTitle ? <Editable value={title} placeholder="Book title" maxLength={48} onCommit={(v) => v && look.onEditTitle!(v)} /> : title}
        </div>
        <div className="rule" style={{ background: theme.accent }}></div>
        <div className="s">
          {look.onEditSubtitle ? <Editable value={sub} placeholder="Add a date or a line" maxLength={60} onCommit={(v) => look.onEditSubtitle!(v)} /> : sub}
        </div>
      </div>
    );
  }
  if (page.layout === "full") {
    return (
      <div className={"bb-page bb-page-full" + lc} style={base}>
        {onSlotClick || renderSlotOverlay ? slot(0) : <Ph photo={ph(0)} theme={theme} placement={at(0)} slotAspect={aspect(0)} />}
        {caption(true)}
      </div>
    );
  }
  if (page.layout === "duo") {
    return (
      <div className={"bb-page bb-page-duo" + lc} style={base}>
        {slot(0)}
        {slot(1)}
        {caption()}
      </div>
    );
  }
  if (page.layout === "duo-side") {
    return (
      <div className={"bb-page bb-page-duo-side" + lc} style={base}>
        {slot(0)}
        {slot(1)}
        {caption()}
      </div>
    );
  }
  if (page.layout === "trio-strip") {
    return (
      <div className={"bb-page bb-page-trio-strip" + lc} style={base}>
        {slot(0)}
        {slot(1)}
        {slot(2)}
        {caption()}
      </div>
    );
  }
  if (page.layout === "collage") {
    // `mirror` only flips WHERE the tiles sit (a CSS class, see
    // .bb-mirror). Flipping the page with scaleX would reverse every
    // face and every sign in the photos themselves.
    return (
      <div className={"bb-page bb-page-collage" + (page.mirror ? " bb-mirror" : "") + lc} style={base}>
        {slot(0, "c0")}
        {slot(1, "c1")}
        {slot(2, "c2")}
      </div>
    );
  }
  // single (framed)
  return (
    <div className={"bb-page bb-page-single" + lc} style={base}>
      {slot(0)}
      {page.caption ? <div className="bb-page-caption">{page.caption}</div> : null}
    </div>
  );
}

export const PageFace = memo(PageFaceImpl);

/**
 * A tiny wireframe of one layout, for the picker.
 *
 * It is built from the REAL page classes — same `.bb-page`, same
 * `.bb-page-duo`, same `c0/c1/c2` — with `--pw` turned down to thumbnail
 * size and the tiles flattened to grey. That is the whole point: a
 * hand-drawn SVG icon set would be four lines of markup cheaper and
 * would start lying the first time anyone nudged a collage tile. This
 * cannot drift, because it IS the layout.
 *
 * Nobody reads "Framed". Everybody recognises the shape.
 */
export function LayoutWire({ id, theme, mirror }: { id: PageLayoutId; theme: BookTheme; mirror?: boolean }) {
  const tiles = LAYOUT_SLOTS[id];
  const collage = id === "collage";
  return (
    <span
      className={"bb-wire bb-page bb-page-" + id + (collage && mirror ? " bb-mirror" : "")}
      /*
       * The wire's tiles and hairline used to be fixed translucent
       * greys, which was fine while every page was near-white. On the
       * Ink or Slate paper a translucent grey on a dark page is a dark
       * square on a dark square, and the whole layout picker goes
       * blank. Mixing them off the page toward the theme's own ink and
       * accent keeps exactly the old appearance on light paper and
       * inverts by itself on dark.
       */
      style={
        {
          background: theme.page,
          "--wire-edge": mix(theme.page, theme.ink, 0.1),
          "--wire-tile": mix(theme.page, theme.ink, 0.24),
          "--wire-accent": mix(theme.page, theme.accent, 0.45),
        } as CSSProperties
      }
      aria-hidden="true"
    >
      {Array.from({ length: tiles }, (_, i) => (
        <span key={i} className={"bb-ph" + (collage ? " c" + i : "")} />
      ))}
    </span>
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
  const look = usePageLook();
  const lc = lookClasses(look);
  const sub = <div className="bb-cover-sub">{look.subtitle ?? occasion.subtitle}</div>;
  const base: CSSProperties = { background: theme.page, color: theme.ink };

  if (coverStyle === "minimal") {
    return (
      <div className={"bb-cover bb-cover-minimal" + lc} style={base}>
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
      <div className={"bb-cover bb-cover-framed" + lc} style={base}>
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
      <div className={"bb-cover bb-cover-split" + lc} style={base}>
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
    <div className={"bb-cover bb-cover-full" + lc} style={{ color: theme.ink }}>
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
        {/* A translucent black spine disappears into a dark page, so dark
            themes get an explicit shade of their own page instead. */}
        <div
          className="bb-mini-spine"
          style={{ background: theme.dark ? shiftColor(theme.page, -0.06) : "rgba(0,0,0,0.18)" }}
        ></div>
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
