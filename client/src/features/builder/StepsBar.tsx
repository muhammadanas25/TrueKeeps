/**
 * StepsBar — the line of seven steps under the builder's top bar.
 *
 * What (owner, 2026-11-26, canvas Round 7: Direction A, "break the line,
 * keep it jumpable"): the progress line is broken into seven segments, one
 * per step. A step already reached is a button that jumps there, forwards or
 * back. After going back to change something, a small "Back to checkout" sits
 * right beside the line and returns to the furthest step in one tap (owner,
 * 2026-11-26: kept, close to the steps; the top bar's back is a plain round
 * button). Steps not reached yet are shown but can't be pressed. Where a jump
 * lands is steps.ts jumpTo.
 *
 * The segments carry no names on screen (owner, 2026-11-26: each screen's
 * heading already names the step); "Step 4 of 7" sits beside them, and each
 * segment's accessible name says which step it is.
 */

import { ArrowRight } from "lucide-react";
import type { BuilderState } from "./state";
import { STEPS, furthestJump, jumpTo, stepOf } from "./steps";

export function StepsBar({ state, set }: { state: BuilderState; set: (patch: Partial<BuilderState>) => void }) {
  const now = stepOf(state);
  if (!now) return null;
  const reached = Math.max(state.reached, now);
  const furthest = furthestJump(reached);
  // On Check (step 6) the way to checkout is "Approve and continue", so no "Back to checkout" there
  const behind = now < furthest && !(now === 6 && furthest >= 6);
  const go = (n: number) => set(jumpTo({ ...state, reached }, n));
  return (
    <nav className="bb-steps" aria-label="Steps">
      <ol className="bb-steps-line">
        {STEPS.map((s) => {
          const state_ = s.n === now ? "now" : s.n <= furthest ? "done" : "todo";
          return (
            <li key={s.n}>
              <button
                type="button"
                className={"bb-step " + state_}
                disabled={state_ !== "done"}
                aria-current={state_ === "now" ? "step" : undefined}
                aria-label={`Step ${s.n}, ${s.name}${state_ === "now" ? ", you are here" : state_ === "todo" ? ", not reached yet" : ""}`}
                onClick={() => go(s.n)}
              >
                {/* no names on screen: each screen's heading already says which step it is (owner, 2026-11-26); the label above is for screen readers */}
                <i aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ol>
      {behind ? (
        <button type="button" className="bb-steps-back" onClick={() => go(furthest)}>
          {/* Check and checkout are one finish line to the customer (owner, 2026-11-26) */}
          {furthest >= 6 ? "Back to checkout" : `Back to ${STEPS[furthest - 1].name}`} <ArrowRight size={14} aria-hidden="true" />
        </button>
      ) : null}
      <span className={"bb-steps-label" + (behind ? " behind" : "")}>Step {now} of 7</span>
    </nav>
  );
}
