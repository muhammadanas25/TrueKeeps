/**
 * ComposeScreen — steps 3 and 4 of 7, shown while photos upload:
 *   step 3 "Pick the feel" (qstep 0): Minimal, Full Picture or Truekeeps Design
 *   step 4 "Name your book" (qstep 1): title, an optional line under it, and
 *   the lettering. With Full Picture the title goes on the spine only.
 * (Until 2026-11-17 there was a colours question between the two; the
 * owner's flow has none, and colours stay in the editor and on the preview.)
 *
 * Why it exists: an HD upload on mobile data can take many minutes, and there's
 * nothing a progress screen can do about that. So there's no waiting screen.
 * The moment photos are chosen, the customer is asked three small things about
 * their book, each visibly changing it, using their own photo. The upload is
 * happening beside that rather than in front of it.
 *
 * Layout: question on the left, the book on the right, as in the owner's mock.
 * The stage starts with a line for the occasion and their photos, and the book
 * replaces them on the first pick. On phones the order is book, question, then
 * progress: the question has to be answerable without scrolling, and the nav's
 * counter and the thickening book already show that things are moving.
 *
 * The answers are ordinary builder state, so nothing here is lost or special:
 * the same choices can be changed later in Customize.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, Info, X } from "lucide-react";
import { CoverFace, Ph } from "../book";
import { bookPhotos, coverHasPhoto, coverPhotoIdFor, generatePages, occasionById, FEEL_CHOICES, isFeelChoice, LINE_MAX, TITLE_MAX, type CopyVoice } from "../data";
import { CoverPhotoPicker, CoverPhotoRow } from "../CoverPhotoPicker";
import { pickerFonts } from "../looks";
import "../flow.css";
import { bookTheme } from "../palette";
import type { BuilderState } from "../state";
import { TKLogo } from "@/features/landing/primitives";
import { uploadEngine } from "../upload/engine";
import { LiveBook } from "../upload/LiveBook";
import { hasImage, photoSrc } from "../upload/previews";
import { noticeLines, tipFor } from "../upload/tips";
import { useUploads } from "../upload/UploadContext";
import { flaggedPhotos } from "../quality";
import { TipLine } from "../upload/UploadStatus";

/** The stage's opening line: the same for every occasion (website copy v1, 2026-11-26). */
const STAGE = { line: "Your photos, finally in one place.", small: "Keep going. Your album is almost ready to preview." };

/** "{n} letters left" under the step 4 fields (website copy v1). */
const lettersLeft = (n: number) => (n <= 0 ? "That's the most that fits." : `${n} ${n === 1 ? "letter" : "letters"} left`);

/** Thin at the start, approaching the width the finished book's page count gives it. */
function bookThickness(pages: number, fraction: number): number {
  const finished = 0.05 + 0.09 * Math.min(1, pages / 100);
  return 0.012 + (finished - 0.012) * fraction;
}

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * As each photo lands, its thumbnail slips into the edge of the book. Capped to
 * one every 700ms: on a fast connection photos land faster than that, and a
 * steady rhythm reads as calm where a flurry reads as noise. Skipped entirely
 * when the customer has asked for less motion or the tab is hidden.
 */
