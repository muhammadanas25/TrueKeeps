/**
 * BookScreen — step 5 of 7: "Pick your book".
 *
 * What: ONE choice, how full the pages feel (Story, Classic or Family
 * Album), then the book size and the paper. The book on the stage is laid
 * out live by the engine (arrange.ts) for the customer's own photos, so
 * every tap shows what they would actually get and what it costs.
 *
 * Rules the owner set (2026-11-16, revised 2026-11-22):
 *  - one choice, not two groups of options
 *  - nothing is shown that can't be chosen. An arrangement only appears when
 *    it makes a different book from the one before it: with 10 photos every
 *    arrangement gives the same 10 pages, so only Story shows, with a note on
 *    how many more photos unlock the next one (visibleArrangements())
 *  - no pages control here any more (2026-11-22): the book takes the fewest
 *    sheets that hold every photo; pages can be added in the editor
 *  - the paper finish stays
 *  - "Our pick" on Classic is a recommendation, not a sales claim
 *
 * Layout: on a wide screen, the choices on the left and the 3-D book on the
 * right. On a phone ("Option C", owner's pick 2026-11-17), the book fills a
 * dark stage one page at a time (PageRibbon) and the choices sit in a white
 * sheet under it, as the same picture cards as desktop (2026-11-22).
 *
 * Phone, book first (owner, 2026-11-28, canvas board A1): the sheet opens as
 * before; tapping a layout tucks it into a short bar after a moment so the
 * book fills the screen with that layout. The bar keeps the choice, its price,
 * the finish and Continue; "Change layout" or the handle brings the sheet back
 * exactly as it was (board A2 dropped: no bigger sheet). It never tucks by
 * itself while a warning needs reading (photos left out) or while the
 * customer's own edited pages are showing.
 *
 * The laid-out pages are written to the book only on "Continue". If
 * the customer changed pages by hand (Customize) and came back here, their
 * pages are kept until they change a choice, and a note says so.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, ChevronLeft, ChevronRight, ChevronUp, ImagePlus, Info } from "lucide-react";
import { FINISHES, PRICE_LIST, formatPKR, quote } from "@shared/pricing";
import { Book3D, GridWire, Ph, shiftColor, type Book3DApi } from "../book";
import { ARRANGEMENTS, arrangeBook, arrangementOf, arrangementThatFits, densityOf, sheetRange, type ArrangementId } from "../arrange";
import { bookPhotos, occasionById, toSpreads, type PageFrame } from "../data";
import { fontById } from "../looks";
import { bookTheme } from "../palette";
import { PageRibbon } from "../PageRibbon";
import type { BuilderState } from "../state";
import { useNarrow } from "../useNarrow";
import { SheetGrip } from "../SheetGrip";
import "../flow.css";

/** The line under "Pick a finish" (website copy v1, 2026-11-26). */
const FINISH_LINE: Record<string, string> = {
  matte: "A soft, classic look. No reflections. Same price.",
  glossy: "Bright and shiny. Both cost the same.",
};

/** A typical spread of each arrangement (engine templates L1+P1, L1S3+PLL3, P6+L6), as page fractions. */
const f = (x: number, y: number, w: number, h: number): PageFrame => ({ x, y, w, h });
const SAMPLE_SPREADS: Record<ArrangementId, [PageFrame[], PageFrame[]]> = {
  story: [[f(0.042, 0.195, 0.917, 0.611)], [f(0.208, 0.063, 0.583, 0.875)]],
  classic: [
    [f(0.042, 0.042, 0.917, 0.611), f(0.042, 0.673, 0.292, 0.285), f(0.354, 0.673, 0.292, 0.285), f(0.667, 0.673, 0.292, 0.285)],
    [f(0.042, 0.178, 0.429, 0.643), f(0.491, 0.178, 0.467, 0.311), f(0.491, 0.51, 0.467, 0.311)],
  ],
  family: [
    [0.042, 0.354, 0.667].flatMap((x) => [f(x, 0.042, 0.292, 0.448), f(x, 0.51, 0.292, 0.448)]),
    [0.042, 0.354, 0.667].flatMap((y) => [f(0.042, y, 0.448, 0.292), f(0.51, y, 0.448, 0.292)]),
  ],
};

/** Fewest photos that make a book: the smallest book has 10 pages, one photo each at least. */
export const MIN_PHOTOS = PRICE_LIST.includedSheets * 2;

const unitPrice = (sheets: number) => quote({ binding: "hardcover", qty: 1, printedPages: sheets * 2 }).unitMinor;

