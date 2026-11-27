/**
 * QuizScreen — step 1 of 3: what's the book for?
 *
 * Ported from `book_builder/screens1.jsx`. The only question asked before
 * the photos. Colours and title moved after the picker (ComposeScreen),
 * because that's when there's time to fill and a real photo to show them
 * on. Moves on 260ms after a pick so the selection is visible first.
 */

import { ArrowRight, Baby, Cake, Heart, Plane, Sparkles } from "lucide-react";
import { BOOK_IMAGES } from "@/features/landing/book-images";
import { OCCASIONS, occasionById, type CopyVoice } from "../data";
import { pairForOccasion } from "@shared/fonts";
import { INCLUDED_PAGES, STARTING_PRICE_MINOR, formatPKR } from "@shared/pricing";
import "../flow.css";
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

/** One-line subtitle per occasion, the same lines as the landing cards (website copy v1). */
const OCC_TAGLINE: Record<string, string> = {
  wedding: "Your big day, all in one place",
  baby: "Tiny hands, big moments",
  travel: "Every place you wandered",
  birthday: "One more year to remember",
  mix: "Bring together photos from any time",
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
    // the font pair follows the occasion until the customer picks one themselves (step 4 or the editor)
    const fontId = state.fontId === pairForOccasion(occasion) ? pairForOccasion(id) : state.fontId;
    set({ occasion: id, title: title || occasionById(id).suggestedTitle, fontId });
    setTimeout(onDone, 260);
  };

  return (
    <div className="bb-screen bb-quiz">
      <div className="bb-quiz-left">
        <div className="bb-quiz-inner">
          <h1>{copy.qOccasion}</h1>
          <p className="bb-sub">{copy.occasionSub}</p>
          <p className="qz-price qz-price-phone">
            <b>Starting from {formatPKR(STARTING_PRICE_MINOR)}</b> <span>A 12x12 inch album with {INCLUDED_PAGES} pages inside</span>
          </p>

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
          {/* The small "live preview" book that sat over this photo is gone (owner, 2026-11-26):
              the photo of a real album says it better, and the live preview starts on step 3. */}
        </div>
        {/* step 1 of the owner's flow: the price before anything else is asked */}
        <p className="qz-price">
          <b>Starting from {formatPKR(STARTING_PRICE_MINOR)}</b> <span>A 12x12 inch album with {INCLUDED_PAGES} pages inside</span>
        </p>
      </div>
    </div>
  );
}
