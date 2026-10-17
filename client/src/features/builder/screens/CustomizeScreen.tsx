/**
 * CustomizeScreen — the power-user escape hatch, scoped per page.
 *
 * Ported from `book_builder/screens3.jsx`. Everything here mutates the
 * generated `pages` array while keeping it consistent:
 *  - changeLayout(): resizes a page's slot list; extra slots are filled
 *    from unused photos first, then reuse (never blank slots)
 *  - swapPhoto(): a TRUE swap — if the chosen photo already lives on
 *    another page, that slot receives the displaced photo
 *  - drag-to-reorder on the thumbnail rail (pointer-capture based, so
 *    it works with touch)
 *  - per-page caption + layout, whole-book theme + density controls
 *
 * State stays in the parent's builder state (`set`) so Done → preview
 * shows exactly what was edited; nothing here talks to the server.
 */

import { useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronDown, FlipHorizontal2, GripHorizontal, ImageOff, Images, Info, Maximize2, Palette, Undo2, Wand2, X } from "lucide-react";
import { CoverFace, LayoutWire, PageFace, Ph } from "../book";
import { ReframeBar } from "../reframe";
import { indexPhotos, pageHasLowQuality, slotMaxZoom } from "../print";
import { BOOK_THEMES, COVER_STYLES, DENSITIES, LAYOUTS, LAYOUT_SLOTS, MAX_SLOTS_PER_PAGE, generatePages, isMirrorable, layoutForCount, occasionById, pagePhotoIds, placement, type BookPage, type CopyVoice, type Placement } from "../data";
import { PAGE_COLOURS, THEME_COLOUR, bookTheme, pageColourById } from "../palette";
import { themeById } from "../data";
import type { BuilderState } from "../state";

type Sel = "cover" | number;

/**
 * What is currently being dragged.
 *
 * Two kinds, and the distinction decides what a drop MEANS: dropping a
 * photo from the tray onto a slot replaces what is there, while dropping
 * one slot onto another exchanges them. Encoding it in the payload
 * rather than in a piece of component state is deliberate — the drag can
 * end anywhere, including outside the window, and a stale "we are
 * dragging" flag is how drop targets get stuck lit up.
 */
type DragPayload = { kind: "photo"; photoId: string } | { kind: "slot"; pageIdx: number; slotIdx: number };

const DND_MIME = "application/x-truekeeps-photo";

function readPayload(e: React.DragEvent): DragPayload | null {
  try {
    const raw = e.dataTransfer.getData(DND_MIME);
    if (!raw) return null;
    const p = JSON.parse(raw) as DragPayload;
    if (p && (p.kind === "photo" || p.kind === "slot")) return p;
    return null;
  } catch {
    // Malformed payload, or a drag that originated outside the app
    // (a file, a URL, an image from another tab). Refusing is right:
    // we have no photo id to attach to a slot.
    return null;
  }
}

