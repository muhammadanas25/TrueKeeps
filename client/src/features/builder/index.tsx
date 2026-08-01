/**
 * BookBuilder — the quiz-first book creation flow (the "autopilot" path).
 *
 * Shell ported from the updated prototype (`~/Downloads/app.jsx`):
 * sticky nav (back + wordmark + step context + start over) over a
 * screen switch driven by one state machine (see state.ts):
 *
 *   quiz → upload → generating → reveal → preview ↔ (customize | order) → confirm
 *
 * App adaptations vs the prototype:
 *  - typed TSX, screens in ./screens/*, data in ./data.ts
 *  - real photo uploads (UploadScreen reads files; Ph renders them)
 *  - ?occasion=<id> deep link (landing occasion cards) pre-selects the
 *    quiz answer and skips straight to the vibe question
 *  - the prototype's TweaksPanel (a design-review overlay) is not
 *    ported — its controls exist in-product on Customize
 */

import { useEffect } from "react";
import { Link } from "wouter";
import { ChevronLeft, RotateCcw } from "lucide-react";
import "./builder.css";
import { COPY, OCCASIONS, generatePages, occasionById, themeById } from "./data";
import { BACK_MAP, SCREEN_CONTEXT, useBuilderState, type BuilderState } from "./state";
import { QuizScreen } from "./screens/QuizScreen";
import { UploadScreen } from "./screens/UploadScreen";
import { GeneratingScreen } from "./screens/GeneratingScreen";
import { RevealScreen } from "./screens/RevealScreen";
import { PreviewScreen } from "./screens/PreviewScreen";
import { CustomizeScreen } from "./screens/CustomizeScreen";
import { ConfirmScreen, OrderScreen } from "./screens/OrderScreen";
import { TKMark } from "@/features/landing/primitives";

/** Seed builder state from URL params (?occasion=wedding from landing). */
function seedFromUrl(): Partial<BuilderState> {
  const occasion = new URLSearchParams(window.location.search).get("occasion");
  if (occasion && OCCASIONS.some((o) => o.id === occasion)) {
    return { occasion, title: occasionById(occasion).suggestedTitle, qstep: 1 };
  }
  return {};
}

export default function BookBuilder() {
  const { state, set, reset } = useBuilderState(seedFromUrl());
  const copy = COPY[state.voice] ?? COPY.warm;

  // gate entrance animations on real frames (same pattern as the landing)
  useEffect(() => {
    const raf = requestAnimationFrame(() => document.documentElement.classList.add("motion-ok"));
    return () => cancelAnimationFrame(raf);
  }, []);

  const goBack = () => {
    const to = BACK_MAP[state.screen];
    // re-entering the quiz lands on its last sub-step, not question 1
    if (to) set({ screen: to, ...(to === "quiz" ? { qstep: 2 as const } : null) });
  };
  const onGenerated = () =>
    set({ pages: generatePages(state.photos, state.density), screen: "reveal", pos: 0 });

  return (
    <div className="bb-shell">
      <header className="bb-nav">
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {BACK_MAP[state.screen] ? (
            <button className="bb-btn bb-btn-ghost" onClick={goBack} aria-label="Back" style={{ padding: "8px 10px" }}>
              <ChevronLeft size={18} />
            </button>
          ) : null}
          <Link href="/" className="bb-wordmark" aria-label="TrueKeep home">
            <TKMark size={26} />
            <span>
              True<em>Keep</em>
            </span>
          </Link>
        </div>
        <div className="bb-nav-right">
          <span className="bb-nav-context">{SCREEN_CONTEXT[state.screen] || ""}</span>
          {state.screen !== "quiz" || state.qstep > 0 ? (
            <button className="bb-btn bb-btn-ghost" onClick={reset}>
              <RotateCcw size={15} /> Start over
            </button>
          ) : null}
        </div>
      </header>

      <main className="bb-main">
        {state.screen === "quiz" ? <QuizScreen key="quiz" state={state} set={set} copy={copy} onDone={() => set({ screen: "upload" })} /> : null}
        {state.screen === "upload" ? (
          <UploadScreen key="upload" state={state} set={set} copy={copy} theme={themeById(state.themeId)} onContinue={() => set({ screen: "generating" })} />
        ) : null}
        {state.screen === "generating" ? <GeneratingScreen key="gen" copy={copy} onDone={onGenerated} /> : null}
        {state.screen === "reveal" ? <RevealScreen key="reveal" state={state} set={set} copy={copy} onOpen={() => set({ screen: "preview", pos: 0 })} /> : null}
        {state.screen === "preview" ? (
          <PreviewScreen key="preview" state={state} set={set} copy={copy} onOrder={() => set({ screen: "order" })} onCustomize={() => set({ screen: "customize" })} />
        ) : null}
        {state.screen === "customize" ? (
          <CustomizeScreen key="customize" state={state} set={set} copy={copy} onDone={() => set({ screen: "preview", pos: 0 })} />
        ) : null}
        {state.screen === "order" ? (
          <OrderScreen key="order" state={state} set={set} copy={copy} onPlace={() => set({ screen: "confirm" })} onBack={() => set({ screen: "preview", pos: 0 })} />
        ) : null}
        {state.screen === "confirm" ? <ConfirmScreen key="confirm" copy={copy} onRestart={reset} onBack={() => set({ screen: "preview", pos: 0 })} /> : null}
      </main>
    </div>
  );
}
