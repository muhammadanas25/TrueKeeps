/**
 * PreviewScreen — step 6 of 7: "Check your book", then approve it.
 *
 * What: the whole book, exactly as it will print, with three things the
 * owner's flow asks for (2026-11-15):
 *  - switch the cover style here (Minimal, Full Picture, Truekeeps Design);
 *    the pages stay exactly as they are
 *  - see the spine (the closed book shows it on a wide screen; on a phone the
 *    cover comes first with its spine beside it)
 *  - a required tick: "I have checked the names, spellings, fonts and
 *    colours. I understand the book will be printed exactly as shown."
 *    Payment can't start until it is ticked.
 * "Make changes" opens the editor; the approval is asked again after.
 *
 * Layout: on a wide screen the 3-D book with arrows, swipe, keys and
 * click-to-turn (ported from `book_builder/screens2.jsx`), the cover title
 * editable in place. On a phone the same dark stage and white sheet as step
 * 5 (PageRibbon), so the two steps feel like one place.
 */

import { useEffect, useRef, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, Hand, PenLine } from "lucide-react";
import { Book3D, CoverFace, type Book3DApi } from "../book";
import { DENSITIES, FEEL_CHOICES, isFeelChoice, occasionById, pickableThemes, toSpreads, type CopyVoice } from "../data";
import { fontById } from "../looks";
import { bookTheme } from "../palette";
import { PageRibbon } from "../PageRibbon";
import type { BuilderState } from "../state";
import { useNarrow } from "../useNarrow";
import { spineOf } from "./BookScreen";
import { finishName } from "@shared/pricing";
import "../flow.css";

export const APPROVAL_TEXT = "I have checked the names, spellings, fonts and colours. I understand the book will be printed exactly as shown.";

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
  const narrow = useNarrow();
  const occ = occasionById(state.occasion);
  const theme = bookTheme(state.themeId, state.pageColor);
  const spreads = toSpreads(state.pages);
  const n = spreads.length;
  const api = useRef<Book3DApi | null>(null);
  const [approved, setApproved] = useState(false);
  const [index, setIndex] = useState(0);
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
  const font = fontById(state.fontId);
  const arrangement = DENSITIES.find((d) => d.id === state.density)?.name ?? "Classic";
  const photoCount = new Set(state.pages.flatMap((p) => p.slots.map((s) => s.photoId))).size;
  const title = state.title.trim() || occ.suggestedTitle;
  // An older book may have a cover style from before the three; show it as none of them picked.
  const coverChoice = isFeelChoice(state.coverStyle) ? state.coverStyle : null;

  const coverSwitch = (
    <div className="pv-cover">
      <span className="pv-cover-label">Cover</span>
      <div className="bk-seg bk-seg-wide" role="radiogroup" aria-label="Cover">
        {FEEL_CHOICES.map((f) => (
          <button key={f.id} type="button" role="radio" aria-checked={coverChoice === f.id} className={coverChoice === f.id ? "on" : ""} onClick={() => set({ coverStyle: f.id })}>
            {f.name}
          </button>
        ))}
      </div>
      <span className="pv-cover-note">Changing the cover leaves your pages as they are.</span>
    </div>
  );
  const checks = (
    <p className="pv-checks">
      <span>
        On the cover and spine: <b>{title}</b> in {font.name} lettering
      </span>
      <span>
        {arrangement} book, {pageCount} pages, {photoCount} photos, {finishName(state.finish).toLowerCase()} paper
      </span>
    </p>
  );
  const approve = (
    <label className={"pv-approve" + (approved ? " on" : "")}>
      <input type="checkbox" checked={approved} onChange={(e) => setApproved(e.target.checked)} />
      <span>{APPROVAL_TEXT}</span>
    </label>
  );

  /* ── Phone: dark stage with the cover and pages, white sheet below ── */
  if (narrow) {
    return (
      <div className="bb-screen pv-phone">
        <PageRibbon
          pages={state.pages}
          photos={state.photos}
          theme={theme}
          title={title}
          occasion={occ}
          cover={<CoverFace theme={theme} coverStyle={state.coverStyle} title={title} occasion={occ} photos={state.photos} />}
          spine={spineOf(state)}
          index={index}
          onIndex={setIndex}
          label="Your book, cover first"
        />
        <div className="bk-sheet">
          <span className="bk-grip" aria-hidden="true" />
          <div className="bk-sheet-head">
            <h1>Check your book</h1>
          </div>
          {coverSwitch}
          {checks}
          {approve}
          <button type="button" className="bb-btn bb-btn-primary bb-btn-lg bk-go" disabled={!approved} onClick={onOrder}>
            Approve and pay <ArrowRight size={18} />
          </button>
          <div className="pv-links">
            <button type="button" className="bb-btn bb-btn-ghost" onClick={onCustomize}>
              <PenLine size={15} /> Make changes
            </button>
          </div>
        </div>
      </div>
    );
  }

  const indicator =
    state.pos === 0
      ? "Front cover and spine"
      : "Pages " + (state.pos * 2 - 1) + (spreads[state.pos - 1] && spreads[state.pos - 1].right ? " and " + state.pos * 2 : "") + " of " + pageCount;

  return (
    <div className="bb-screen bb-preview">
      <div className="bb-preview-meta">
        <span>{pageCount} pages</span>·<span>12 x 12 in</span>·<span>{arrangement}</span>
      </div>
      <h1>Check your book</h1>

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
      <div className="bb-preview-hint" style={flippedOnce ? { visibility: "hidden" } : undefined}>
        <Hand size={15} /> {copy.previewHint}
      </div>

      <div className="pv-panel">
        {coverSwitch}
        {checks}
        {approve}
      </div>

      <div className="bb-actionbar">
        <div className="bb-theme-dots">
          {pickableThemes(state.themeId).map((t) => (
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
          <PenLine size={16} /> Make changes
        </button>
        <button className="bb-btn bb-btn-primary" disabled={!approved} onClick={onOrder} title={approved ? undefined : "Tick the box above to approve your book first"}>
          Approve and pay <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