/**
 * The arrangements worth offering for `n` photos, in order, and the next one
 * still locked with how many more photos would unlock it.
 *
 * An arrangement makes a different book from the one before it only once the
 * one before needs more than the smallest book: below that both lay the same
 * photos on the same 10 pages. With today's arrangements that is Classic from
 * 21 photos and Family Album from 41 (owner approved, 2026-11-22), but it is
 * worked out from the engine so it follows any change to the arrangements.
 */
export function visibleArrangements(n: number): { shown: ArrangementId[]; next: { id: ArrangementId; more: number } | null } {
  const shown: ArrangementId[] = [ARRANGEMENTS[0].id];
  const opens = (prev: ArrangementId, m: number) => sheetRange(m, prev).min > PRICE_LIST.includedSheets;
  for (let i = 1; i < ARRANGEMENTS.length; i++) {
    const prev = ARRANGEMENTS[i - 1].id;
    if (opens(prev, n)) {
      shown.push(ARRANGEMENTS[i].id);
      continue;
    }
    let m = n + 1;
    while (!opens(prev, m) && m < 1000) m++;
    return { shown, next: { id: ARRANGEMENTS[i].id, more: m - n } };
  }
  return { shown, next: null };
}

export function BookScreen({
  state,
  set,
  onPreview,
  onPhotos,
  onSave,
}: {
  state: BuilderState;
  set: (patch: Partial<BuilderState>) => void;
  onPreview: () => void;
  onPhotos: () => void;
  /** guests only: opens "Save this book to your account" */
  onSave?: () => void;
}) {
  const narrow = useNarrow();
  const occ = occasionById(state.occasion);
  const theme = bookTheme(state.themeId, state.pageColor);
  // The book's photos: the ones taken out in an editor stay out (bookPhotos).
  const photos = useMemo(() => bookPhotos(state), [state.photos, state.removedPhotoIds]);
  const n = photos.length;
  const takenOut = state.photos.filter((p) => state.removedPhotoIds.includes(p.id));
  const vis = visibleArrangements(n);
  // A book still set to an arrangement that isn't offered (the default is
  // Classic) shows, and orders, the fullest one that is.
  const asked = arrangementOf(state.density);
  const style: ArrangementId = vis.shown.includes(asked) ? asked : vis.shown[vis.shown.length - 1];
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
    // always the fewest sheets that hold every photo: step 5 has no pages control (2026-11-22)
    () => arrangeBook(photos, style, null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [photoKey, style],
  );
  const pages = keepHandEdits ? state.pages : plan.pages;
  const sheets = keepHandEdits ? Math.ceil(state.pages.length / 2) : plan.sheets;
  const bookKey = keepHandEdits ? "hand" : style + "|" + plan.sheets;
  const spreads = useMemo(() => toSpreads(pages), [pages]);

  // The open spread can't be past the end of a book that just got shorter.
  useEffect(() => {
    // spreads.length + 1 is the back cover (Book3D's last stop)
    if (pos > spreads.length + 1) setPos(Math.max(1, spreads.length));
  }, [spreads.length, pos]);

  // phone only: the choices tuck down so the book can be big (see the header)
  const [tucked, setTucked] = useState(false);
  const tuckTimer = useRef<ReturnType<typeof setTimeout>>();
  const holdOpen = useRef(false);
  useEffect(() => () => clearTimeout(tuckTimer.current), []);

  const choose = (patch: Partial<BuilderState>) => {
    setTouched(true);
    set(patch);
    setPos(1);
  };
  const pick = (id: ArrangementId) => {
    choose({ density: densityOf(id), sheets: null });
    if (!narrow) return;
    clearTimeout(tuckTimer.current);
    // long enough to see the card light up; skipped if a warning appeared
    tuckTimer.current = setTimeout(() => {
      if (!holdOpen.current) setTucked(true);
    }, 650);
  };
  const fits = arrangementThatFits(n);
  const price = formatPKR(unitPrice(sheets));

  const putBack = () => {
    setTouched(true);
    set({ removedPhotoIds: [] });
    setPos(1);
  };

  const commit = () => {
    if (!keepHandEdits) set({ pages: plan.pages, pagesEdited: false, sheets: plan.sheets, density: densityOf(style) });
    onPreview();
  };

  if (n < MIN_PHOTOS) {
    return (
      <div className="bb-screen bk-locked">
        <ImagePlus size={36} strokeWidth={1.5} />
        <h1>Add a few more photos</h1>
        <p>
          The smallest album has {MIN_PHOTOS} pages, so it needs at least {MIN_PHOTOS} photos. You have {n} so far.
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
    if (r.holds < n) return { text: `Our biggest album holds ${r.holds} of your ${n} photos this way`, warn: true };
    return { text: `Fits your ${n} photos in ${sh * 2} pages`, warn: false };
  };
  const leftover = !keepHandEdits && plan.leftover > 0;
  holdOpen.current = leftover;
  const canTuck = !keepHandEdits && !leftover;
  const current = ARRANGEMENTS.find((a) => a.id === style)!;
  const shownArrangements = ARRANGEMENTS.filter((a) => vis.shown.includes(a.id));
  // how to unlock the next arrangement, instead of a choice that changes nothing
  const unlockNote = vis.next ? (
    <p className="bk-unlock" role="note">
      <Info size={16} />
      <span>
        {vis.shown.length === 1 ? `With ${n} photos there's one layout. ` : ""}
        <b>
          Add {vis.next.more} more {vis.next.more === 1 ? "photo" : "photos"}
        </b>{" "}
        to choose {ARRANGEMENTS.find((a) => a.id === vis.next!.id)!.name} ({ARRANGEMENTS.find((a) => a.id === vis.next!.id)!.line.split(".")[0].toLowerCase()}).
      </span>
    </p>
  ) : null;
  const card = (a: (typeof ARRANGEMENTS)[number], small: boolean) => {
    const on = style === a.id && !keepHandEdits;
    const fl = fitLine(a.id);
    const sh = a.id === style ? sheets : sheetRange(n, a.id).min;
    return (
      <button key={a.id} type="button" role="radio" aria-checked={on} className={"bk-card" + (on ? " on" : "") + (small ? " sm" : "")} onClick={() => pick(a.id)}>
        <span className="bk-card-top">
          {/* a typical spread of this arrangement, so the difference shows before the tap */}
          <span className="bk-card-art" aria-hidden="true">
            <GridWire frames={SAMPLE_SPREADS[a.id][0]} />
            <GridWire frames={SAMPLE_SPREADS[a.id][1]} />
          </span>
          <b>{a.name}</b>
          {a.id === "classic" && vis.shown.length > 1 ? <i className="bk-pick">Our pick</i> : null}
          <span className="bk-card-price">{formatPKR(unitPrice(sh))}</span>
        </span>
        {small ? null : <span className="bk-card-line">{vis.shown.length === 1 && a.id === "story" && n <= sh * 2 ? "One photo on each page." : a.line}</span>}
        <span className={"bk-fit-line" + (fl.warn ? " warn" : "")}>{fl.text}</span>
      </button>
    );
  };

  const handNote = keepHandEdits ? (
    <p className="bk-note">
      <Info size={16} /> You changed some pages by hand, so this shows your pages. Picking an option here lays the album out again.
    </p>
  ) : null;
  // Photos taken out in an editor stay out; this says so, with the way back.
  const outNote = takenOut.length ? (
    <div className="bk-out" role="status">
      <span className="bk-out-thumbs" aria-hidden="true">
        {takenOut.slice(0, 3).map((p) => (
          <span key={p.id}>
            <Ph photo={p} theme={theme} showLabel={false} variant="thumb" />
          </span>
        ))}
      </span>
      <span className="bk-out-text">
        You took {takenOut.length === 1 ? "1 photo" : `${takenOut.length} photos`} out of the album. {takenOut.length === 1 ? "It stays" : "They stay"} out, whatever you pick here.
      </span>
      <button type="button" className="bb-btn bb-btn-secondary" onClick={putBack}>
        Put {takenOut.length === 1 ? "it" : "them"} back
      </button>
    </div>
  ) : null;
  // Guests can save the book to an account from here; it never pops up by itself.
  const saveLink = onSave ? (
    <p className="bk-save">
      Save this album to come back later.{" "}
      <button type="button" onClick={onSave}>
        Sign in
      </button>
    </p>
  ) : null;
  const leftoverNote = leftover ? (
    <div className="bk-warn" role="status">
      <p>
        <AlertTriangle size={16} /> Our biggest album holds {plan.placed} of your {n} photos as {current.name}. The last {plan.leftover} would be left out.
      </p>
      {fits && fits !== style ? (
        <button type="button" className="bb-btn bb-btn-secondary" onClick={() => pick(fits)}>
          Fit all {n} as {ARRANGEMENTS.find((a) => a.id === fits)!.name}
        </button>
      ) : null}
    </div>
  ) : null;
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
          label="Your album, page by page"
        />
        {canTuck && tucked ? (
          <div className="bk-sheet bk-tucked" role="region" aria-label="Your choices">
            <SheetGrip tucked onTuck={() => setTucked(true)} onOpen={() => setTucked(false)} />
            <div className="bk-tuck-row">
              <span className="bk-card-art" aria-hidden="true">
                <GridWire frames={SAMPLE_SPREADS[style][0]} />
                <GridWire frames={SAMPLE_SPREADS[style][1]} />
              </span>
              <span className="bk-tuck-name">
                <b>{current.name}</b>
                <span className={"bk-fit-line" + (fitLine(style).warn ? " warn" : "")}>{fitLine(style).text}</span>
              </span>
              <span className="bk-price" aria-live="polite">
                {price}
              </span>
            </div>
            <div className="bk-tuck-row">
              <button type="button" className="bb-btn bb-btn-secondary bk-change" onClick={() => setTucked(false)} aria-expanded={false}>
                Change layout <ChevronUp size={16} />
              </button>
              {finishes}
            </div>
            <button type="button" className="bb-btn bb-btn-primary bb-btn-lg bk-go" onClick={commit}>
              Continue <ArrowRight size={18} />
            </button>
          </div>
        ) : (
        <div className="bk-sheet">
          {canTuck ? <SheetGrip tucked={false} onTuck={() => setTucked(true)} onOpen={() => setTucked(false)} /> : <span className="bk-grip" aria-hidden="true" />}
          <div className="bk-sheet-head">
            <h1>How should your photos sit?</h1>
            <span className="bk-price" aria-live="polite">
              {price}
            </span>
          </div>
          {handNote}
          {outNote}
          <div className="bk-cards" role="radiogroup" aria-label="How full the pages feel">
            {shownArrangements.map((a) => card(a, true))}
          </div>
          {unlockNote}
          {leftoverNote}
          <div className="bk-row bk-paper">
            <span>
              <b>Pick a finish</b>
              <small>{FINISH_LINE[state.finish]}</small>
            </span>
            {finishes}
          </div>
          <button type="button" className="bb-btn bb-btn-primary bb-btn-lg bk-go" onClick={commit}>
            Continue <ArrowRight size={18} />
          </button>
          {saveLink}
        </div>
        )}
      </div>
    );
  }

  /* ── Wide screens: choices left, the book right ── */
  const indicator =
    pos === 0 ? "Front cover" : pos === spreads.length + 1 ? "Back cover" : `Pages ${pos * 2 - 1} and ${Math.min(pos * 2, pages.length)} · ${pages.length} in total`;
  return (
    <div className="bb-screen bk-wide">
      <div className="bk-choices">
        <div className="bk-choices-inner">
          <h1>How should your photos sit?</h1>
          <p className="bb-sub">Choose the look. We'll work out the pages for you.</p>
          {handNote}
          {outNote}
          <div className="bk-cards" role="radiogroup" aria-label="How full the pages feel">
            {shownArrangements.map((a) => card(a, false))}
          </div>
          {unlockNote}
          {leftoverNote}
          <div className="bk-field">
            <span className="bk-label">Pick a finish</span>
            {finishes}
            <span className="bk-help">{FINISH_LINE[state.finish]}</span>
          </div>
          <div className="bk-actions">
            <button type="button" className="bb-btn bb-btn-primary bb-btn-lg" onClick={commit}>
              Continue <ArrowRight size={18} />
            </button>
            {saveLink}
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
            pos={Math.min(pos, spreads.length + 1)}
            onPos={setPos}
            apiRef={api}
            theme={theme}
            coverStyle={state.coverStyle}
            title={state.title}
            occasion={occ}
            photos={photos}
          />
          <button className="bb-arrow" disabled={pos >= spreads.length + 1} onClick={() => api.current?.next()} aria-label="Next pages">
            <ChevronRight size={22} />
          </button>
        </div>
        <p className="bk-where" aria-live="polite">
          {indicator}
        </p>
        {!keepHandEdits ? <p className="bk-facts">Tap each style above and flip through to compare how your photos look.</p> : null}
      </div>
    </div>
  );
}

/** The spine's colours and lettering for a book (used by the phone ribbon's cover). */
export function spineOf(state: BuilderState) {
  const theme = bookTheme(state.themeId, state.pageColor);
  return { bg: shiftColor(theme.page, theme.dark ? -0.06 : -0.05), ink: theme.ink, font: fontById(state.fontId).display };
}
