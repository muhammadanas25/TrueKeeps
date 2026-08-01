import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WizardState } from "@/lib/wizard-types";

interface Props {
  state: WizardState;
}

// Build spread list: [cover, page-pairs..., back-cover]
function buildSpreads(photos: WizardState["photos"], pageCount: number, frontIdx: number) {
  const spreads: { left: string | null; right: string | null; label: string }[] = [];

  // Cover spread
  const cover = photos[frontIdx]?.dataUrl ?? null;
  spreads.push({ left: null, right: cover, label: "Cover" });

  // Inner pages — pair up photos
  const innerPhotos = photos.filter((_, i) => i !== frontIdx).slice(0, pageCount - 2);
  for (let i = 0; i < pageCount - 2; i += 2) {
    spreads.push({
      left:  innerPhotos[i]?.dataUrl     ?? null,
      right: innerPhotos[i + 1]?.dataUrl ?? null,
      label: `Pages ${i + 2}–${i + 3}`,
    });
  }

  // Back cover
  spreads.push({ left: null, right: null, label: "Back Cover" });
  return spreads;
}

const variants = {
  enter: (dir: number) => ({ opacity: 0, x: dir > 0 ? 80 : -80 }),
  center: { opacity: 1, x: 0 },
  exit: (dir: number) => ({ opacity: 0, x: dir > 0 ? -80 : 80 }),
};

export function PageReview({ state }: Props) {
  const [spreadIdx, setSpreadIdx] = useState(0);
  const [direction, setDirection] = useState(1);

  const spreads = buildSpreads(
    state.photos,
    state.bookSettings.pageCount,
    state.frontCoverPhotoIndex,
  );

  const total   = spreads.length;
  const current = spreads[spreadIdx];

  const go = (dir: 1 | -1) => {
    const next = spreadIdx + dir;
    if (next < 0 || next >= total) return;
    setDirection(dir);
    setSpreadIdx(next);
  };

  return (
    <div className="max-w-4xl mx-auto w-full space-y-6">
      <div className="text-center">
        <h2 className="text-3xl font-bold mb-2" style={{ fontFamily: "var(--font-display)", color: "#3C3C3B" }}>
          Preview Your Book
        </h2>
        <p className="text-sm" style={{ color: "#6b6b69" }}>
          Swipe or use arrows to flip through your pages.
        </p>
      </div>

      {/* Spread viewer */}
      <div className="relative flex items-center gap-4">
        {/* Prev */}
        <button
          onClick={() => go(-1)}
          disabled={spreadIdx === 0}
          className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center border transition-all disabled:opacity-30"
          style={{ borderColor: "#d8d5c5" }}
        >
          <ChevronLeft className="w-5 h-5" style={{ color: "#3C3C3B" }} />
        </button>

        {/* Pages */}
        <div className="flex-1 relative overflow-hidden" style={{ perspective: "1200px" }}>
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={spreadIdx}
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.38, ease: [0.4, 0, 0.2, 1] }}
              className="grid grid-cols-2 gap-1"
            >
              {/* Left page */}
              <div
                className="relative rounded-l-lg overflow-hidden shadow-lg"
                style={{ aspectRatio: "3/4", background: "#f4f2e8" }}
              >
                {current.left ? (
                  <img src={current.left} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-12 h-12 rounded-full" style={{ background: "#EBEBD3" }} />
                  </div>
                )}
                {/* Page number */}
                <div
                  className="absolute bottom-2 left-0 right-0 text-center text-xs"
                  style={{ color: "rgba(0,0,0,0.3)" }}
                >
                  {spreadIdx > 0 ? spreadIdx * 2 : ""}
                </div>
              </div>

              {/* Right page */}
              <div
                className="relative rounded-r-lg overflow-hidden shadow-lg"
                style={{
                  aspectRatio: "3/4",
                  background: spreadIdx === 0 ? "#1D4BA6" : "#f4f2e8",
                }}
              >
                {current.right ? (
                  <img src={current.right} alt="" className="w-full h-full object-cover" />
                ) : spreadIdx === 0 ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6">
                    <p
                      className="text-white text-lg font-bold text-center"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      {state.bookTitle || state.bookSettings.name || "My Photo Book"}
                    </p>
                    <div className="w-12 h-0.5 bg-white/40" />
                    <p className="text-white/60 text-xs text-center">TrueKeep</p>
                  </div>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-12 h-12 rounded-full" style={{ background: "#EBEBD3" }} />
                  </div>
                )}
                <div
                  className="absolute bottom-2 left-0 right-0 text-center text-xs"
                  style={{ color: spreadIdx === 0 ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.3)" }}
                >
                  {spreadIdx > 0 && spreadIdx < total - 1 ? spreadIdx * 2 + 1 : ""}
                </div>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Spine shadow */}
          <div
            className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-1 pointer-events-none"
            style={{ background: "linear-gradient(to right, rgba(0,0,0,0.08), rgba(0,0,0,0.03))" }}
          />
        </div>

        {/* Next */}
        <button
          onClick={() => go(1)}
          disabled={spreadIdx === total - 1}
          className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center border transition-all disabled:opacity-30"
          style={{ borderColor: "#d8d5c5" }}
        >
          <ChevronRight className="w-5 h-5" style={{ color: "#3C3C3B" }} />
        </button>
      </div>

      {/* Spread label + counter */}
      <div className="text-center space-y-1">
        <p className="text-sm font-medium" style={{ color: "#3C3C3B" }}>{current.label}</p>
        <p className="text-xs" style={{ color: "#9b9b97" }}>
          {spreadIdx + 1} of {total} spreads
        </p>
      </div>

      {/* Thumbnail strip */}
      <div className="flex gap-2 overflow-x-auto pb-2 justify-center">
        {spreads.map((s, i) => (
          <button
            key={i}
            type="button"
            onClick={() => { setDirection(i > spreadIdx ? 1 : -1); setSpreadIdx(i); }}
            className="shrink-0 rounded-lg overflow-hidden transition-all"
            style={{
              width: 48, height: 64,
              border: spreadIdx === i ? "2.5px solid #1D4BA6" : "2px solid #e5e5e0",
              background: "#f4f2e8",
            }}
          >
            {s.right && <img src={s.right} alt="" className="w-full h-full object-cover" />}
            {!s.right && i === 0 && (
              <div className="w-full h-full flex items-center justify-center" style={{ background: "#1D4BA6" }}>
                <div className="w-2 h-2 rounded-full bg-white/50" />
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Hint */}
      <div
        className="flex items-center justify-center gap-2 text-sm rounded-2xl py-3 px-5"
        style={{ background: "rgba(29,75,166,0.05)", color: "#6b6b69" }}
      >
        <RefreshCw className="w-4 h-4" />
        Pages are auto-arranged. You can reorder photos in the next step.
      </div>
    </div>
  );
}
