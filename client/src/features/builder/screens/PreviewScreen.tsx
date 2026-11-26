/**
 * PreviewScreen — step 6 of 7: "Check your book", then approve it.
 *
 * What: the whole book, exactly as it will print, and everything the owner's
 * flow asks to settle before paying (2026-11-15, revised 2026-11-21):
 *  - no cover choices (owner, 2026-11-26: they were made on steps 3 and 4, so
 *    this step only checks); cover style, photo and pattern change in the editor
 *  - what prints: title, the line under it, lettering, book, photos, paper
 *  - a warning when the page count is odd (the last page would print blank),
 *    with "Add a page"
 *  - a required tick: "I have checked the names, spellings, fonts and
 *    colours. I understand the book will be printed exactly as shown."
 *    Payment can't start until it is ticked, and the screen says so.
 *
 * Layout (owner-approved design, 2026-11-21): on a wide screen the 3-D book
 * on the left and all of the above in a column on the right, so the tick box
 * and the pay button are always on screen (they used to sit under the fixed
 * bottom bar). On a phone the same dark stage and white sheet as step 5,
 * kept short so the book stays big: one summary line, and the pay button
 * itself says "Tick the box to approve" until the box is ticked.
 * Page colours moved off this step; they stay in the editor ("Make changes").
 */

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronLeft, ChevronRight, Hand, PenLine, Plus } from "lucide-react";
import { STATUS_LABEL } from "@shared/orders";
import { useOrdered } from "../useOrdered";
import { flaggedPhotos } from "../quality";
import { BackCoverFace, Book3D, CoverFace, type Book3DApi } from "../book";
import { DENSITIES, bookPhotos, occasionById, toSpreads, type CopyVoice } from "../data";
import { addPage, sliceOf } from "../editor-v2/book-ops";
import { fontById } from "../looks";
import { bookTheme } from "../palette";
import { PageRibbon } from "../PageRibbon";
import type { BuilderState } from "../state";
import { useNarrow } from "../useNarrow";
import { spineOf } from "./BookScreen";
import { finishName, printedPageCount } from "@shared/pricing";
import "../flow.css";