export function CustomizeScreen({
  state,
  set,
  copy,
  onDone,
}: {
  state: BuilderState;
  set: (patch: Partial<BuilderState>) => void;
  copy: CopyVoice;
  onDone: () => void;
}) {
  const occ = occasionById(state.occasion);
  // bookTheme, not themeById: the page-colour swatch overrides the
  // theme's paper, and everything on this screen has to see that.
  const theme = bookTheme(state.themeId, state.pageColor);
  // The un-overridden theme, kept for the two controls that are about
  // the theme itself rather than about the book: the theme cards and
  // the "back to the theme colour" chip at the head of the swatch row.
  const baseTheme = themeById(state.themeId);
  // A colour id from an older/newer build resolves to nothing, and
  // deriveTheme already fell back to the theme — so the row has to
  // agree and light the "theme" chip, not leave nothing selected.
  const activeColour = pageColourById(state.pageColor) ? state.pageColor : THEME_COLOUR;
  const pages = state.pages;
  const [sel, setSel] = useState<Sel>("cover");
  const [tray, setTray] = useState<{ pageIdx: number; slotIdx: number } | null>(null);
  // Which photo owns the reframe bar. Tapping a photo focuses it; moving
  // to another page drops it, because a bar pointing at a slot you can
  // no longer see is worse than no bar.
  const [focus, setFocus] = useState<{ pageIdx: number; slotIdx: number } | null>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  // Open by default: a collapsed tray is a tray nobody discovers, and
  // the count of unused photos is the one fact this screen could never
  // tell you before.
  const [stripOpen, setStripOpen] = useState(true);
  // one lookup table for the whole rail — the preflight runs on every
  // thumbnail on every render, so a per-slot find() would be O(pages × photos)
  const photoIndex = useMemo(() => indexPhotos(state.photos), [state.photos]);
  // Which photos are on a page somewhere. Recomputed only when the pages
  // actually change identity, which a pan does not do to the whole array.
  const usedIds = useMemo(() => new Set(pages.flatMap(pagePhotoIds)), [pages]);
  const unusedCount = state.photos.reduce((n, p) => n + (usedIds.has(p.id) ? 0 : 1), 0);

  const spreadIdx = sel === "cover" ? -1 : Math.floor(sel / 2);
  const leftIdx = spreadIdx * 2;
  const rightIdx = spreadIdx * 2 + 1;

  /* ── mutations ────────────────────────────────────── */
  const setPage = (idx: number, patch: Partial<BookPage>) => {
    const next = pages.slice();
    next[idx] = { ...next[idx], ...patch };
    set({ pages: next });
  };
  /**
   * Commit a framing change for one slot. Called on every pointer move
   * of a drag, so it copies only the page and slot list it touches —
   * every other page keeps its object identity and its memoised
   * thumbnail is skipped.
   */
  const setFrame = (pageIdx: number, slotIdx: number, patch: Partial<Placement>) => {
    const page = pages[pageIdx];
    const here = page?.slots[slotIdx];
    if (!here) return;
    const slots = page.slots.slice();
    slots[slotIdx] = { ...here, ...patch };
    setPage(pageIdx, { slots });
  };

  const unusedPhotos = () => state.photos.filter((p) => !usedIds.has(p.id));
  const changeLayout = (idx: number, layoutId: BookPage["layout"]) => {
    const want = LAYOUT_SLOTS[layoutId];
    // Keep the placements of the slots that survive: those carry the
    // user's own framing, which is the expensive thing to redo. Slots
    // that shrink away are dropped; new ones start centred.
    const slots = pages[idx].slots.slice(0, want);
    const pool = unusedPhotos();
    let pi = 0;
    let ai = 0;
    while (slots.length < want) {
      if (pi < pool.length) slots.push(placement(pool[pi++].id));
      else if (state.photos.length) {
        slots.push(placement(state.photos[ai % state.photos.length].id));
        ai++;
      } else break; // no photos at all — leave the slot empty rather than loop forever
    }
    // Slot 1 of a collage and slot 1 of a stacked pair are different
    // places on the page, so a reframe bar left pointing at "slot 1"
    // would now be aimed somewhere the user never chose.
    setFocus(null);
    setPage(idx, { layout: layoutId, slots });
  };
  const swapPhoto = (pageIdx: number, slotIdx: number, newPid: string) => {
    const here = pages[pageIdx].slots[slotIdx];
    if (!here || newPid === here.photoId) {
      setTray(null);
      return;
    }
    const next = pages.map((pg) => ({ ...pg, slots: pg.slots.slice() }));
    // If the chosen photo lives somewhere else, that slot receives our
    // old photo — a true swap. Framing travels WITH the photo, not with
    // the slot: a crop the user tuned for a face should follow the face.
    let incoming = placement(newPid);
    outer: for (const pg of next) {
      for (let i = 0; i < pg.slots.length; i++) {
        if (pg.slots[i].photoId === newPid) {
          incoming = pg.slots[i];
          pg.slots[i] = { ...here };
          break outer;
        }
      }
    }
    next[pageIdx].slots[slotIdx] = { ...incoming, photoId: newPid };
    set({ pages: next });
    setTray(null);
  };
  const movePage = (from: number, to: number) => {
    const next = pages.slice();
    const [pg] = next.splice(from, 1);
    next.splice(to, 0, pg);
    set({ pages: next });
  };

  /**
   * Take a photo off a page.
   *
   * Nothing is destroyed: the photo stays in `state.photos` and
   * reappears in the tray marked "not used", so this is a move rather
   * than a delete and there is no confirm dialog to dismiss. That is the
   * whole reason it can be a single click.
   *
   * The page then re-shapes to the photos it has left, because a layout
   * is a promise about how many photos are on the page — leaving a
   * collage holding two would leave a visible hole. If the page had one
   * photo it has none now, and an empty inner page is not a thing the
   * book has any use for, so it goes and the selection steps back to a
   * page that still exists.
   */
  const removePhoto = (pageIdx: number, slotIdx: number) => {
    const page = pages[pageIdx];
    if (!page) return;
    const slots = page.slots.filter((_, i) => i !== slotIdx);
    setFocus(null);
    const layout = layoutForCount(page.layout, slots.length);
    if (!layout) {
      const next = pages.filter((_, i) => i !== pageIdx);
      set({ pages: next });
      // Clamp rather than reset: landing back on the cover after
      // deleting page 9 of 12 loses the user their place.
      setSel(next.length ? Math.min(pageIdx, next.length - 1) : "cover");
      return;
    }
    setPage(pageIdx, { layout, slots });
  };

  /** Put `pid` into a slot, growing the page if it is being appended. */
  const placeInSlot = (pageIdx: number, slotIdx: number, pid: string) => swapPhoto(pageIdx, slotIdx, pid);

  /**
   * Add a photo to a page that has room, as a new slot at the end.
   *
   * Reached by dropping onto the page background rather than onto a
   * photo — "add to this page" and "replace this photo" are genuinely
   * different intentions and they get genuinely different targets.
   */
  const appendPhoto = (pageIdx: number, pid: string) => {
    const page = pages[pageIdx];
    if (!page || page.layout === "title") return;
    if (page.slots.length >= MAX_SLOTS_PER_PAGE) return;
    if (page.slots.some((s) => s.photoId === pid)) return; // already here; a no-op beats a duplicate
    const slots = [...page.slots, placement(pid)];
    const layout = layoutForCount(page.layout, slots.length) ?? page.layout;
    setFocus(null);
    setPage(pageIdx, { layout, slots });
  };

  /**
   * Exchange two slots, anywhere in the book.
   *
   * The whole Placement moves, framing included, because the framing
   * belongs to the photo — a crop someone tuned around a face should
   * follow that face into its new slot. The zoom is re-clamped on
   * arrival, since the destination slot may be smaller and the old zoom
   * could now sit past the quality floor.
   */
  const swapSlots = (a: { pageIdx: number; slotIdx: number }, b: { pageIdx: number; slotIdx: number }) => {
    if (a.pageIdx === b.pageIdx && a.slotIdx === b.slotIdx) return;
    const next = pages.map((pg) => ({ ...pg, slots: pg.slots.slice() }));
    const pa = next[a.pageIdx]?.slots[a.slotIdx];
    const pb = next[b.pageIdx]?.slots[b.slotIdx];
    if (!pa || !pb) return;
    const clampTo = (pl: Placement, pageIdx: number, slotIdx: number): Placement => {
      const lim = slotMaxZoom(photoIndex.get(pl.photoId), next[pageIdx].layout, slotIdx, pl.turn, undefined, pl.tilt);
      return pl.zoom > lim ? { ...pl, zoom: lim } : pl;
    };
    next[a.pageIdx].slots[a.slotIdx] = clampTo(pb, a.pageIdx, a.slotIdx);
    next[b.pageIdx].slots[b.slotIdx] = clampTo(pa, b.pageIdx, b.slotIdx);
    setFocus(null);
    set({ pages: next });
  };

  /* ── drag and drop ────────────────────────────────── */
  const [dndActive, setDndActive] = useState(false);
  const [dndOver, setDndOver] = useState<{ pageIdx: number; slotIdx: number | null } | null>(null);

  const startDrag = (payload: DragPayload, e: React.DragEvent) => {
    e.dataTransfer.setData(DND_MIME, JSON.stringify(payload));
    e.dataTransfer.effectAllowed = "move";
    setDndActive(true);
  };
  const endDrag = () => {
    setDndActive(false);
    setDndOver(null);
  };

  const dropOnSlot = (pageIdx: number, slotIdx: number, e: React.DragEvent) => {
    const p = readPayload(e);
    endDrag();
    if (!p) return;
    if (p.kind === "photo") placeInSlot(pageIdx, slotIdx, p.photoId);
    else swapSlots({ pageIdx: p.pageIdx, slotIdx: p.slotIdx }, { pageIdx, slotIdx });
  };

  const dropOnPage = (pageIdx: number, e: React.DragEvent) => {
    const p = readPayload(e);
    endDrag();
    // Only a tray photo can be APPENDED. A slot dragged onto a page's
    // empty margin has no second slot to exchange with, so there is no
    // sensible move — refusing beats inventing one.
    if (p && p.kind === "photo") appendPhoto(pageIdx, p.photoId);
  };

  /* ── thumbnail drag-to-reorder (pointer based) ────── */
  const onThumbDown = (e: React.PointerEvent, idx: number) => {
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* capture unsupported — drag still works via move events */
    }
    setDragIdx(idx);
    setSel(idx);
    setFocus(null);
  };
  const onThumbMove = (e: React.PointerEvent) => {
    if (dragIdx == null || !railRef.current) return;
    const thumbs = Array.from(railRef.current.querySelectorAll<HTMLElement>("[data-thumb]"));
    let target = dragIdx;
    for (const el of thumbs) {
      const r = el.getBoundingClientRect();
      if (e.clientX > r.left && e.clientX < r.right) {
        target = Number(el.dataset.thumb);
        break;
      }
    }
    if (target !== dragIdx) {
      movePage(dragIdx, target);
      setDragIdx(target);
      setSel(target);
    }
  };
  const onThumbUp = () => setDragIdx(null);

  /* ── panel content for the selection ──────────────── */
  const selPage = sel !== "cover" ? pages[sel] : null;
  const isTitlePage = selPage != null && selPage.layout === "title";

  /**
   * Move the page selection. Any reframe focus left on another page goes
   * with it — and a click that lands on the page rather than on a photo
   * (slots stop propagation) is a click on empty space, which is the
   * ordinary way to put a floating control away.
   */
  const select = (next: Sel) => {
    setSel(next);
    setFocus(null);
  };

  const focusPlacement = focus ? pages[focus.pageIdx]?.slots[focus.slotIdx] : undefined;
  const focusPhoto = focusPlacement ? photoIndex.get(focusPlacement.photoId) : undefined;

  const renderPage = (idx: number) => {
    const pg = pages[idx];
    if (!pg)
      return (
        <div className="bb-empty" style={{ background: theme.soft }}>
          end of book
        </div>
      );
    return (
      <PageFace
        page={pg}
        photos={state.photos}
        theme={theme}
        title={state.title}
        occasion={occ}
        focusSlot={focus && focus.pageIdx === idx ? focus.slotIdx : null}
        onSlotClick={(slotIdx) => {
          setSel(idx);
          // Tapping the photo that already owns the bar puts it away —
          // otherwise the only way to dismiss it is to leave the page.
          setFocus((f) => (f && f.pageIdx === idx && f.slotIdx === slotIdx ? null : { pageIdx: idx, slotIdx }));
        }}
        onSlotFrame={(slotIdx, patch) => setFrame(idx, slotIdx, patch)}
        dnd={{
          active: dndActive,
          over: dndOver && dndOver.pageIdx === idx ? dndOver.slotIdx : null,
          onDragStart: (slotIdx, e) => startDrag({ kind: "slot", pageIdx: idx, slotIdx }, e),
          onDragOverSlot: (slotIdx) => setDndOver(slotIdx == null ? null : { pageIdx: idx, slotIdx }),
          onDropOnSlot: (slotIdx, e) => dropOnSlot(idx, slotIdx, e),
        }}
      />
    );
  };

  /** How many more photos this page could take — drives the drop hint. */
  const roomOn = (idx: number): number => {
    const pg = pages[idx];
    if (!pg || pg.layout === "title") return 0;
    return Math.max(0, MAX_SLOTS_PER_PAGE - pg.slots.length);
  };

  /**
   * A page as a drop target for "add this photo here". Wraps the page
   * face so the margin around the photos is droppable too; the slots
   * inside stop propagation, so landing on a photo still means replace.
   */
  const pageDropProps = (idx: number) =>
    ({
      onDragOver: (e: React.DragEvent) => {
        if (!roomOn(idx)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        dropOnPage(idx, e);
      },
    }) as const;

  return (
    <div className="bb-screen bb-customize">
      <div className="bb-cust-head">
        <div>
          <h1>{copy.customizeTitle}</h1>
          <div className="bb-sub">{copy.customizeSub}</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="bb-btn bb-btn-primary" onClick={onDone}>
            <Check size={16} /> Done — back to preview
          </button>
        </div>
      </div>

      <div className="bb-cust-body">
        {/* spread */}
        <div className="bb-cust-spread-wrap">
          {sel === "cover" ? (
            <div className="bb-cust-spread">
              <div className="bb-cust-page sel" style={{ borderRadius: 8, overflow: "hidden" }}>
                <CoverFace theme={theme} coverStyle={state.coverStyle} title={state.title} occasion={occ} photos={state.photos} editable={true} onTitle={(t) => set({ title: t })} />
              </div>
            </div>
          ) : (
            <div className="bb-cust-spread">
              <div
                className={
                  "bb-cust-page" + (sel === leftIdx ? " sel" : "") + (dndActive && roomOn(leftIdx) ? " droppable" : "")
                }
                onClick={() => select(leftIdx)}
                {...pageDropProps(leftIdx)}
              >
                {renderPage(leftIdx)}
              </div>
              <div
                className={
                  "bb-cust-page" + (sel === rightIdx ? " sel" : "") + (dndActive && roomOn(rightIdx) ? " droppable" : "")
                }
                onClick={() => pages[rightIdx] && select(rightIdx)}
                {...pageDropProps(rightIdx)}
              >
                {renderPage(rightIdx)}
              </div>
              <div className="bb-cust-spine"></div>
            </div>
          )}

          {/* Controls for the photo you tapped — under the spread, not in
              the side panel, because reframing is done by eye. */}
          {focus && focusPlacement && pages[focus.pageIdx] ? (
            <ReframeBar
              photo={focusPhoto}
              placement={focusPlacement}
              layout={pages[focus.pageIdx].layout}
              slotIdx={focus.slotIdx}
              onFrame={(patch) => setFrame(focus.pageIdx, focus.slotIdx, patch)}
              onSwap={() => setTray({ pageIdx: focus.pageIdx, slotIdx: focus.slotIdx })}
              onRemove={() => removePhoto(focus.pageIdx, focus.slotIdx)}
              removeLabel={
                pages[focus.pageIdx].slots.length > 1
                  ? "Take it off the page — it stays in your photos below"
                  : "This is the page's only photo, so the page goes too"
              }
            />
          ) : sel !== "cover" && !isTitlePage && selPage && selPage.slots.length ? (
            <div className="bb-reframe-hint">
              <Maximize2 size={13} /> Drag a photo to reposition it — tap it to zoom, straighten, replace or remove.
            </div>
          ) : null}
        </div>

        {/* side panel */}
        <div className="bb-panel">
          {sel === "cover" ? (
            <div className="bb-panel-sec">
              <div className="bb-panel-label">Cover style</div>
              <div className="bb-seg">
                {COVER_STYLES.map((c) => (
                  <button key={c.id} className={state.coverStyle === c.id ? "on" : ""} onClick={() => set({ coverStyle: c.id })}>
                    {c.name}
                  </button>
                ))}
              </div>
              <div className="bb-panel-label" style={{ marginTop: 8 }}>
                Book title
              </div>
              <input className="bb-caption-input" value={state.title} maxLength={48} onChange={(e) => set({ title: e.target.value })} />
            </div>
          ) : isTitlePage ? (
            <div className="bb-panel-sec">
              <div className="bb-panel-label">Title page</div>
              <div className="bb-panel-note">
                <Info size={14} /> This page introduces your book. Edit the title under “Cover” — it stays in sync.
              </div>
            </div>
          ) : selPage ? (
            <div className="bb-panel-sec">
              {/* +1 because the rail below labels this same page "p.1",
                  and a panel headed "Page 0" for the page the user just
                  clicked reads as a bug even when nothing is wrong. */}
              <div className="bb-panel-label">Page {(sel as number) + 1} layout</div>
              {/* Grouped by photo count, because choosing a layout is
                  really two decisions — how many photos, then which
                  arrangement — and splitting them stops a six-item grid
                  from reading as six unrelated choices. */}
              <div className="bb-layouts">
                {[1, 2, 3].map((n) => (
                  <div key={n}>
                    <div className="bb-layouts-count">
                      {n} photo{n > 1 ? "s" : ""}
                    </div>
                    <div className="bb-layouts-row">
                      {LAYOUTS.filter((l) => l.slots === n).map((l) => (
                        <button
                          key={l.id}
                          className={"bb-layout-opt" + (selPage.layout === l.id ? " on" : "")}
                          aria-pressed={selPage.layout === l.id}
                          onClick={() => changeLayout(sel as number, l.id)}
                        >
                          <LayoutWire id={l.id} theme={theme} mirror={selPage.mirror} />
                          {l.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {isMirrorable(selPage.layout) ? (
                <button
                  className="bb-btn bb-btn-ghost bb-btn-sm bb-mirror-btn"
                  aria-pressed={!!selPage.mirror}
                  onClick={() => setPage(sel as number, { mirror: !selPage.mirror })}
                >
                  <FlipHorizontal2 size={15} /> Flip this layout
                </button>
              ) : null}
              <div className="bb-panel-label" style={{ marginTop: 8 }}>
                Caption
              </div>
              <input
                className="bb-caption-input"
                value={selPage.caption}
                placeholder="Add a few words…"
                maxLength={60}
                onChange={(e) => setPage(sel as number, { caption: e.target.value })}
              />
              <div className="bb-panel-note">
                <Maximize2 size={14} /> Tap a photo on the page to zoom, straighten, replace or remove it. Adding or
                removing one re-shapes the page to fit.
              </div>
            </div>
          ) : null}

          <div className="bb-panel-sec">
            <div className="bb-panel-label">Whole book — theme</div>
            <div className="bb-theme-cards">
              {BOOK_THEMES.map((t) => (
                <button key={t.id} className={"bb-theme-card" + (state.themeId === t.id ? " on" : "")} onClick={() => set({ themeId: t.id })}>
                  <div className="sw" style={{ background: t.page, color: t.ink }}>
                    Aa
                  </div>
                  <div className="nm">{t.name}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Page colour. Sits under the theme because it overrides one
              part of it. The theme cards keep showing their own paper —
              if they previewed the override they'd all look identical
              and the theme picker would stop working as a picker. */}
          <div className="bb-panel-sec">
            <div className="bb-panel-label">Whole book — page colour</div>
            <div className="bb-swatches">
              <button
                className={"bb-swatch" + (activeColour === THEME_COLOUR ? " on" : "")}
                style={{ background: baseTheme.page, color: baseTheme.ink }}
                onClick={() => set({ pageColor: THEME_COLOUR })}
                title={`Theme colour — ${baseTheme.name}`}
                aria-label={`Theme colour, ${baseTheme.name}`}
                aria-pressed={activeColour === THEME_COLOUR}
              >
                <Undo2 size={12} />
              </button>
              {PAGE_COLOURS.map((c) => (
                <button
                  key={c.id}
                  className={"bb-swatch" + (activeColour === c.id ? " on" : "")}
                  style={{ background: c.hex }}
                  onClick={() => set({ pageColor: c.id })}
                  title={c.name}
                  aria-label={c.name}
                  aria-pressed={activeColour === c.id}
                >
                  {activeColour === c.id ? <Check size={12} color={theme.ink} /> : null}
                </button>
              ))}
            </div>
            <div className="bb-panel-note">
              <Palette size={14} />
              {activeColour === THEME_COLOUR
                ? `Using the theme's own paper — ${baseTheme.name}.`
                : `${pageColourById(activeColour)?.name} paper. Captions switch to ${theme.dark ? "light" : "dark"} text automatically so they stay readable in print.`}
            </div>
          </div>

          <div className="bb-panel-sec">
            <div className="bb-panel-label">Photos per page</div>
            <div className="bb-seg">
              {DENSITIES.map((d) => (
                <button
                  key={d.id}
                  className={state.density === d.id ? "on" : ""}
                  onClick={() => set({ density: d.id, pages: generatePages(state.photos, d.id) })}
                >
                  {d.name}
                </button>
              ))}
            </div>
            <div className="bb-panel-note">
              <Wand2 size={14} /> Changing this re-arranges your pages with the same photos.
            </div>
          </div>
        </div>
      </div>

      {/* photo tray — every photo in the book, used or not */}
      <div className="bb-strip-wrap">
        <button className="bb-strip-head" onClick={() => setStripOpen((o) => !o)} aria-expanded={stripOpen}>
          <Images size={14} />
          <span>Your photos</span>
          <span className="bb-strip-count">
            {unusedCount > 0 ? `${unusedCount} not used yet` : `all ${state.photos.length} in the book`}
          </span>
          <ChevronDown size={15} className={"bb-strip-chev" + (stripOpen ? " open" : "")} />
        </button>
        {stripOpen ? (
          <div className="bb-strip">
            {state.photos.map((p) => {
              const used = usedIds.has(p.id);
              return (
                <div
                  key={p.id}
                  className={"bb-strip-item" + (used ? " used" : "") + (p.url ? "" : " missing")}
                  draggable
                  onDragStart={(e) => startDrag({ kind: "photo", photoId: p.id }, e)}
                  onDragEnd={endDrag}
                  title={p.url ? p.label : p.label + " — this photo's image is missing"}
                >
                  <Ph photo={p} theme={theme} showLabel={false} />
                  {used ? <span className="bb-strip-dot" aria-label="in the book" /> : null}
                  {p.url ? null : (
                    <span className="bb-strip-missing" aria-label="image missing">
                      <ImageOff size={12} />
                    </span>
                  )}
                </div>
              );
            })}
            {state.photos.length === 0 ? <div className="bb-strip-empty">No photos yet.</div> : null}
          </div>
        ) : null}
        {stripOpen ? (
          <div className="bb-strip-hint">Drag one onto a photo to replace it, or onto a page's edge to add it.</div>
        ) : null}
      </div>

      {/* thumbnail rail */}
      <div className="bb-rail-wrap">
        <div className="bb-rail-hint">
          <GripHorizontal size={14} /> Drag pages to reorder — tap to edit
        </div>
        <div className="bb-rail" ref={railRef}>
          <button className={"bb-thumb fixed" + (sel === "cover" ? " sel" : "")} onClick={() => select("cover")} style={{ "--pw": "68px" } as React.CSSProperties}>
            <div className="bb-thumb-cover-mini" style={{ background: theme.page, color: theme.ink }}>
              {state.title}
            </div>
            <span className="pgnum">cover</span>
          </button>
          {pages.map((pg, i) => (
            <div
              key={pg.id}
              data-thumb={i}
              className={"bb-thumb" + (sel === i ? " sel" : "") + (dragIdx === i ? " drag" : "")}
              style={{ "--pw": "68px" } as React.CSSProperties}
              onPointerDown={(e) => onThumbDown(e, i)}
              onPointerMove={onThumbMove}
              onPointerUp={onThumbUp}
            >
              <PageFace page={pg} photos={state.photos} theme={theme} title={state.title} occasion={occ} />
              {pageHasLowQuality(pg, photoIndex) ? (
                <span
                  className="bb-thumb-warn"
                  title="A photo on this page may look soft in print"
                  aria-label="A photo on this page may look soft in print"
                >
                  <AlertTriangle size={11} />
                </span>
              ) : null}
              <span className="pgnum">{i === 0 ? "p.1" : "p." + (i + 1)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* photo tray */}
      {tray ? (
        <div className="bb-modal-veil" onClick={() => setTray(null)}>
          <div className="bb-modal" onClick={(e) => e.stopPropagation()}>
            <div className="bb-modal-head">
              <h3>Pick a photo</h3>
              <button className="bb-btn bb-btn-ghost" onClick={() => setTray(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="bb-modal-body">
              <div className="bb-tray-grid">
                {state.photos.map((p) => {
                  const isCurrent = pages[tray.pageIdx].slots[tray.slotIdx]?.photoId === p.id;
                  const inUse = !isCurrent && pages.some((pg) => pg.slots.some((s) => s.photoId === p.id));
                  return (
                    <button key={p.id} className={"bb-tray-item" + (isCurrent ? " current" : "")} onClick={() => swapPhoto(tray.pageIdx, tray.slotIdx, p.id)}>
                      <Ph photo={p} theme={theme} />
                      {isCurrent ? (
                        <span className="inuse" style={{ background: "var(--tk-raspberry)" }}>
                          current
                        </span>
                      ) : inUse ? (
                        <span className="inuse">in book</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
