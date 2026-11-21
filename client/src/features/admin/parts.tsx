/**
 * Small shared pieces of the admin pages: pills, KPI tiles, bar lists, a
 * sparkline, period picker, loading and error states. Kept presentational —
 * no fetching — so pages stay readable top to bottom.
 */

import type { ReactNode } from "react";
import type { Tone } from "./format";

export function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`oc-pill ${tone}`}>{children}</span>;
}

export function Kpi({ label, value, delta, tone }: { label: string; value: ReactNode; delta?: string; tone?: Tone }) {
  return (
    <div className="oc-kpi">
      <span>{label}</span>
      <b>{value}</b>
      {delta ? <span className={`d oc-tone-${tone ?? "muted"}`}>{delta}</span> : null}
    </div>
  );
}

export interface BarItem {
  label: ReactNode;
  value: number;
  shown?: ReactNode;
}

/** Horizontal bars, scaled to the largest value. */
export function Bars({ items, empty = "No data yet" }: { items: BarItem[]; empty?: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (!items.length) return <p className="oc-small">{empty}</p>;
  return (
    <div className="oc-bars">
      {items.map((i, idx) => (
        <div className="oc-bar" key={idx}>
          <span>{i.label}</span>
          <span className="track">
            <span className="fill" style={{ width: `${Math.max(1.5, (i.value / max) * 100)}%` }} />
          </span>
          <b>{i.shown ?? i.value.toLocaleString("en-US")}</b>
        </div>
      ))}
    </div>
  );
}

/** Two-series line: this period solid, previous dashed. */
export function Line({ cur, prev, label, height = 160 }: { cur: number[]; prev?: number[]; label: string; height?: number }) {
  const all = [...cur, ...(prev ?? [])];
  const max = Math.max(1, ...all);
  const n = Math.max(cur.length, 2);
  const pts = (s: number[]) => s.map((v, i) => `${(i * 700) / (n - 1)},${height - 6 - (v / max) * (height - 16)}`).join(" ");
  return (
    <svg viewBox={`0 0 700 ${height}`} preserveAspectRatio="none" role="img" aria-label={label} style={{ width: "100%", height, display: "block" }}>
      <line x1="0" y1={height - 1} x2="700" y2={height - 1} stroke="#DEE2E1" />
      <line x1="0" y1={height / 2} x2="700" y2={height / 2} stroke="#EAECEC" />
      {prev ? <polyline points={pts(prev)} fill="none" stroke="#888F8E" strokeWidth="2" strokeDasharray="5 5" vectorEffect="non-scaling-stroke" /> : null}
      <polyline points={pts(cur)} fill="none" stroke="#2A1E5C" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function Legend({ items }: { items: Array<{ label: string; dashed?: boolean; colour?: string }> }) {
  return (
    <span className="oc-row oc-small">
      {items.map((i) => (
        <span key={i.label} className="oc-row" style={{ gap: 6 }}>
          <span style={{ width: 16, height: 0, borderTop: `${i.dashed ? "2px dashed #888F8E" : `3px solid ${i.colour ?? "#2A1E5C"}`}` }} />
          {i.label}
        </span>
      ))}
    </span>
  );
}

export const PERIODS = [
  ["today", "Today"],
  ["7d", "7 days"],
  ["30d", "30 days"],
  ["90d", "90 days"],
] as const;

export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: ReadonlyArray<readonly [T, string]>; onChange: (v: T) => void; label: string }) {
  return (
    <div className="oc-seg" role="group" aria-label={label}>
      {options.map(([k, l]) => (
        <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}>
          {l}
        </button>
      ))}
    </div>
  );
}

export function Loading() {
  return <div className="oc-skel" aria-busy="true" aria-label="Loading" />;
}

export function ErrorNote({ error }: { error: unknown }) {
  return (
    <p className="oc-note bad" role="alert">
      {(error as Error)?.message ?? "Something went wrong"}
    </p>
  );
}
