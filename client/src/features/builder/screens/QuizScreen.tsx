/**
 * QuizScreen — step 1 of 3: what's the book for?
 *
 * Ported from `book_builder/screens1.jsx`. The only question asked before
 * the photos. Colours and title moved after the picker (ComposeScreen),
 * because that's when there's time to fill and a real photo to show them
 * on. Moves on 260ms after a pick so the selection is visible first.
 */

import { ArrowRight, Baby, Cake, Heart, Plane, Sparkles } from "lucide-react";
import { MiniBook } from "../book";
import { BOOK_IMAGES } from "@/features/landing/book-images";
import { OCCASIONS, occasionById, themeById, type CopyVoice } from "../data";
import type { BuilderState } from "../state";

/** lucide components for the occasion icon names in data.ts */
const OCC_ICONS = { Heart, Baby, Plane, Cake, Sparkles } as const;

/** Real printed book shown beside the quiz, by occasion. */
const SAMPLE_BOOK: Record<string, string> = {
  wedding: "wedding",
  baby: "baby",
  travel: "travel",
  birthday: "birthday",
  mix: "anniversary",
};

/** One-line subtitle per occasion (keeps the blocks from feeling empty). */
const OCC_TAGLINE: Record<string, string> = {
  wedding: "The whole celebration",
  baby: "Their first year",
  travel: "Every place you went",
  birthday: "The big day",
  mix: "A year of moments",
};

export function QuizScreen({
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
  const { occasion, title } = state;
  const pick = (id: string) => {
    set({ occasion: id, title: title || occasionById(id).suggestedTitle });
    setTimeout(onDone, 260);
  };
  const occ = occasionById(occasion);
  const theme = themeById(state.vibe || "ivory");
  const previewTitle = (title && title.trim()) || occ.suggestedTitle;
  const stageCaption = occasion ? previewTitle : "Pick a moment to begin";

  return (
    <div className="bb-screen bb-quiz">
      <div className="bb-quiz-left">
        <div className="bb-quiz-inner">
          <h1>{copy.qOccasion}</h1>
          <p className="bb-sub">{copy.occasionSub}</p>

          <div className="bb-qstep">
            <div className="bb-occasions">
              {OCCASIONS.map((o) => {
                const Icon = OCC_ICONS[o.icon];
                return (
                  <button key={o.id} className={"bb-occasion" + (occasion === o.id ? " sel" : "")} onClick={() => pick(o.id)}>
                    <span className="bb-occ-ic">
                      <Icon size={22} strokeWidth={1.8} />
                    </span>
                    <span className="bb-occ-text">
                      <b>{o.label}</b>
                      <i>{OCC_TAGLINE[o.id]}</i>
                    </span>
                    <span className="bb-occ-go">
                      <ArrowRight size={16} />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="bb-quiz-stage">
        <div className="bb-quiz-stage-art">
          <img className="bb-quiz-sample" src={BOOK_IMAGES[SAMPLE_BOOK[occasion || "baby"] ?? "baby"]} alt="" />
          {/* the minimal cover has no photo slot: the customer's title and look, nothing to fill in */}
          <div className="bb-quiz-stage-book">
            <MiniBook theme={theme} coverStyle="minimal" title={previewTitle} occasion={occ} photos={[]} size={168} />
          </div>
        </div>
        <div className="bb-quiz-stage-cap">
          <Sparkles size={14} /> {stageCaption}
        </div>
      </div>
    </div>
  );
}