/** The approval tick (website copy v1, 2026-11-26; matches Policies v1: screen vs paper colour is not covered). */
export const APPROVAL_TEXT = "I've checked the names, spellings, photos and layout. I understand colours on paper may look slightly different from my screen.";

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
  const { ordered } = useOrdered(state.projectId);
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
  const printed = printedPageCount(state.pages);
  const font = fontById(state.fontId);
  const arrangement = DENSITIES.find((d) => d.id === state.density)?.name ?? "Classic";
  const photoCount = new Set(state.pages.flatMap((p) => p.slots.map((s) => s.photoId))).size;
  const title = state.title.trim() || occ.suggestedTitle;
  const line = state.subtitle ?? occ.subtitle;

  // A book prints on sheets of two pages: an odd count leaves the last page blank.
  const odd = printed % 2 === 1;
  const addOnePage = () => {
    const r = addPage(sliceOf(state), state.pages.length - 1, bookPhotos(state));
    if (r) set({ pages: r.book.pages });
  };

  const oddNote = odd ? (
    <div className="pv-odd" role="status">
      <p>
        <AlertTriangle size={16} /> Your album has {printed} pages, so the last page prints blank.
      </p>
      <button type="button" className="bb-btn bb-btn-secondary" onClick={addOnePage}>
        <Plus size={15} /> Add a page
      </button>
    </div>
  ) : null;
  const rows: Array<[string, string]> = [
    ["Title", title],
    ["Date or place", line || "Not added"],
    ["Font style", font.name],
    ["Layout", `${arrangement}, ${pageCount} pages`],
    ["Photos", String(photoCount)],
    ["Finish", finishName(state.finish)],
  ];
  const detailRows = (
    <dl className="pv-rows">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
  // an ordered book shows its order, not "Approve and pay" again (useOrdered)
  const orderedNote = ordered ? (
    <div className="pv-ordered" role="status">
      <CheckCircle2 size={20} />
      <span>
        <b>You've ordered this album.</b> Order {ordered.orderNumber} · {STATUS_LABEL[ordered.status]}
      </span>
      <a className="bb-btn bb-btn-primary" href={`/orders/${ordered.id}`}>
        See my order <ArrowRight size={16} />
      </a>
    </div>
  ) : null;
  // flagged photos on the pages (quality.ts): said here, before approval, because
  // the refund policy excludes photos kept after this warning
  const onPages = new Set(state.pages.flatMap((p) => p.slots.map((x) => x.photoId)));
  const softCount = Array.from(flaggedPhotos(state.photos).keys()).filter((id) => onPages.has(id)).length;
  const softNote = softCount ? (
    <p className="pv-soft" role="note">
      <AlertTriangle size={16} />
      <span>
        {softCount === 1 ? "1 photo" : `${softCount} photos`} in your album may print soft (marked on the photos step). Approving keeps {softCount === 1 ? "it" : "them"} as {softCount === 1 ? "it is" : "they are"}.
      </span>
    </p>
  ) : null;
  const approve = (
    <label className={"pv-approve" + (approved ? " on" : "")}>
      <input type="checkbox" checked={approved} onChange={(e) => setApproved(e.target.checked)} />
      <span>{APPROVAL_TEXT}</span>
    </label>
  );
  /* ── Phone: dark stage with the cover and pages, a short white sheet below ── */
  if (narrow) {
    return (
      <div className="bb-screen pv-phone">
        <div className="pv-stagewrap">
        <PageRibbon
          pages={state.pages}
          photos={state.photos}
          theme={theme}
          title={title}
          occasion={occ}
          cover={<CoverFace theme={theme} coverStyle={state.coverStyle} title={title} occasion={occ} photos={state.photos} />}
          back={<BackCoverFace theme={theme} coverStyle={state.coverStyle} />}
          spine={spineOf(state)}
          index={index}
          onIndex={setIndex}
          label="Your album, cover first"
        />
        </div>
        <div className="bk-sheet">
          <span className="bk-grip" aria-hidden="true" />
          <h1 className="pv-title">Here's your album</h1>
          {/* the same details as desktop, as a table (owner, 2026-11-22: not as prominent on the phone) */}
          {detailRows}
          {oddNote}
          {ordered ? null : softNote}
          {orderedNote ?? (
            <>
              {approve}
              <button type="button" className="bb-btn bb-btn-primary bb-btn-lg bk-go" disabled={!approved} onClick={onOrder}>
                Approve and continue <ArrowRight size={18} />
              </button>
              {!approved ? <span className="pv-hint">Tick the box once you're happy.</span> : null}
            </>
          )}
          <div className="pv-links">
            {/* a real button under Approve (owner, 2026-11-26: the Edit pill on the album was easy to tap by mistake) */}
            <button type="button" className="bb-btn bb-btn-secondary pv-editor-btn" onClick={onCustomize}>
              <PenLine size={15} /> Open the editor
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Wide screens: the book left, what to check and approve right ── */
  const indicator =
    state.pos === 0
      ? "Cover view"
      : state.pos === n + 1
        ? "Back cover"
        : "Pages " + (state.pos * 2 - 1) + (spreads[state.pos - 1] && spreads[state.pos - 1].right ? " and " + state.pos * 2 : "") + " of " + pageCount;

  return (
    <div className="bb-screen pv-wide">
      <div className="pv-stage">
        <div className="bb-preview-stage pv-book">
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
          <button className="bb-arrow" disabled={state.pos >= n + 1} onClick={() => api.current?.next()} aria-label="Next">
            <ChevronRight size={22} />
          </button>
        </div>
        <div className="bb-page-indicator">{indicator}</div>
        <div className="bb-preview-hint" style={flippedOnce ? { visibility: "hidden" } : undefined}>
          <Hand size={15} /> {copy.previewHint}
        </div>
      </div>

      <div className="pv-panel">
        <div className="pv-head">
          <h1>Here's your album</h1>
          <p>Check every page carefully. What you approve is what we print.</p>
        </div>
        {detailRows}
        {oddNote}
        {ordered ? null : softNote}
        {orderedNote}
        {ordered ? null : approve}
        <div className="pv-actions">
          {ordered ? null : (
            <>
              <button className="bb-btn bb-btn-primary bb-btn-lg" disabled={!approved} onClick={onOrder}>
                Approve and continue <ArrowRight size={18} />
              </button>
              {!approved ? <span className="pv-hint">Tick the box once you're happy.</span> : null}
            </>
          )}
          <button type="button" className="bb-btn bb-btn-secondary pv-editor-btn" onClick={onCustomize}>
            <PenLine size={15} /> Open the editor
          </button>
        </div>
      </div>
    </div>
  );
}
