/**
 * BookBuilder — the quiz-first book creation flow (the "autopilot" path).
 *
 * Shell ported from the updated prototype (`~/Downloads/app.jsx`):
 * sticky nav (back + wordmark + step context + start over) over a
 * screen switch driven by one state machine (see state.ts):
 *
 *   quiz → upload → compose → book → preview ↔ (customize | order) → confirm
 *
 * the owner's seven steps (flow v2, 2026-11-15; see state.ts for the map).
 *
 * App adaptations vs the prototype:
 *  - typed TSX, screens in ./screens/*, data in ./data.ts
 *  - real photo uploads, running in the background from the moment photos
 *    are chosen (upload/engine.ts); the provider lives here so they carry
 *    on across every screen
 *  - ?occasion=<id> deep link (landing occasion cards) pre-selects the
 *    quiz answer and skips straight to the photos
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

import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Check, ChevronLeft, CloudOff, Loader2, RotateCcw, Sparkles } from "lucide-react";
import "./builder.css";
import { COPY, OCCASIONS, coverPhotoIdFor, occasionById } from "./data";
import { pairForOccasion } from "@shared/fonts";
import { bookTheme } from "./palette";
import { BACK_MAP, SCREEN_CONTEXT, useBuilderState, type BuilderState } from "./state";
import { useBuilderSync, type SyncStatus } from "./sync";
import { trackStep } from "@/lib/track";
import { useSession } from "@/features/auth/useSession";
import { SignInSheet } from "@/features/auth/SignInSheet";
import { AccountMenu } from "@/features/auth/AccountMenu";
import { QuizScreen } from "./screens/QuizScreen";
import { UploadScreen } from "./screens/UploadScreen";
import { ComposeScreen } from "./screens/ComposeScreen";
import { uploadEngine } from "./upload/engine";
import { UploadProvider } from "./upload/UploadContext";
import { UploadHairline, UploadPill } from "./upload/UploadStatus";
import { StepsBar } from "./StepsBar";
import { albumKey, stepOf } from "./steps";
import "./upload/upload.css";
import { BookScreen } from "./screens/BookScreen";
import { PreviewScreen } from "./screens/PreviewScreen";
import { CustomizeScreen } from "./screens/CustomizeScreen";
import { ConfirmScreen, OrderScreen } from "./screens/OrderScreen";
import { EditorV2 } from "./editor-v2/EditorV2";
import { useEditorVersion } from "./editor-v2/pref";
import { PageLookContext, type PageLook } from "./looks";
import { TKLogo } from "@/features/landing/primitives";
import { WhatsAppHelpButton, useSupportContext } from "@/features/support/WhatsAppHelp";

/** Seed builder state from URL params (?occasion=wedding from landing). */
function seedFromUrl(): Partial<BuilderState> {
  const occasion = new URLSearchParams(window.location.search).get("occasion");
  if (occasion && OCCASIONS.some((o) => o.id === occasion)) {
    return { occasion, title: occasionById(occasion).suggestedTitle, fontId: pairForOccasion(occasion), screen: "upload" };
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
  const { state, set, updatePhotos, reset: resetState } = useBuilderState(seedFromUrl());
  const reset = () => {
    uploadEngine.reset();
    resetState();
  };
  const copy = COPY[state.voice] ?? COPY.warm;
  const { status: syncStatus } = useBuilderSync(state, set);
  // funnel analytics: which step people reach and how long they spend there (docs/adr/018)
  useEffect(() => trackStep(state.screen === "compose" ? `compose-${state.qstep ?? 0}` : state.screen), [state.screen, state.qstep]);
  // opening the editor counts as "looked" until an edit there makes it "changed"
  useEffect(() => {
    if (state.screen === "customize" && state.customized === "none") set({ customized: "looked" });
  }, [state.screen, state.customized]); // eslint-disable-line react-hooks/exhaustive-deps
  const { loading: sessionLoading, isMember } = useSession();
  const [editorVersion, setEditorVersion] = useEditorVersion();

  // Typeface, edges, subtitle and caption visibility reach every page
  // renderer (preview, order, both editors) through this context.
  // resolved once here; every cover in the builder reads it from the look
  const coverPhotoId = coverPhotoIdFor(state);
  const look = useMemo<PageLook>(
    () => ({ fontId: state.fontId, edge: state.edge, subtitle: state.subtitle, captionsHidden: state.captionsHidden, coverPhotoId, coverPattern: state.coverPattern, coverFrame: state.coverFrame }),
    [state.fontId, state.edge, state.subtitle, state.captionsHidden, coverPhotoId, state.coverPattern, state.coverFrame],
  );
  const v2Customize = state.screen === "customize" && editorVersion === "v2";

  // "Save this book" for guests. It used to open by itself the moment their
  // book first appeared, which covered the book (owner, 2026-11-21); now it
  // opens only from the quiet "Sign in" link on "Pick your book".
  const [savePrompt, setSavePrompt] = useState(false);
  const offerSave = !sessionLoading && !isMember && Boolean(state.projectId);
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
    // Back walks through the three questions before it leaves them.
    if (state.screen === "compose" && state.qstep > 0) return set({ qstep: 0 });
    const to = BACK_MAP[state.screen];
    // re-entering the questions lands on the last one, not the first
    if (to) set({ screen: to, ...(to === "compose" ? { qstep: 1 as const } : null) });
  };
  const stepNo = stepOf(state);
  // the step bar under the header names the step (StepsBar), so the header only labels screens outside the seven
  const context = stepNo ? "" : SCREEN_CONTEXT[state.screen] || "";
  // remember the furthest step reached, so the step bar can jump back to it
  useEffect(() => {
    if (stepNo > (state.reached ?? 0)) set({ reached: stepNo });
  }, [stepNo, state.reached]); // eslint-disable-line react-hooks/exhaustive-deps
  // the help button carries the book and the step, so the team can find it
  useSupportContext({ bookId: state.projectId, where: state.screen === "customize" ? "Making changes" : stepNo ? `Step ${stepNo} of 7` : state.screen });

  // The v2 editor is a full-screen app of its own (own top bar, no page
  // scroll), so it replaces the shell rather than living inside it.
  if (v2Customize) {
    return (
      <PageLookContext.Provider value={look}>
        <UploadProvider state={state} set={set} updatePhotos={updatePhotos}>
        <div className="bb-shell">
          <UploadHairline />
          <EditorV2
            state={state}
            set={set}
            copy={copy}
            saveStatus={syncStatus}
            onBack={() => set({ screen: "preview", pos: 0 })}
            onPreview={() => set({ screen: "preview", pos: 0 })}
            onOrder={() => set({ screen: "order" })}
            onSwitchClassic={() => setEditorVersion("classic")}
          />
        </div>
        </UploadProvider>
      </PageLookContext.Provider>
    );
  }

  return (
    <PageLookContext.Provider value={look}>
    <UploadProvider state={state} set={set} updatePhotos={updatePhotos}>
    <div className={"bb-shell" + (stepNo ? " has-steps" : "")}>
      <UploadHairline />
      <header className="bb-nav">
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {BACK_MAP[state.screen] ? (
            <button type="button" className="bb-back" onClick={goBack} aria-label="Back">
              <ChevronLeft size={18} />
            </button>
          ) : null}
          <Link href="/" className="bb-wordmark" aria-label="truekeeps home">
            <TKLogo size={18} />
          </Link>
        </div>
        <div className="bb-nav-right">
          <span className="bb-nav-context">{context}</span>
          <WhatsAppHelpButton />
          {/* the upload counter no longer sits here (website copy v1), so "Saved" stays */}
          <SavePill status={syncStatus} />
          <UploadPill counter={false} onRepick={state.screen === "upload" ? undefined : () => set({ screen: "upload" })} />
          {state.screen !== "quiz" ? (
            <button className="bb-btn bb-btn-ghost" onClick={reset}>
              <RotateCcw size={15} /> <span className="bb-nav-label">Start over</span>
            </button>
          ) : null}
          <AccountMenu />
        </div>
      </header>
      <StepsBar state={state} set={set} />

      <main className="bb-main">
        {state.screen === "quiz" ? <QuizScreen key="quiz" state={state} set={set} copy={copy} onDone={() => set({ screen: "upload" })} /> : null}
        {state.screen === "upload" ? (
          <UploadScreen key="upload" state={state} set={set} copy={copy} theme={bookTheme(state.themeId, state.pageColor)} onContinue={() => set({ screen: "compose", qstep: 0 })} />
        ) : null}
        {state.screen === "compose" ? <ComposeScreen key="compose" state={state} set={set} copy={copy} onDone={() => set({ screen: "book" })} /> : null}
        {state.screen === "book" ? (
          <BookScreen
            key="book"
            state={state}
            set={set}
            onPreview={() => set({ screen: "preview", pos: 0 })}
            onPhotos={() => set({ screen: "upload" })}
            onSave={offerSave ? () => setSavePrompt(true) : undefined}
          />
        ) : null}
        {state.screen === "preview" ? (
          <PreviewScreen key="preview" state={state} set={set} copy={copy} onOrder={() => set({ screen: "order", approvedKey: albumKey(state) })} onCustomize={() => set({ screen: "customize" })} />
        ) : null}
        {state.screen === "customize" ? (
          <>
            <CustomizeScreen key="customize" state={state} set={set} copy={copy} onDone={() => set({ screen: "preview", pos: 0 })} />
            <button className="bb-try-v2" onClick={() => setEditorVersion("v2")}>
              <Sparkles size={15} /> Try the new editor
            </button>
          </>
        ) : null}
        {state.screen === "order" ? (
          <OrderScreen key="order" state={state} set={set} copy={copy} onBack={() => set({ screen: "preview", pos: 0 })} onRestart={reset} />
        ) : null}
        {state.screen === "confirm" ? <ConfirmScreen key="confirm" copy={copy} onRestart={reset} onBack={() => set({ screen: "preview", pos: 0 })} /> : null}
      </main>

      {savePrompt && !orderGate ? <SignInSheet intent="save" onClose={dismissSavePrompt} /> : null}
      {orderGate ? <SignInSheet intent="order" onClose={() => set({ screen: "preview", pos: 0 })} /> : null}
    </div>
    </UploadProvider>
    </PageLookContext.Provider>
  );
}
