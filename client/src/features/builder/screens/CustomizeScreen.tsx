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

import { useRef, useState } from "react";
import { Check, GripHorizontal, Info, Repeat, Wand2, X } from "lucide-react";
import { CoverFace, PageFace, Ph } from "../book";
import { BOOK_THEMES, COVER_STYLES, DENSITIES, LAYOUTS, LAYOUT_SLOTS, generatePages, occasionById, themeById, type BookPage, type CopyVoice } from "../data";
import type { BuilderState } from "../state";

type Sel = "cover" | number;

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
  const theme = themeById(state.themeId);
  const pages = state.pages;
  const [sel, setSel] = useState<Sel>("cover");
  const [tray, setTray] = useState<{ pageIdx: number; slotIdx: number } | null>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const spreadIdx = sel === "cover" ? -1 : Math.floor(sel / 2);
  const leftIdx = spreadIdx * 2;
  const rightIdx = spreadIdx * 2 + 1;

  /* ── mutations ────────────────────────────────────── */
  const setPage = (idx: number, patch: Partial<BookPage>) => {
    const next = pages.slice();
    next[idx] = { ...next[idx], ...patch };
    set({ pages: next });
  };
  const unusedPhotos = () => {
    const used = new Set(pages.flatMap((p) => p.photoIds));
    return state.photos.filter((p) => !used.has(p.id));
  };
  const changeLayout = (idx: number, layoutId: BookPage["layout"]) => {
    const want = LAYOUT_SLOTS[layoutId];
    const ids = pages[idx].photoIds.slice(0, want);
    const pool = unusedPhotos();
    let pi = 0;
    let ai = 0;
    while (ids.length < want) {
      if (pi < pool.length) ids.push(pool[pi++].id);
      else {
        ids.push(state.photos[ai % state.photos.length].id);
        ai++;
      }
    }
    setPage(idx, { layout: layoutId, photoIds: ids });
  };
  const swapPhoto = (pageIdx: number, slotIdx: number, newPid: string) => {
    const oldPid = pages[pageIdx].photoIds[slotIdx];
    if (newPid === oldPid) {
      setTray(null);
      return;
    }
    const next = pages.map((pg) => ({ ...pg, photoIds: pg.photoIds.slice() }));
    // if the chosen photo lives somewhere else, give that slot our old photo (a true swap)
    outer: for (const pg of next) {
      for (let i = 0; i < pg.photoIds.length; i++) {
        if (pg.photoIds[i] === newPid) {
          pg.photoIds[i] = oldPid;
          break outer;
        }
      }
    }
    next[pageIdx].photoIds[slotIdx] = newPid;
    set({ pages: next });
    setTray(null);
  };
  const movePage = (from: number, to: number) => {
    const next = pages.slice();
    const [pg] = next.splice(from, 1);
    next.splice(to, 0, pg);
    set({ pages: next });
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
        onSlotClick={(slotIdx) => {
          setSel(idx);
          setTray({ pageIdx: idx, slotIdx });
        }}
      />
    );
  };

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
              <div className={"bb-cust-page" + (sel === leftIdx ? " sel" : "")} onClick={() => setSel(leftIdx)}>
                {renderPage(leftIdx)}
              </div>
              <div className={"bb-cust-page" + (sel === rightIdx ? " sel" : "")} onClick={() => pages[rightIdx] && setSel(rightIdx)}>
                {renderPage(rightIdx)}
              </div>
              <div className="bb-cust-spine"></div>
            </div>
          )}
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
              <div className="bb-panel-label">Page {sel} layout</div>
              <div className="bb-seg">
                {LAYOUTS.map((l) => (
                  <button key={l.id} className={selPage.layout === l.id ? "on" : ""} onClick={() => changeLayout(sel as number, l.id)}>
                    {l.name}
                  </button>
                ))}
              </div>
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
                <Repeat size={14} /> Hover any photo on the page to swap it for another.
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

      {/* thumbnail rail */}
      <div className="bb-rail-wrap">
        <div className="bb-rail-hint">
          <GripHorizontal size={14} /> Drag pages to reorder — tap to edit
        </div>
        <div className="bb-rail" ref={railRef}>
          <button className={"bb-thumb fixed" + (sel === "cover" ? " sel" : "")} onClick={() => setSel("cover")} style={{ "--pw": "68px" } as React.CSSProperties}>
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
                  const isCurrent = pages[tray.pageIdx].photoIds[tray.slotIdx] === p.id;
                  const inUse = !isCurrent && pages.some((pg) => pg.photoIds.includes(p.id));
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
