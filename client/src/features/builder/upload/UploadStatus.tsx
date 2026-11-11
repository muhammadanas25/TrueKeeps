/**
 * Quiet upload indicators for every screen after the photos are chosen.
 *
 *  - UploadHairline: a 2px line along the top edge of the screen. Thin enough
 *    to ignore while editing, visible enough to notice it moving.
 *  - UploadPill: a few words in the nav that say what's happening, and turn
 *    into the way out when something needs the customer: no connection, or
 *    photos that have to be picked again after the tab closed.
 *  - TipLine: the rotating lines from tips.ts, on the screens built for waiting,
 *    shown as a paper note taped on, like one tucked into a family album.
 */

import { useEffect, useState } from "react";
import { CloudOff, ImagePlus, Loader2 } from "lucide-react";
import { uploadEngine } from "./engine";
import { TIP_INTERVAL_MS, type Tip, type TipKind } from "./tips";
import { useUploads } from "./UploadContext";

export function UploadHairline() {
  const { progress } = useUploads();
  if (!progress.total || progress.fraction >= 1) return null;
  return (
    <div className="ck-hairline" aria-hidden="true">
      <i style={{ transform: `scaleX(${progress.fraction})` }} />
    </div>
  );
}

export function UploadPill({ onRepick }: { onRepick?: () => void }) {
  const { progress, snapshot } = useUploads();
  if (!progress.total) return null;
  if (snapshot.offline) {
    return (
      <button type="button" className="ck-pill err" onClick={() => uploadEngine.retryNow()} title="Your photos are safe on this device. Tap to try again now.">
        <CloudOff size={13} /> <span>Waiting for a connection</span>
      </button>
    );
  }
  if (progress.active) {
    const adding = progress.inBook < progress.total;
    return (
      <span className="ck-pill" title={adding ? "Adding your photos" : "Saving the full-quality copies we print from"}>
        <Loader2 size={13} className="au-spin" />
        <span>
          <span className="ck-pill-word">{adding ? "Photos" : "HD"} </span>
          <b>{adding ? progress.inBook : progress.hdDone}</b>/{progress.total}
        </span>
      </span>
    );
  }
  if (progress.needRepick && onRepick) {
    return (
      <button type="button" className="ck-pill err" onClick={onRepick}>
        <ImagePlus size={13} /> <span>{progress.needRepick} to re-add</span>
      </button>
    );
  }
  return null;
}

/**
 * A short bold lead-in for each kind of line (see TipKind in tips.ts), so a
 * note about the customer's own photos never reads like a passing thought.
 * The warm lines need no lead-in; they speak for themselves.
 */
const LEAD: Record<TipKind, string | null> = {
  "keep-open": "One small thing:",
  photo: "About your photos:",
  advice: "Good to know:",
  thought: null,
  privacy: "Your privacy:",
  nearly: null,
  before: "Tip:",
};

/**
 * One line at a time, changing every 7 seconds, written on a paper note taped
 * to the page. Pauses while the tab is hidden so nobody comes back to a line
 * they missed half of. `lineFor` is called with a counter, so the caller
 * decides what each tick says.
 *
 * The note holds still (fixed minimum height, so the page never jumps); only
 * the words fade in, once, when the line changes. Nothing loops, so a long
 * upload costs no extra battery. It is not a live region: the lines are
 * encouragement, and the progress note announces what matters.
 */
export function TipLine({ lineFor, className = "" }: { lineFor: (n: number) => Tip; className?: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") setN((v) => v + 1);
    }, TIP_INTERVAL_MS);
    return () => clearInterval(t);
  }, []);
  const tip = lineFor(n);
  const lead = LEAD[tip.kind];
  return (
    <div className={`ck-tip ck-tip-${tip.kind} ${className}`}>
      {/* keyed on the words, so the same line repeating doesn't re-animate */}
      <p className="ck-tip-text" key={tip.text}>
        {lead ? <b>{lead} </b> : null}
        {tip.text}
      </p>
    </div>
  );
}