function useArrivals(stageRef: React.RefObject<HTMLDivElement | null>, thumbFor: (id: string) => string | undefined, enabled: boolean) {
  const last = useRef(0);
  const side = useRef(1);
  useEffect(() => {
    if (!enabled) return;
    return uploadEngine.onLanded((id) => {
      // Measured against the whole screen: on phones the book and the status
      // sit in separate parts of the page, and the stage has no box of its own.
      const stage = stageRef.current?.closest<HTMLElement>(".ck-compose");
      const src = thumbFor(id);
      const now = performance.now();
      if (!stage || !src || now - last.current < 700 || document.visibilityState !== "visible" || reducedMotion()) return;
      last.current = now;
      side.current = -side.current;
      const book = stage.querySelector<HTMLElement>(".ck-scene");
      if (!book) return;
      const s = stage.getBoundingClientRect();
      const b = book.getBoundingClientRect();
      const size = 84;
      const img = document.createElement("img");
      img.src = src;
      img.alt = "";
      img.className = "ck-flyer";
      img.style.width = img.style.height = `${size}px`;
      stage.appendChild(img);
      // into the page block on the book's right-hand edge
      const endX = b.left - s.left + b.width * 0.97 - size / 2;
      const endY = b.top - s.top + b.height * 0.5 - size / 2;
      const startX = endX + side.current * Math.min(90, s.width * 0.18);
      const startY = Math.max(8, endY - b.height * 0.62);
      const flight = img.animate(
        [
          { transform: `translate(${startX}px, ${startY}px) rotate(${side.current * 7}deg) scale(0.92)`, opacity: 0 },
          { transform: `translate(${startX}px, ${startY + 8}px) rotate(${side.current * 5}deg) scale(1)`, opacity: 1, offset: 0.25 },
          { transform: `translate(${endX}px, ${endY}px) rotate(0deg) scale(0.3)`, opacity: 1, offset: 0.8 },
          { transform: `translate(${endX - 4}px, ${endY}px) rotate(0deg) scale(0.16)`, opacity: 0 },
        ],
        { duration: 900, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
      );
      flight.onfinish = flight.oncancel = () => img.remove();
    });
  }, [enabled, stageRef, thumbFor]);
}

/**
 * What's happening with the upload, in plain words, under the book.
 *
 * Only what the customer did: how many of their photos are in the album.
 * The full-quality copies we print from keep uploading in the background
 * without a status of their own (owner, 2026-11-26); checkout waits for them
 * and says so there, the one place it matters.
 */
function UploadProgressNote() {
  const { progress, snapshot } = useUploads();
  const { total, inBook } = progress;
  const allIn = inBook >= total;
  const notices = useMemo(() => {
    const lines = noticeLines(snapshot.notices);
    if (snapshot.duplicates) {
      lines.push(snapshot.duplicates === 1 ? "One photo was already in your album, so we left it out." : `${snapshot.duplicates} photos were already in your album, so we left them out.`);
    }
    return lines;
  }, [snapshot.notices, snapshot.duplicates]);

  // Screen readers get a milestone rather than every single photo.
  const milestone = allIn ? "All your photos are added." : `${Math.floor((inBook / Math.max(1, total)) * 10) * 10} percent of your photos are in.`;

  return (
    <div className="ck-progress">
      <span className="ck-sr" role="status">
        {milestone}
      </span>
      {allIn ? (
        <p className="ck-count done">
          <Check size={16} strokeWidth={2.6} /> Done. All {total} photos added.
        </p>
      ) : (
        <>
          <p className="ck-count">
            <b>{inBook}</b> of {total} photos added
          </p>
          <div className="ck-rail" aria-hidden="true">
            <i style={{ transform: `scaleX(${inBook / Math.max(1, total)})` }} />
          </div>
          <TipLine lineFor={(n) => tipFor(n, inBook / Math.max(1, total), notices)} />
        </>
      )}
      {snapshot.offline ? (
        <p className="ck-hd warn">
          Waiting for a connection. We'll carry on by ourselves.{" "}
          <button type="button" onClick={() => uploadEngine.retryNow()}>
            Try now
          </button>
        </p>
      ) : null}
      {snapshot.rejected.length ? (
        <div className="ck-rejected" role="alert">
          <p>
            We couldn't open {snapshot.rejected.length === 1 ? snapshot.rejected[0] : `${snapshot.rejected.length} files`}, so{" "}
            {snapshot.rejected.length === 1 ? "it isn't" : "they aren't"} in your album.
          </p>
          <button type="button" aria-label="Dismiss" onClick={() => uploadEngine.dismissRejected()}>
            <X size={15} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function ComposeScreen({
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
  const step = state.qstep;
  const occ = occasionById(state.occasion);
  const theme = bookTheme(state.themeId, state.pageColor);
  const picked = isFeelChoice(state.coverStyle);
  const title = state.title;
  const previewTitle = title.trim() || occ.suggestedTitle;
  const stageRef = useRef<HTMLDivElement>(null);
  const { progress } = useUploads();
  const [picking, setPicking] = useState(false);
  const coverId = coverPhotoIdFor(state);

  const photosRef = useRef(state.photos);
  photosRef.current = state.photos;
  const thumbFor = useRef((id: string) => {
    const photo = photosRef.current.find((p) => p.id === id);
    return photo ? photoSrc(photo, "thumb") : undefined;
  }).current;
  useArrivals(stageRef, thumbFor, picked);

  const pageCount = useMemo(() => generatePages(bookPhotos(state), state.density).length, [state.photos, state.removedPhotoIds, state.density]);
  // only photos that are ready: an empty placeholder among them looks broken
  const prints = state.photos.filter(hasImage).slice(0, 4);
  const stage = STAGE;
  const flagged = useMemo(() => flaggedPhotos(state.photos).size, [state.photos]);

  const next = () => {
    if (step < 1) set({ qstep: 1 });
    else onDone();
  };
  // The line under the title prints only what the customer types (owner,
  // 2026-11-21): an example date sitting in the field would print by accident.
  // A book started before that has null here and keeps its occasion line.
  const subtitle = state.subtitle ?? (state.pages.length ? occ.subtitle : "");
  useEffect(() => {
    if (state.subtitle === null && !state.pages.length) set({ subtitle: "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.subtitle, state.pages.length]);

  return (
    <div className="bb-screen ck-compose">
      <div className="ck-questions">
        <div className="ck-questions-inner">
          {/* the question is the heading (owner, 2026-11-21) */}
          <h1>{step === 0 ? "Pick a cover style" : "Give your album a name"}</h1>
          <p className="bb-sub">{step === 0 ? "Pick the one that feels right. You can always switch later." : "This is how your album will be known on the shelf."}</p>

          {step === 0 ? (
            <div className="bb-qstep" key="feel">
              <div className="ck-feels" role="radiogroup" aria-label="Cover style">
                {FEEL_CHOICES.map((f) => {
                  const on = state.coverStyle === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      className={"ck-feel" + (on ? " on" : "")}
                      onClick={() => set({ coverStyle: f.id })}
                    >
                      <span className="ck-feel-cover" aria-hidden="true">
                        <CoverFace theme={theme} coverStyle={f.id} title={previewTitle} occasion={occ} photos={state.photos} />
                        {on ? (
                          <span className="ck-feel-tick">
                            <Check size={13} strokeWidth={3} />
                          </span>
                        ) : null}
                      </span>
                      <span className="ck-feel-text">
                        <b>{f.name}</b>
                        <i>{f.line}</i>
                      </span>
                    </button>
                  );
                })}
              </div>
              {picked && coverHasPhoto(state.coverStyle) ? (
                <div className="ck-coverphoto">
                  <CoverPhotoRow
                    photo={state.photos.find((p) => p.id === coverId)}
                    chosen={state.coverPhotoId !== null}
                    theme={theme}
                    onOpen={() => setPicking(true)}
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          {step === 1 ? (
            <div className="bb-qstep" key="name">
              <label className="ck-field">
                <span>Album title</span>
                <input
                  className="bb-title-input"
                  value={title}
                  maxLength={TITLE_MAX}
                  onChange={(e) => set({ title: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && title.trim()) onDone();
                  }}
                  placeholder={occ.suggestedTitle}
                />
                <span className={"ck-count" + (title.length >= TITLE_MAX ? " full" : "")} aria-live="polite">
                  {lettersLeft(TITLE_MAX - title.length)}
                </span>
              </label>
              <label className="ck-field">
                <span>
                  Add a date or place <i>(optional)</i>
                </span>
                <input
                  className="bb-title-input"
                  value={subtitle}
                  maxLength={LINE_MAX}
                  onChange={(e) => set({ subtitle: e.target.value })}
                  placeholder="e.g. A date, a place, or a few words"
                />
                <span className={"ck-count" + (subtitle.length >= LINE_MAX ? " full" : "")} aria-live="polite">
                  {lettersLeft(LINE_MAX - subtitle.length)}
                </span>
              </label>
              <div className="ck-field">
                <span id="ck-lettering">Pick a font style</span>
                <div className="ck-fonts" role="radiogroup" aria-labelledby="ck-lettering">
                  {pickerFonts(state.fontId).map((f) => {
                    const on = state.fontId === f.id;
                    return (
                      <button key={f.id} type="button" role="radio" aria-checked={on} className={"ck-font" + (on ? " on" : "")} title={f.bestFor} onClick={() => set({ fontId: f.id })}>
                        <b style={{ fontFamily: f.display, fontWeight: f.weight }}>{f.name}</b>
                        <i style={{ fontFamily: f.caption, fontWeight: f.captionWeight, fontStyle: f.captionItalic ? "italic" : "normal" }}>{previewTitle}</i>
                      </button>
                    );
                  })}
                </div>
              </div>
              {state.coverStyle === "moment" ? (
                <p className="ck-spine-note">
                  <Info size={16} /> Your title will appear on the spine. The front cover stays photo only.
                </p>
              ) : (
                <p className="bb-hint">{copy.titleHint}</p>
              )}
            </div>
          ) : null}

          <div className="ck-actions">
            <button type="button" className="bb-btn bb-btn-primary bb-btn-lg" disabled={step === 0 ? !picked : !title.trim()} onClick={next}>
              Continue <ArrowRight size={18} />
            </button>
            <div className="bb-dots" aria-label={`Question ${step + 1} of 2`}>
              {([0, 1] as const).map((i) => (
                <button
                  key={i}
                  type="button"
                  className={"bb-dot" + (step === i ? " on" : "")}
                  disabled={i > step}
                  onClick={() => set({ qstep: i })}
                  aria-label={"Question " + (i + 1)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="ck-stage" ref={stageRef}>
        {picked ? (
          <LiveBook
            cover={<CoverFace theme={theme} coverStyle={state.coverStyle} title={previewTitle} occasion={occ} photos={state.photos} />}
            back={<TKLogo size={14} theme={theme.dark ? "dark" : "light"} />}
            spine={previewTitle}
            page={theme.page}
            ink={theme.ink}
            thickness={bookThickness(pageCount, progress.total ? progress.inBook / progress.total : 0)}
            label={`Your book, ${previewTitle}. Drag or use the arrow keys to turn it.`}
          />
        ) : (
          <div className="ck-opening">
            {prints.map((p, i) => (
              <div className={`ck-print ck-print-${i}`} key={p.id} aria-hidden="true">
                <Ph photo={p} theme={theme} showLabel={false} variant="thumb" />
              </div>
            ))}
            <blockquote>{stage.line}</blockquote>
            <p>{stage.small}</p>
          </div>
        )}
        <UploadProgressNote />
        {flagged ? (
          <p className="ck-lowq" role="status">
            <Info size={16} />
            <span>
              {flagged === 1 ? "1 photo is" : `${flagged} photos are`} low in quality and may not print sharp.{" "}
              {/* step 2 shows which ones, with a remove button on each */}
              <button type="button" className="bb-inline-link" onClick={() => set({ screen: "upload" })}>
                See and replace
              </button>
            </span>
          </p>
        ) : null}
      </div>
      {picking ? (
        <CoverPhotoPicker
          photos={state.photos}
          removedPhotoIds={state.removedPhotoIds}
          current={state.coverPhotoId}
          coverStyle={state.coverStyle}
          theme={theme}
          onPick={(id) => {
            set({ coverPhotoId: id });
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      ) : null}
    </div>
  );
}
