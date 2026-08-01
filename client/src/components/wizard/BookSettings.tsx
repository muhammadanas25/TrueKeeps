import { useState } from "react";
import { Input } from "@/components/ui/input";
import { BOOK_SIZES, PAGE_COUNTS, PAPER_FINISHES, BINDINGS, BASE_PRICE } from "@/lib/config";
import type { WizardState } from "@/lib/wizard-types";
import { cn } from "@/lib/utils";

interface Props {
  state: WizardState;
  onChange: (updates: Partial<WizardState["bookSettings"]>) => void;
}

function Chip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="option-chip"
      style={selected ? { background: "#1D4BA6", color: "#fff", borderColor: "#1D4BA6" } : {}}
    >
      {label}
    </button>
  );
}

function SizeCard({
  sizeKey, label, ratio, extraCost, selected, onClick,
}: {
  sizeKey: string; label: string; ratio: number; extraCost: number; selected: boolean; onClick: () => void;
}) {
  const w = ratio >= 1 ? 56 : Math.round(56 * ratio);
  const h = ratio <= 1 ? 56 : Math.round(56 / ratio);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("select-card flex flex-col items-center gap-3 p-5 w-full", selected && "selected")}
    >
      {/* Aspect ratio preview */}
      <div
        className="rounded-sm"
        style={{
          width: w,
          height: h,
          background: selected ? "rgba(29,75,166,0.12)" : "#EBEBD3",
          border: `2px solid ${selected ? "#1D4BA6" : "#d8d5c5"}`,
          transition: "all 0.2s",
        }}
      />
      <div className="text-center">
        <p className="text-sm font-semibold" style={{ color: selected ? "#1D4BA6" : "#3C3C3B" }}>{label}</p>
        {extraCost > 0 && (
          <p className="text-xs mt-0.5" style={{ color: "#D85365" }}>+${extraCost}</p>
        )}
      </div>
    </button>
  );
}

export function BookSettings({ state, onChange }: Props) {
  const s = state.bookSettings;

  const price =
    BASE_PRICE +
    BOOK_SIZES[s.size].price +
    BINDINGS[s.binding].price +
    Math.max(0, (s.pageCount - 20) / 10) * 2;

  return (
    <div className="max-w-2xl mx-auto w-full space-y-10">
      <div className="text-center">
        <h2 className="text-3xl font-bold mb-2" style={{ fontFamily: "var(--font-display)", color: "#3C3C3B" }}>
          Book Settings
        </h2>
        <p className="text-sm" style={{ color: "#6b6b69" }}>Customise your book before uploading photos.</p>
      </div>

      {/* Book Name */}
      <div>
        <label className="block text-sm font-semibold mb-2" style={{ color: "#3C3C3B" }}>
          Book Name
        </label>
        <Input
          placeholder="e.g. Summer in Greece 2024"
          value={s.name}
          onChange={e => onChange({ name: e.target.value })}
          className="text-base"
          style={{ borderColor: "#d8d5c5", background: "#fff" }}
        />
      </div>

      {/* Book Size */}
      <div>
        <label className="block text-sm font-semibold mb-3" style={{ color: "#3C3C3B" }}>Book Size</label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(Object.entries(BOOK_SIZES) as [keyof typeof BOOK_SIZES, typeof BOOK_SIZES[keyof typeof BOOK_SIZES]][]).map(
            ([key, val]) => (
              <SizeCard
                key={key}
                sizeKey={key}
                label={val.label}
                ratio={val.ratio}
                extraCost={val.price}
                selected={s.size === key}
                onClick={() => onChange({ size: key })}
              />
            )
          )}
        </div>
      </div>

      {/* Page Count */}
      <div>
        <label className="block text-sm font-semibold mb-3" style={{ color: "#3C3C3B" }}>Page Count</label>
        <div className="flex flex-wrap gap-2">
          {PAGE_COUNTS.map(n => (
            <Chip key={n} label={`${n} pages`} selected={s.pageCount === n} onClick={() => onChange({ pageCount: n })} />
          ))}
        </div>
      </div>

      {/* Paper Finish */}
      <div>
        <label className="block text-sm font-semibold mb-3" style={{ color: "#3C3C3B" }}>Paper Finish</label>
        <div className="flex flex-wrap gap-2">
          {(Object.entries(PAPER_FINISHES) as [keyof typeof PAPER_FINISHES, { label: string; description: string }][]).map(
            ([key, val]) => (
              <div key={key} className="flex flex-col items-start">
                <Chip
                  label={val.label}
                  selected={s.paperFinish === key}
                  onClick={() => onChange({ paperFinish: key })}
                />
                <span className="text-xs ml-4 mt-1" style={{ color: "#9b9b97" }}>{val.description}</span>
              </div>
            )
          )}
        </div>
      </div>

      {/* Binding */}
      <div>
        <label className="block text-sm font-semibold mb-3" style={{ color: "#3C3C3B" }}>Binding</label>
        <div className="flex flex-wrap gap-2">
          {(Object.entries(BINDINGS) as [keyof typeof BINDINGS, { label: string; price: number }][]).map(
            ([key, val]) => (
              <Chip
                key={key}
                label={val.label}
                selected={s.binding === key}
                onClick={() => onChange({ binding: key })}
              />
            )
          )}
        </div>
      </div>

      {/* Price estimate */}
      <div
        className="flex items-center justify-between rounded-2xl px-6 py-4"
        style={{ background: "rgba(29,75,166,0.06)", border: "1px solid rgba(29,75,166,0.12)" }}
      >
        <span className="text-sm font-medium" style={{ color: "#3C3C3B" }}>Estimated price</span>
        <span className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)", color: "#1D4BA6" }}>
          ${price.toFixed(2)}
        </span>
      </div>
    </div>
  );
}
