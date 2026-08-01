/**
 * RevealScreen — step 3 of 3: the designed book, shown three ways.
 *
 * Ported from `book_builder/screens2.jsx`. Shows the user's chosen vibe
 * first (badged as "our pick") plus two contrasting alternates — same
 * photos, different theme — so the choice feels like taste, not work.
 */

import { BookOpen, Check } from "lucide-react";
import { MiniBook } from "../book";
import { BOOK_THEMES, occasionById, themeById, type CopyVoice } from "../data";
import type { BuilderState } from "../state";

export function RevealScreen({
  state,
  set,
  copy,
  onOpen,
}: {
  state: BuilderState;
  set: (patch: Partial<BuilderState>) => void;
  copy: CopyVoice;
  onOpen: () => void;
}) {
  const occ = occasionById(state.occasion);
  // chosen vibe first, then the alternates
  const order = [state.vibe || "ivory", ...BOOK_THEMES.map((t) => t.id).filter((id) => id !== (state.vibe || "ivory"))].slice(0, 3);
  return (
    <div className="bb-screen bb-reveal">
      <div className="bb-kicker">Designed for you</div>
      <h1>{copy.revealTitle}</h1>
      <p className="bb-sub">{copy.revealSub}</p>
      <div className="bb-options">
        {order.map((id, i) => {
          const t = themeById(id);
          const sel = state.themeId === id;
          return (
            <button key={id} className={"bb-option" + (sel ? " sel" : "")} onClick={() => set({ themeId: id })}>
              {i === 0 ? <span className="bb-pick-badge">{copy.ourPick}</span> : null}
              {sel ? (
                <span className="bb-check">
                  <Check size={14} />
                </span>
              ) : null}
              <MiniBook theme={t} coverStyle={state.coverStyle} title={state.title} occasion={occ} photos={state.photos} />
              <div className="bb-option-name">{t.name}</div>
            </button>
          );
        })}
      </div>
      <div className="bb-actionbar">
        <button className="bb-btn bb-btn-primary bb-btn-lg" onClick={onOpen}>
          <BookOpen size={18} /> {copy.openBook}
        </button>
      </div>
    </div>
  );
}
