/**
 * GeneratingScreen — the "we design it" beat between upload and reveal.
 *
 * Ported from `book_builder/screens1.jsx`. Steps through the copy
 * voice's status lines on a fixed cadence, then calls onDone (which
 * actually runs generatePages). Deliberately theatrical: the generation
 * itself is instant, but the pause sells the "designed for you" moment
 * and gives the reveal its weight.
 */

import { useEffect, useState } from "react";
import { BookHeart } from "lucide-react";
import type { CopyVoice } from "../data";

export function GeneratingScreen({ copy, onDone }: { copy: CopyVoice; onDone: () => void }) {
  const msgs = copy.generating;
  const [i, setI] = useState(0);
  useEffect(() => {
    const steps = msgs.map((_, k) => setTimeout(() => setI(k), k * 750));
    const fin = setTimeout(onDone, msgs.length * 750 + 500);
    return () => {
      steps.forEach(clearTimeout);
      clearTimeout(fin);
    };
    // run exactly once on mount — msgs/onDone are stable for the screen's lifetime
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="bb-screen bb-generating">
      <div className="bb-gen-book">
        <div className="bb-gen-sheet"></div>
        <div className="bb-gen-sheet"></div>
        <div className="bb-gen-sheet"></div>
        <div className="bb-gen-cover">
          <BookHeart size={44} strokeWidth={1.4} />
        </div>
      </div>
      <div>
        <div className="bb-gen-status">{msgs[i]}</div>
      </div>
      <div className="bb-gen-bar">
        <i style={{ width: ((i + 1) / msgs.length) * 100 + "%" }}></i>
      </div>
    </div>
  );
}
