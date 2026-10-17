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
 *
 * Accounts (Phase 2A) attach at the shell, not inside the screens:
 *  - useBuilderSync mirrors the book to the server (versioned autosave,
 *    resume via ?project=, claim on lost session) and reports a status
 *    pill in the nav
 *  - a dismissible "save this book" prompt appears once after reveal for
 *    guests; the order screen is a hard gate — a verified email is
 *    required before checkout (SignInSheet, intent "order")
 */

import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Check, ChevronLeft, CloudOff, Loader2, RotateCcw } from "lucide-react";
import "./builder.css";
import { COPY, OCCASIONS, generatePages, occasionById } from "./data";
import { bookTheme } from "./palette";
import { BACK_MAP, SCREEN_CONTEXT, useBuilderState, type BuilderState } from "./state";
import { useBuilderSync, type SyncStatus } from "./sync";
import { useSession } from "@/features/auth/useSession";
import { SignInSheet } from "@/features/auth/SignInSheet";
import { AccountMenu } from "@/features/auth/AccountMenu";
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

/** Tiny nav indicator so "Saves automatically" is a fact, not a claim. */
function SavePill({ status }: { status: SyncStatus }) {
  if (status === "idle") return null;
  if (status === "saving")
    return (
      <span className="au-save">
        <Loader2 size={13} className="au-spin" /> Saving
      </span>
    );
  if (status === "error")
    return (
      <span className="au-save err" title="Changes are kept on this device and will sync when you're back online">
        <CloudOff size={13} /> Offline
      </span>
    );
  return (
    <span className="au-save">
      <Check size={13} /> Saved
    </span>
  );
}

const SAVE_PROMPT_KEY = "tk_save_prompted_v1";

export default function BookBuilder() {
  const { state, set, reset } = useBuilderState(seedFromUrl());
  const copy = COPY[state.voice] ?? COPY.warm;
  const { status: syncStatus } = useBuilderSync(state, set);
  const { loading: sessionLoading, isMember } = useSession();

  // Soft prompt: once per browser, the first time a guest reaches a
  // finished book. Dismissible — the book keeps working without it.
  const [savePrompt, setSavePrompt] = useState(false);
  useEffect(() => {
    if (sessionLoading || isMember) return;
    if (state.screen !== "reveal" || !state.projectId) return;
    let seen = false;
    try {
      seen = localStorage.getItem(SAVE_PROMPT_KEY) === "1";
    } catch {
      /* ignore */
    }
    if (!seen) setSavePrompt(true);
  }, [state.screen, state.projectId, sessionLoading, isMember]);
  const dismissSavePrompt = () => {
    setSavePrompt(false);
    try {
      localStorage.setItem(SAVE_PROMPT_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  // Hard gate: checkout needs a verified email. Shown over the order
  // screen; the sheet has no close button here, only "back to preview".
  const orderGate = state.screen === "order" && !sessionLoading && !isMember;

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
          <SavePill status={syncStatus} />
          {state.screen !== "quiz" || state.qstep > 0 ? (
            <button className="bb-btn bb-btn-ghost" onClick={reset}>
              <RotateCcw size={15} /> Start over
            </button>
          ) : null}
          <AccountMenu />
        </div>
      </header>

      <main className="bb-main">
        {state.screen === "quiz" ? <QuizScreen key="quiz" state={state} set={set} copy={copy} onDone={() => set({ screen: "upload" })} /> : null}
        {state.screen === "upload" ? (
          <UploadScreen key="upload" state={state} set={set} copy={copy} theme={bookTheme(state.themeId, state.pageColor)} onContinue={() => set({ screen: "generating" })} />
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

      {savePrompt && !orderGate ? <SignInSheet intent="save" onClose={dismissSavePrompt} /> : null}
      {orderGate ? <SignInSheet intent="order" onClose={() => set({ screen: "preview", pos: 0 })} /> : null}
    </div>
  );
}
