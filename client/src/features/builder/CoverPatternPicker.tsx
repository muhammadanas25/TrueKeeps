/**
 * The pattern swatches under a "Pattern" cover (owner and Aamir, 2026-11-22).
 * Used on step 6 and in the editor's cover panel; each swatch is the
 * pattern's own tile (shared/patterns.ts), so it looks like what prints.
 */

import { COVER_PATTERNS, type PatternId } from "@shared/patterns";

export function CoverPatternPicker({ value, onPick }: { value: string; onPick: (id: PatternId) => void }) {
  return (
    <div className="pat-picker" role="radiogroup" aria-label="Pattern">
      {COVER_PATTERNS.map((p) => (
        <button key={p.id} type="button" role="radio" aria-checked={value === p.id} className={"pat-swatch" + (value === p.id ? " on" : "")} onClick={() => onPick(p.id)}>
          <svg viewBox={`0 0 ${p.tile} ${p.tile}`} aria-hidden="true">
            <rect width={p.tile} height={p.tile} fill={p.ground} />
            {p.shapes.map((sh, i) =>
              sh.kind === "circle" ? (
                <circle key={i} cx={sh.x} cy={sh.y} r={sh.r} fill={sh.fill} opacity={sh.opacity} />
              ) : (
                <ellipse key={i} cx={sh.x} cy={sh.y} rx={sh.rx} ry={sh.ry} fill={sh.fill} opacity={sh.opacity} transform={`rotate(${sh.rotate} ${sh.x} ${sh.y})`} />
              ),
            )}
          </svg>
          <span>{p.name}</span>
        </button>
      ))}
    </div>
  );
}
