/**
 * ComposeScreen — "Let's make your book", shown while photos upload.
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
import { ArrowRight, Check, X } from "lucide-react";
import { CoverFace, Ph } from "../book";
import { generatePages, occasionById, VIBES, themeById, FEEL_CHOICES, isFeelChoice, type CopyVoice } from "../data";
import { bookTheme } from "../palette";
import type { BuilderState } from "../state";
import { TKLogo } from "@/features/landing/primitives";
import { uploadEngine } from "../upload/engine";
import { LiveBook } from "../upload/LiveBook";
import { hasImage, photoSrc } from "../upload/previews";
import { formatEta, noticeLines, tipFor } from "../upload/tips";
import { useUploads } from "../upload/UploadContext";
import { TipLine } from "../upload/UploadStatus";

/** The stage's opening line for each occasion, from the owner's mock and tips. */
const STAGE_LINES: Record<string, { line: string; small: string }> = {
  travel: { line: "The trip is over. The story doesn't have to be.", small: "Bring every stop home, in one book you can hold." },
  birthday: { line: "They'll only be this little once.", small: "Keep this year somewhere they can hold it, not buried in your phone." },
  baby: { line: "The first year goes by so fast.", small: "Hold on to the tiny days. One book, for them to open when they're grown." },
  wedding: { line: "Someday, someone small will point at a photo and ask, “Who's that?”", small: "Put your day in one place you can open, again and again." },
  mix: { line: "Remember Nani's old albums? You're making the next one.", small: "The stories behind these photos deserve to outlive our phones." },
};

/** "Our special design, made just for …" */
const SIGNATURE_FOR: Record<string, string> = {
  travel: "travel",
  birthday: "birthdays",
  baby: "new babies",
  wedding: "weddings",
  mix: "all your moments",
};

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

/** What's happening with the upload, in plain words, under the book. */
function UploadProgressNote() {
  const { progress, snapshot } = useUploads();
  const { total, inBook, hdDone } = progress;
  const allIn = inBook >= total;
  const allHd = hdDone >= total;
  const notices = useMemo(() => {
    const lines = noticeLines(snapshot.notices);
    if (snapshot.duplicates) {
      lines.push(snapshot.duplicates === 1 ? "One photo was already in your book, so we left it out." : `${snapshot.duplicates} photos were already in your book, so we left them out.`);
    }
    return lines;
  }, [snapshot.notices, snapshot.duplicates]);

  // Screen readers get a milestone rather than every single photo.
  const milestone = allHd
    ? "All your photos are saved."
    : allIn
      ? "All your photos are in your book. Saving full-quality copies."
      : `${Math.floor((inBook / Math.max(1, total)) * 10) * 10} percent of your photos are in.`;

  return (
    <div className="ck-progress">
      <span className="ck-sr" role="status">
        {milestone}
      </span>
      {allHd ? (
        <p className="ck-count done">
          <Check size={16} strokeWidth={2.6} /> All {total} photos are safely saved, ready to print.
        </p>
      ) : (
        <>
          <p className={"ck-count" + (allIn ? " done" : "")}>
            {allIn ? (
              <>
                <Check size={16} strokeWidth={2.6} /> All {total} photos are in your book
              </>
            ) : (
              <>
                <b>{inBook}</b> of {total} photos are in your book
              </>
            )}
          </p>
          <div className="ck-rail" aria-hidden="true">
            <i style={{ transform: `scaleX(${(allIn ? hdDone : inBook) / Math.max(1, total)})` }} />
          </div>
          {allIn && !snapshot.offline ? (
            <p className="ck-hd">
              Saving the full-quality copies we print from: <b>{hdDone}</b> of {total}
              {snapshot.etaSeconds !== null ? `, ${formatEta(snapshot.etaSeconds)} left` : ""}
            </p>
          ) : null}
          {snapshot.offline ? (
            <p className="ck-hd warn">
              Waiting for a connection. We'll carry on by ourselves.{" "}
              <button type="button" onClick={() => uploadEngine.retryNow()}>
                Try now
              </button>
            </p>
          ) : null}
          <TipLine lineFor={(n) => tipFor(n, progress.fraction, notices)} />
        </>
      )}
      {snapshot.rejected.length ? (
        <div className="ck-rejected" role="alert">
          <p>
            We couldn't open {snapshot.rejected.length === 1 ? snapshot.rejected[0] : `${snapshot.rejected.length} files`}, so{" "}
            {snapshot.rejected.length === 1 ? "it isn't" : "they aren't"} in your book.
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
  const [hw, lastWord] = useMemo(() => {
    const words = copy.quizHello.split(" ");
    const last = words.pop();
    return [words.join(" "), last];
  }, [copy.quizHello]);

  const photosRef = useRef(state.photos);
  photosRef.current = state.photos;
  const thumbFor = useRef((id: string) => {
    const photo = photosRef.current.find((p) => p.id === id);
    return photo ? photoSrc(photo, "thumb") : undefined;
  }).current;
  useArrivals(stageRef, thumbFor, picked);

  const pageCount = useMemo(() => generatePages(state.photos, state.density).length, [state.photos, state.density]);
  // only photos that are ready: an empty placeholder among them looks broken
  const prints = state.photos.filter(hasImage).slice(0, 4);
  const stage = STAGE_LINES[state.occasion ?? "mix"] ?? STAGE_LINES.mix;

  const next = () => {
    if (step < 2) set({ qstep: (step + 1) as 1 | 2 });
    else onDone();
  };

  return (
    <div className="bb-screen ck-compose">
      <div className="ck-questions">
        <div className="ck-questions-inner">
          <h1>
            {hw} <span className="bb-mark">{lastWord}</span>
          </h1>
          <p className="bb-sub">{copy.quizSub}</p>

          {step === 0 ? (
            <div className="bb-qstep" key="feel">
              <h2>{copy.qVibe}</h2>
              <p className="ck-note">You can change this later. Your photos go inside every style.</p>
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
                        <i>{f.id === "signature" ? `Our special design, made just for ${SIGNATURE_FOR[occ.id] ?? SIGNATURE_FOR.mix}.` : f.line}</i>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="bb-qstep" key="colours">
              <h2>Now, its colours</h2>
              <div className="bb-vibes">
                {VIBES.map((v) => {
                  const t = themeById(v.id);
                  const on = state.themeId === v.id;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      aria-pressed={on}
                      className={"bb-vibe" + (on ? " sel" : "")}
                      onClick={() => set({ vibe: v.id, themeId: v.id })}
                    >
                      <div className="bb-vibe-swatch" style={{ background: t.page, color: t.ink }}>
                        <span>{previewTitle}</span>
                      </div>
                      <b>{v.name}</b>
                      <i>{v.blurb}</i>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="bb-qstep" key="title">
              <h2>{copy.qTitle}</h2>
              <input
                className="bb-title-input"
                value={title}
                maxLength={48}
                aria-label={copy.qTitle}
                onChange={(e) => set({ title: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && title.trim()) onDone();
                }}
                placeholder={occ.suggestedTitle}
              />
              <p className="bb-hint">{copy.titleHint}</p>
            </div>
          ) : null}

          <div className="ck-actions">
            <button type="button" className="bb-btn bb-btn-primary bb-btn-lg" disabled={step === 0 ? !picked : step === 2 && !title.trim()} onClick={next}>
              {step === 2 ? "Design my book" : "Next"} <ArrowRight size={18} />
            </button>
            <div className="bb-dots" aria-label={`Question ${step + 1} of 3`}>
              {([0, 1, 2] as const).map((i) => (
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
      </div>
    </div>
  );
}
