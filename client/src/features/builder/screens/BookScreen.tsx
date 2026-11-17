/**
 * BookScreen — step 5 of 7: "Pick your book".
 *
 * What: ONE choice, how full the pages feel (Story, Classic or Family
 * Album), then the book size and the paper. The book on the stage is laid
 * out live by the engine (arrange.ts) for the customer's own photos, so
 * every tap shows what they would actually get and what it costs.
 *
 * Rules the owner set (2026-11-16):
 *  - one choice, not two groups of options
 *  - nothing is shown that can't be chosen: the book size comes from the
 *    photos and the arrangement, and the page stepper only moves inside the
 *    range that works (fewest sheets that hold every photo, up to 16 sheets
 *    and never more pages than photos)
 *  - "Our pick" on Classic is a recommendation, not a sales claim
 *
 * Layout: on a wide screen, the choices on the left and the 3-D book on the
 * right. On a phone ("Option C", owner's pick 2026-11-17), the book fills a
 * dark stage one page at a time (PageRibbon) and the choices sit in a white
 * sheet under it, with pages and paper behind one tap.
 *
 * The laid-out pages are written to the book only on "Preview my book". If
 * the customer changed pages by hand (Customize) and came back here, their
 * pages are kept until they change a choice, and a note says so.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ImagePlus, Info, Minus, Plus } from "lucide-react";
import { FINISHES, PRICE_LIST, formatPKR, quote } from "@shared/pricing";
import { Book3D, shiftColor, type Book3DApi } from "../book";
import { ARRANGEMENTS, MAX_SHEETS, arrangeBook, arrangementOf, arrangementThatFits, densityOf, sheetRange, type ArrangementId } from "../arrange";
import { occasionById, toSpreads } from "../data";
import { fontById } from "../looks";
import { bookTheme } from "../palette";
import { PageRibbon } from "../PageRibbon";
import type { BuilderState } from "../state";
import { useNarrow } from "../useNarrow";
import "../flow.css";

/** Fewest photos that make a book: the smallest book has 10 pages, one photo each at least. */
export const MIN_PHOTOS = PRICE_LIST.includedSheets * 2;

const unitPrice = (sheets: number) => quote({ binding: "hardcover", qty: 1, printedPages: sheets * 2 }).unitMinor;

