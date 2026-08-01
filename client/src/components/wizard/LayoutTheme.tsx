import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import type { WizardState, LayoutStyle } from "@/lib/wizard-types";
import type { Theme } from "@shared/schema";
import { cn } from "@/lib/utils";

interface Props {
  state: WizardState;
  onChange: (updates: Partial<Pick<WizardState, "layoutStyle" | "themeId" | "themeName" | "themeImageUrl">>) => void;
}

const LAYOUTS: { key: LayoutStyle; label: string; description: string; rows: number[][] }[] = [
  { key: "classic",   label: "Classic",   description: "1–2 large photos per page", rows: [[2, 2]] },
  { key: "editorial", label: "Editorial", description: "Mixed sizes, magazine feel", rows: [[3, 1, 1]] },
  { key: "grid",      label: "Grid",      description: "Even grid of photos",        rows: [[2, 2], [2, 2]] },
  { key: "collage",   label: "Collage",   description: "Overlapping, playful",       rows: [[1, 2, 1]] },
  { key: "minimal",   label: "Minimal",   description: "One photo, lots of space",   rows: [[4]] },
];

const CATEGORIES = ["All", "Wedding", "Travel", "Family", "Baby", "Simple"];

function LayoutCard({ layout, selected, onClick }: { layout: typeof LAYOUTS[0]; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("select-card text-left w-full", selected && "selected")}
    >
      <div
        className="w-full rounded-lg mb-3 p-2 flex flex-col gap-1"
        style={{ background: selected ? "rgba(29,75,166,0.07)" : "#F4F2E8", aspectRatio: "4/3" }}
      >
        {layout.rows.map((row, ri) => (
          <div key={ri} className="flex gap-1 flex-1">
            {row.map((size, ci) => (
              <div
                key={ci}
                className="rounded-sm flex-1"
                style={{ flexGrow: size, background: selected ? "#1D4BA6" : "#c8c5b5", minWidth: 0 }}
              />
            ))}
          </div>
        ))}
      </div>
      <p className="text-sm font-semibold" style={{ color: selected ? "#1D4BA6" : "#3C3C3B" }}>{layout.label}</p>
      <p className="text-xs mt-0.5" style={{ color: "#9b9b97" }}>{layout.description}</p>
    </button>
  );
}

export function LayoutTheme({ state, onChange }: Props) {
  const [cat, setCat] = useState("All");

  const { data: themes = [], isLoading } = useQuery<Theme[]>({
    queryKey: ["/api/themes"],
    queryFn: async () => {
      const res = await fetch("/api/themes");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const visibleThemes = cat === "All" ? themes : themes.filter(t => t.category === cat);

  return (
    <div className="max-w-3xl mx-auto w-full space-y-10">
      <div className="text-center">
        <h2 className="text-3xl font-bold mb-2" style={{ fontFamily: "var(--font-display)", color: "#3C3C3B" }}>
          Layout &amp; Theme
        </h2>
        <p className="text-sm" style={{ color: "#6b6b69" }}>
          Choose how photos are arranged and the visual style of your book.
        </p>
      </div>

      {/* Layout Style */}
      <div>
        <h3 className="text-sm font-semibold mb-4" style={{ color: "#3C3C3B" }}>Layout Style</h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {LAYOUTS.map(l => (
            <LayoutCard
              key={l.key}
              layout={l}
              selected={state.layoutStyle === l.key}
              onClick={() => onChange({ layoutStyle: l.key })}
            />
          ))}
        </div>
      </div>

      {/* Theme */}
      <div>
        <h3 className="text-sm font-semibold mb-4" style={{ color: "#3C3C3B" }}>Theme</h3>
        <div className="flex flex-wrap gap-2 mb-5">
          {CATEGORIES.map(c => (
            <button
              key={c}
              type="button"
              className="option-chip"
              style={cat === c ? { background: "#1D4BA6", color: "#fff", borderColor: "#1D4BA6" } : {}}
              onClick={() => setCat(c)}
            >
              {c}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: "#1D4BA6" }} />
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {visibleThemes.map(theme => {
              const selected = state.themeId === theme.id;
              return (
                <button
                  key={theme.id}
                  type="button"
                  className={cn("select-card relative p-0 overflow-hidden text-left", selected && "selected")}
                  onClick={() => onChange({ themeId: theme.id, themeName: theme.name, themeImageUrl: theme.imageUrl ?? "" })}
                >
                  <div className="aspect-[3/4] overflow-hidden">
                    <img
                      src={theme.imageUrl ?? ""}
                      alt={theme.name}
                      className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
                    />
                  </div>
                  <div className="p-3">
                    <p className="text-sm font-semibold leading-tight" style={{ color: selected ? "#1D4BA6" : "#3C3C3B" }}>
                      {theme.name}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "#9b9b97" }}>from ${theme.price}</p>
                  </div>
                  {selected && (
                    <div className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center" style={{ background: "#1D4BA6" }}>
                      <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
