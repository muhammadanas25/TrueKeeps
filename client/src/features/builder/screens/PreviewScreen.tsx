/**
 * PreviewScreen — hold the book: 3-D flip-through with arrows, swipe,
 * keyboard, and click-to-turn; theme dots for instant restyling; the
 * fork to Customize or Order.
 *
 * Ported from `book_builder/screens2.jsx`. The cover title is editable
 * in place (contentEditable, committed on blur) — "you can change this
 * anytime, even on the cover" is a copy promise the UI keeps.
 */

import { useEffect, useRef, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, Hand, PenLine } from "lucide-react";
import { Book3D, type Book3DApi } from "../book";
import { BOOK_THEMES, occasionById, toSpreads, type CopyVoice } from "../data";
import { bookTheme } from "../palette";
import type { BuilderState } from "../state";

export function PreviewScreen({
  state,
  set,
  copy,
  onOrder,
  onCustomize,
}: {
  state: BuilderState;
  set: (patch: Partial<BuilderState>) => void;
  copy: CopyVoice;
  onOrder: () => void;
  onCustomize: () => void;
}) {
  const occ = occasionById(state.occasion);
  const theme = bookTheme(state.themeId, state.pageColor);
  const spreads = toSpreads(state.pages);
  const n = spreads.length;
  const api = useRef<Book3DApi | null>(null);
  // the "click to turn" hint hides forever after the first flip
  const [flippedOnce, setFlippedOnce] = useState(state.pos > 0);
  const setPos = (p: number) => {
    set({ pos: p });
    if (p > 0) setFlippedOnce(true);
  };

  // arrow keys page through (unless typing in an input/contentEditable)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && t.closest && t.closest("input, [contenteditable]")) return;
      if (e.key === "ArrowRight") api.current?.next();
      if (e.key === "ArrowLeft") api.current?.prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const pageCount = state.pages.length;
  const indicator =
    state.pos === 0
      ? "Front cover"
      : "Pages " + (state.pos * 2 - 1) + (spreads[state.pos - 1] && spreads[state.pos - 1].right ? "–" + state.pos * 2 : "") + " of " + pageCount;

  return (
    <div className="bb-screen bb-preview">
      <div className="bb-preview-meta">
        <span>{pageCount} pages</span>·<span>8×8 in</span>·<span>{theme.name}</span>
      </div>
      <h1>{state.title}</h1>

      <div className="bb-preview-stage">
        <button className="bb-arrow" disabled={state.pos === 0} onClick={() => api.current?.prev()} aria-label="Previous">
          <ChevronLeft size={22} />
        </button>
        <Book3D
          spreads={spreads}
          pos={state.pos}
          onPos={setPos}
          apiRef={api}
          theme={theme}
          coverStyle={state.coverStyle}
          title={state.title}
          occasion={occ}
          photos={state.photos}
          editableTitle={true}
          onTitle={(t) => set({ title: t })}
        />
        <button className="bb-arrow" disabled={state.pos >= n} onClick={() => api.current?.next()} aria-label="Next">
          <ChevronRight size={22} />
        </button>
      </div>

      <div className="bb-page-indicator">{indicator}</div>
      {!flippedOnce ? (
        <div className="bb-preview-hint">
          <Hand size={15} /> {copy.previewHint}
        </div>
      ) : (
        <div className="bb-preview-hint" style={{ visibility: "hidden" }}>
          <Hand size={15} /> .
        </div>
      )}

      <div className="bb-actionbar">
        <div className="bb-theme-dots" style={{ marginRight: 8 }}>
          {BOOK_THEMES.map((t) => (
            <button
              key={t.id}
              className={"bb-theme-dot" + (state.themeId === t.id ? " on" : "")}
              style={{ background: t.id === "gallery" ? "#fff" : t.page }}
              onClick={() => set({ themeId: t.id })}
              title={t.name}
              aria-label={t.name}
            ></button>
          ))}
        </div>
        <button className="bb-btn bb-btn-secondary" onClick={onCustomize}>
          <PenLine size={16} /> {copy.customizeCta}
        </button>
        <button className="bb-btn bb-btn-primary" onClick={onOrder}>
          {copy.orderCta} <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