export function BookScreen({
  state,
  set,
  onPreview,
  onPhotos,
}: {
  state: BuilderState;
  set: (patch: Partial<BuilderState>) => void;
  onPreview: () => void;
  onPhotos: () => void;
}) {
  const narrow = useNarrow();
  const occ = occasionById(state.occasion);
  const theme = bookTheme(state.themeId, state.pageColor);
  const photos = state.photos;
  const n = photos.length;
  const style = arrangementOf(state.density);
  const range = sheetRange(n, style);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [pos, setPos] = useState(1);
  const api = useRef<Book3DApi | null>(null);
  // Pages changed by hand stay until the customer changes a choice here.
  const [touched, setTouched] = useState(!(state.pagesEdited && state.pages.length));
  const keepHandEdits = !touched;

  // Re-laid out only when the photos (or their sizes, which arrive as each
  // file is read) or a choice change; a 60-photo book takes a few ms.
  const photoKey = photos.map((p) => p.id + ":" + (p.w ?? 0) + "x" + (p.h ?? 0)).join(",");
  const plan = useMemo(
    () => arrangeBook(photos, style, state.sheets),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [photoKey, style, state.sheets],
  );
  const pages = keepHandEdits ? state.pages : plan.pages;
  const sheets = keepHandEdits ? Math.ceil(state.pages.length / 2) : plan.sheets;
  const bookKey = keepHandEdits ? "hand" : style + "|" + plan.sheets;
  const spreads = useMemo(() => toSpreads(pages), [pages]);

  // The open spread can't be past the end of a book that just got shorter.
  useEffect(() => {
    if (pos > spreads.length) setPos(Math.max(1, spreads.length));
  }, [spreads.length, pos]);

  const choose = (patch: Partial<BuilderState>) => {
    setTouched(true);
    set(patch);
    setPos(1);
  };
  const pick = (id: ArrangementId) => choose({ density: densityOf(id), sheets: null });
  const atMin = sheets <= range.min;
  const atMax = sheets >= range.max;
  const fewer = () => !atMin && choose({ density: densityOf(style), sheets: sheets - 1 });
  const more = () => !atMax && choose({ density: densityOf(style), sheets: sheets + 1 });
  const fits = arrangementThatFits(n);
  const finish = FINISHES.find((f) => f.id === state.finish) ?? FINISHES[0];
  const price = formatPKR(unitPrice(sheets));

  const commit = () => {
    if (!keepHandEdits) set({ pages: plan.pages, pagesEdited: false, sheets: plan.sheets });
    onPreview();
  };

  if (n < MIN_PHOTOS) {
    return (
      <div className="bb-screen bk-locked">
        <ImagePlus size={36} strokeWidth={1.5} />
        <h1>Add a few more photos</h1>
        <p>
          The smallest book has {MIN_PHOTOS} pages, so it needs at least {MIN_PHOTOS} photos. You have {n} so far.
        </p>
        <button type="button" className="bb-btn bb-btn-primary bb-btn-lg" onClick={onPhotos}>
          Add photos <ArrowRight size={18} />
        </button>
      </div>
    );
  }

  const fitLine = (id: ArrangementId) => {
    const r = sheetRange(n, id);
    const sh = id === style ? sheets : r.min;
    if (r.holds < n) return { text: `Our biggest book holds ${r.holds} of your ${n} photos this way`, warn: true };
    return { text: `Your ${n} photos on ${sh * 2} pages`, warn: false };
  };
  const pagesNote = (() => {
    const bits = [`Each extra sheet is 2 pages and adds ${formatPKR(PRICE_LIST.extraSheetMinor)}.`];
    if (atMin) bits.push(sheets > PRICE_LIST.includedSheets ? "Fewer pages would crowd this book." : `${PRICE_LIST.includedSheets * 2} pages is our smallest book.`);
    if (atMax) bits.push(sheets >= MAX_SHEETS ? `${MAX_SHEETS * 2} pages is our biggest book.` : "Every page needs at least one photo.");
    return bits.join(" ");
  })();
  const leftover = !keepHandEdits && plan.leftover > 0;
  const current = ARRANGEMENTS.find((a) => a.id === style)!;

  const handNote = keepHandEdits ? (
    <p className="bk-note">
      <Info size={16} /> You changed some pages by hand, so this shows your pages. Picking an option here lays the book out again.
    </p>
  ) : null;
  const leftoverNote = leftover ? (
    <div className="bk-warn" role="status">
      <p>
        <AlertTriangle size={16} /> Our biggest book holds {plan.placed} of your {n} photos as {current.name}. The last {plan.leftover} would be left out.
      </p>
      {fits && fits !== style ? (
        <button type="button" className="bb-btn bb-btn-secondary" onClick={() => pick(fits)}>
          Fit all {n} as {ARRANGEMENTS.find((a) => a.id === fits)!.name}
        </button>
      ) : null}
    </div>
  ) : null;
  const stepper = (
    <div className="bk-stepper">
      <button type="button" onClick={fewer} disabled={atMin} aria-label="Fewer pages">
        <Minus size={18} />
      </button>
      <span aria-live="polite">
        {sheets * 2} pages <small>({sheets} sheets)</small>
      </span>
      <button type="button" onClick={more} disabled={atMax} aria-label="More pages">
        <Plus size={18} />
      </button>
    </div>
  );
  const finishes = (
    <div className="bk-seg" role="radiogroup" aria-label="Paper finish">
      {FINISHES.map((f) => (
        <button key={f.id} type="button" role="radio" aria-checked={state.finish === f.id} className={state.finish === f.id ? "on" : ""} onClick={() => set({ finish: f.id })}>
          {f.name}
        </button>
      ))}
    </div>
  );

  /* ── Phone: dark stage with the pages, white sheet with the choices ── */
  if (narrow) {
    return (
      <div className="bb-screen bk-phone">
        <PageRibbon
          pages={pages}
          photos={photos}
          theme={theme}
          title={state.title}
          occasion={occ}
          index={index}
          onIndex={setIndex}
          resetKey={bookKey}
          label="Your book, page by page"
        />
        <div className="bk-sheet">
          <span className="bk-grip" aria-hidden="true" />
          <div className="bk-sheet-head">
            <h1>Pick your book</h1>
            <span className="bk-price" aria-live="polite">
              {price}
            </span>
          </div>
          <div className="bk-seg bk-seg-wide" role="radiogroup" aria-label="How full the pages feel">
            {ARRANGEMENTS.map((a) => (
              <button key={a.id} type="button" role="radio" aria-checked={style === a.id && !keepHandEdits} className={style === a.id && !keepHandEdits ? "on" : ""} onClick={() => pick(a.id)}>
                {a.name}
              </button>
            ))}
          </div>
          {handNote}
          {!keepHandEdits ? (
            <div className="bk-fit">
              <span className={"bk-fit-line" + (fitLine(style).warn ? " warn" : "")}>
                {fitLine(style).text}
                {style === "classic" ? <i className="bk-pick">Our pick</i> : null}
              </span>
              <span>{current.line}</span>
            </div>
          ) : null}
          {leftoverNote}
          <button type="button" className="bk-disclose" onClick={() => setOpen(!open)} aria-expanded={open}>
            <span>{open ? "Hide pages and paper" : `Pages and paper: ${sheets * 2} pages, ${finish.name.toLowerCase()}`}</span>
            {open ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
          </button>
          {open ? (
            <div className="bk-more">
              <div className="bk-row">
                <span>
                  <b>Pages</b>
                  <small>2 more pages add {formatPKR(PRICE_LIST.extraSheetMinor)}</small>
                </span>
                {stepper}
              </div>
              <div className="bk-row">
                <span>
                  <b>Paper</b>
                  <small>Both cost the same</small>
                </span>
                {finishes}
              </div>
            </div>
          ) : null}
          <button type="button" className="bb-btn bb-btn-primary bb-btn-lg bk-go" onClick={commit}>
            Preview my book <ArrowRight size={18} />
          </button>
        </div>
      </div>
    );
  }

  /* ── Wide screens: choices left, the book right ── */
  const indicator = pos === 0 ? "Front cover" : `Pages ${pos * 2 - 1} and ${Math.min(pos * 2, pages.length)} of ${pages.length}`;
  return (
    <div className="bb-screen bk-wide">
      <div className="bk-choices">
        <div className="bk-choices-inner">
          <h1>Pick your book</h1>
          <p className="bb-sub">Every book is 12 x 12 in. Choose how full the pages feel. You can add pages after.</p>
          {handNote}
          <div className="bk-cards" role="radiogroup" aria-label="How full the pages feel">
            {ARRANGEMENTS.map((a) => {
              const on = style === a.id && !keepHandEdits;
              const fl = fitLine(a.id);
              const sh = a.id === style ? sheets : sheetRange(n, a.id).min;
              return (
                <button key={a.id} type="button" role="radio" aria-checked={on} className={"bk-card" + (on ? " on" : "")} onClick={() => pick(a.id)}>
                  <span className="bk-card-top">
                    <b>{a.name}</b>
                    {a.id === "classic" ? <i className="bk-pick">Our pick</i> : null}
                    <span className="bk-card-price">{formatPKR(unitPrice(sh))}</span>
                  </span>
                  <span className="bk-card-line">{a.line}</span>
                  <span className={"bk-fit-line" + (fl.warn ? " warn" : "")}>{fl.text}</span>
                </button>
              );
            })}
          </div>
          {leftoverNote}
          <div className="bk-field">
            <span className="bk-label">Pages</span>
            {stepper}
            <span className="bk-help">{pagesNote}</span>
          </div>
          <div className="bk-field">
            <span className="bk-label">Paper finish</span>
            {finishes}
            <span className="bk-help">{finish.blurb}. Both cost the same.</span>
          </div>
          <div className="bk-actions">
            <button type="button" className="bb-btn bb-btn-primary bb-btn-lg" onClick={commit}>
              Preview my book <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </div>
      <div className="bk-stage">
        <div className="bk-book">
          <button className="bb-arrow" disabled={pos === 0} onClick={() => api.current?.prev()} aria-label="Previous pages">
            <ChevronLeft size={22} />
          </button>
          <Book3D
            spreads={spreads}
            pos={Math.min(pos, spreads.length)}
            onPos={setPos}
            apiRef={api}
            theme={theme}
            coverStyle={state.coverStyle}
            title={state.title}
            occasion={occ}
            photos={photos}
          />
          <button className="bb-arrow" disabled={pos >= spreads.length} onClick={() => api.current?.next()} aria-label="Next pages">
            <ChevronRight size={22} />
          </button>
        </div>
        <p className="bk-where" aria-live="polite">
          {indicator}
        </p>
        {!keepHandEdits ? (
          <p className="bk-facts">
            {plan.placed} photos on {pages.length} pages. Every photo sits in a slot of its own shape, and none loses more than{" "}
            {Math.round(Math.max(plan.stats.maxCrop, 0.01) * 100)}% at its edges.
            {plan.stats.shrunk ? ` ${plan.stats.shrunk === 1 ? "One small photo is" : `${plan.stats.shrunk} small photos are`} printed smaller to stay sharp.` : ""}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** The spine's colours and lettering for a book (used by the phone ribbon's cover). */
export function spineOf(state: BuilderState) {
  const theme = bookTheme(state.themeId, state.pageColor);
  return { bg: shiftColor(theme.page, theme.dark ? -0.06 : -0.05), ink: theme.ink, font: fontById(state.fontId).display };
}
