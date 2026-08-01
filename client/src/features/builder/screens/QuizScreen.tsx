/**
 * QuizScreen — step 1 of 3: occasion → vibe → title.
 *
 * Ported from `book_builder/screens1.jsx`. Left column asks one small
 * question at a time (auto-advances 260ms after a pick so the selection
 * state is visible before the slide); the right column is a live stage
 * where the mini book assembles as answers come in.
 */

import { ArrowRight, Baby, Cake, Heart, Plane, Sparkles } from "lucide-react";
import { MiniBook, Ph } from "../book";
import { OCCASIONS, VIBES, occasionById, themeById, type CopyVoice } from "../data";
import type { BuilderState } from "../state";

/** lucide components for the occasion icon names in data.ts */
const OCC_ICONS = { Heart, Baby, Plane, Cake, Sparkles } as const;

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
  const { qstep, occasion, vibe, title } = state;
  // apply the pick immediately, slide to the next question a beat later
  const advance = (patch: Partial<BuilderState>, nextStep: 0 | 1 | 2) => {
    set(patch);
    setTimeout(() => set({ qstep: nextStep }), 260);
  };
  const occ = occasionById(occasion);
  const theme = themeById(vibe || "ivory");
  const previewTitle = (title && title.trim()) || occ.suggestedTitle;
  const hw = copy.quizHello.split(" ");
  const lastWord = hw.pop();

  // floating preview tiles around the assembling book
  const tiles = [
    { label: occ.photoLabels[0], left: -6, top: 44, r: -8, s: 102 },
    { label: occ.photoLabels[3], left: 250, top: 18, r: 7, s: 94 },
    { label: occ.photoLabels[6], left: 252, top: 302, r: -5, s: 90 },
  ];
  const stageCaption = !occasion ? "Pick a moment to begin" : !vibe ? occ.label : previewTitle;

  return (
    <div className="bb-screen bb-quiz">
      <div className="bb-quiz-left">
        <div className="bb-quiz-inner">
          <div className="bb-kicker">Photo book studio</div>
          <h1>
            {hw.join(" ")} <span className="gold">{lastWord}</span>
          </h1>
          <p className="bb-sub">{copy.quizSub}</p>

          {qstep === 0 ? (
            <div className="bb-qstep" key="q0">
              <h2>{copy.qOccasion}</h2>
              <div className="bb-occasions">
                {OCCASIONS.map((o) => {
                  const Icon = OCC_ICONS[o.icon];
                  return (
                    <button
                      key={o.id}
                      className={"bb-occasion occ-" + o.id + (occasion === o.id ? " sel" : "")}
                      onClick={() => advance({ occasion: o.id, title: state.title || o.suggestedTitle }, 1)}
                    >
                      <span className="bb-occ-ic">
                        <Icon size={23} strokeWidth={2} />
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
          ) : null}

          {qstep === 1 ? (
            <div className="bb-qstep" key="q1">
              <h2>{copy.qVibe}</h2>
              <div className="bb-vibes">
                {VIBES.map((v) => {
                  const t = themeById(v.id);
                  return (
                    <button key={v.id} className={"bb-vibe" + (vibe === v.id ? " sel" : "")} onClick={() => advance({ vibe: v.id, themeId: v.id }, 2)}>
                      <div className="bb-vibe-swatch" style={{ background: t.page, color: t.ink }}>
                        <span>{occ.suggestedTitle}</span>
                      </div>
                      <b>{v.name}</b>
                      <i>{v.blurb}</i>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {qstep === 2 ? (
            <div className="bb-qstep" key="q2">
              <h2>{copy.qTitle}</h2>
              <input
                className="bb-title-input"
                value={title}
                maxLength={48}
                onChange={(e) => set({ title: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && title.trim()) onDone();
                }}
                placeholder={occ.suggestedTitle}
                autoFocus
              />
              <p className="bb-hint">{copy.titleHint}</p>
              <div className="bb-quiz-actions">
                <button className="bb-btn bb-btn-primary bb-btn-lg" disabled={!title.trim()} onClick={onDone}>
                  Continue <ArrowRight size={18} />
                </button>
              </div>
            </div>
          ) : null}

          <div className="bb-dots">
            {([0, 1, 2] as const).map((i) => (
              <button
                key={i}
                className={"bb-dot" + (qstep === i ? " on" : "")}
                style={{ cursor: i < qstep ? "pointer" : "default" }}
                onClick={() => {
                  if (i < qstep) set({ qstep: i });
                }}
                aria-label={"Step " + (i + 1)}
              ></button>
            ))}
          </div>
        </div>
      </div>

      <div className="bb-quiz-stage">
        <div className="bb-quiz-stage-art">
          {tiles.map((t, k) => (
            <div key={k} className="bb-quiz-float" style={{ left: t.left, top: t.top, animationDelay: 0.3 + k * 0.6 + "s" }}>
              <div className="bb-quiz-tile" style={{ width: t.s, height: Math.round(t.s * 0.82), transform: "rotate(" + t.r + "deg)" }}>
                <Ph photo={{ id: "qt" + k, label: t.label, shade: k % 3 }} theme={theme} />
              </div>
            </div>
          ))}
          <MiniBook theme={theme} coverStyle={state.coverStyle} title={previewTitle} occasion={occ} photos={state.photos} size={232} />
        </div>
        <div className="bb-quiz-stage-cap">
          <Sparkles size={14} /> {stageCaption}
        </div>
      </div>
    </div>
  );
}
