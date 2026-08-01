import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ArrowRight } from "lucide-react";
import { StepProgress } from "@/components/wizard/StepProgress";
import { BookSettings } from "@/components/wizard/BookSettings";
import { PhotoUpload } from "@/components/wizard/PhotoUpload";
import { LayoutTheme } from "@/components/wizard/LayoutTheme";
import { CoverStyle } from "@/components/wizard/CoverStyle";
import { PageReview } from "@/components/wizard/PageReview";
import { OrderSummary } from "@/components/wizard/OrderSummary";
import { defaultWizardState, type WizardState } from "@/lib/wizard-types";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

const TOTAL_STEPS = 6;
const STEP_LABELS = ["Settings", "Photos", "Layout", "Cover", "Preview", "Order"];
const STORAGE_KEY = "truekeep_wizard_draft";

const slideVariants = {
  enter: (dir: number) => ({ opacity: 0, x: dir > 0 ? 60 : -60 }),
  center: { opacity: 1, x: 0 },
  exit:   (dir: number) => ({ opacity: 0, x: dir > 0 ? -60 : 60 }),
};

export default function Wizard() {
  const [, navigate]  = useLocation();
  const { toast }     = useToast();
  const [step, setStep]       = useState(1);
  const [direction, setDir]   = useState(1);
  const [saving, setSaving]   = useState(false);

  // Restore or initialise wizard state
  const [state, setState] = useState<WizardState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return { ...defaultWizardState, ...JSON.parse(saved) };
    } catch {}
    return defaultWizardState;
  });

  // Parse mode from URL (?mode=auto|custom)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mode   = params.get("mode") as WizardState["mode"] | null;
    if (mode && mode !== state.mode) {
      setState(s => ({ ...s, mode: mode ?? "auto" }));
    }
  }, []);

  // Auto-save to localStorage every time state changes
  useEffect(() => {
    const id = setTimeout(() => {
      const { photos, ...rest } = state;
      // Don't save photo data urls (too large for localStorage)
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...rest, photos: [] }));
    }, 800);
    return () => clearTimeout(id);
  }, [state]);

  const patch = useCallback((updates: Partial<WizardState>) => {
    setState(s => ({ ...s, ...updates }));
  }, []);

  const patchSettings = useCallback((updates: Partial<WizardState["bookSettings"]>) => {
    setState(s => ({ ...s, bookSettings: { ...s.bookSettings, ...updates } }));
  }, []);

  // Validation per step
  const canContinue = (): boolean => {
    switch (step) {
      case 1: return !!state.bookSettings.name.trim();
      case 2: return state.photos.some(p => p.status === "done" || p.status === "pending");
      case 3: return true; // optional — can continue with no theme
      case 4: return true;
      case 5: return true;
      default: return true;
    }
  };

  const goNext = async () => {
    if (!canContinue()) {
      toast({
        title: "Just one more thing",
        description: step === 1 ? "Please give your book a name." : "Please upload at least one photo.",
        variant: "destructive",
      });
      return;
    }

    // Step 1 → 2: create project in API
    if (step === 1 && !state.projectId) {
      try {
        setSaving(true);
        const res  = await apiRequest("POST", "/api/projects", {
          name:    state.bookSettings.name,
          themeId: state.themeId || undefined,
        });
        const proj = await res.json();
        patch({ projectId: proj.id });
      } catch {
        // non-blocking — will retry on photo upload
      } finally {
        setSaving(false);
      }
    }

    setDir(1);
    setStep(s => Math.min(s + 1, TOTAL_STEPS));
  };

  const goBack = () => {
    if (step === 1) {
      navigate("/");
      return;
    }
    setDir(-1);
    setStep(s => Math.max(s - 1, 1));
  };

  const handlePrintNow = () => {
    setDir(1);
    setStep(TOTAL_STEPS);
  };

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "#FAFAF7", fontFamily: "var(--font-body)" }}
    >
      {/* ── Header ── */}
      <header
        className="sticky top-0 z-30 border-b"
        style={{ background: "rgba(250,250,247,0.92)", backdropFilter: "blur(12px)", borderColor: "#e5e5e0" }}
      >
        <div className="max-w-4xl mx-auto px-6 py-4">
          {/* Logo row */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={goBack}
              className="flex items-center gap-1 text-sm font-medium transition-colors hover:opacity-70"
              style={{ color: "#6b6b69" }}
            >
              <ChevronLeft className="w-4 h-4" />
              {step === 1 ? "Home" : "Back"}
            </button>

            <span
              className="text-lg font-bold"
              style={{ fontFamily: "var(--font-display)", color: "#1D4BA6" }}
            >
              TrueKeep
            </span>

            <span className="text-xs font-medium" style={{ color: "#9b9b97" }}>
              Step {step} of {TOTAL_STEPS}
            </span>
          </div>

          {/* Progress */}
          <StepProgress
            currentStep={step}
            totalSteps={TOTAL_STEPS}
            labels={STEP_LABELS}
          />
        </div>
      </header>

      {/* ── Step Content ── */}
      <main className="flex-1 overflow-x-hidden">
        <div className="max-w-4xl mx-auto px-6 py-10">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={step}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            >
              {step === 1 && (
                <BookSettings state={state} onChange={patchSettings} />
              )}
              {step === 2 && (
                <PhotoUpload
                  state={state}
                  onPhotosChange={photos => patch({ photos })}
                  onProjectCreated={id => patch({ projectId: id })}
                />
              )}
              {step === 3 && (
                <LayoutTheme
                  state={state}
                  onChange={updates => patch(updates)}
                />
              )}
              {step === 4 && (
                <CoverStyle
                  state={state}
                  onChange={updates => patch(updates)}
                  onContinue={goNext}
                  onPrintNow={handlePrintNow}
                />
              )}
              {step === 5 && (
                <PageReview state={state} />
              )}
              {step === 6 && (
                <OrderSummary state={state} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* ── Footer Nav ── */}
      {step < TOTAL_STEPS && (
        <footer
          className="sticky bottom-0 border-t z-20"
          style={{ background: "rgba(250,250,247,0.96)", backdropFilter: "blur(12px)", borderColor: "#e5e5e0" }}
        >
          <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
            {/* Step hint */}
            <p className="text-xs" style={{ color: "#9b9b97" }}>
              {[
                "Name your book and set its format.",
                "Upload the photos you'd like to include.",
                "Pick a layout and theme for your pages.",
                "Choose how your cover will look.",
                "Review your auto-generated book.",
                "",
              ][step - 1]}
            </p>

            <button
              type="button"
              onClick={goNext}
              disabled={saving}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl text-white font-semibold text-sm transition-all hover:opacity-90 active:scale-[0.97] disabled:opacity-60"
              style={{ background: "#1D4BA6", fontFamily: "var(--font-display)" }}
            >
              {saving ? "Saving…" : step === TOTAL_STEPS - 1 ? "Review Order" : "Continue"}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}
