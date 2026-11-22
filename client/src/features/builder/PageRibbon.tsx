/**
 * PageRibbon — the book on a phone, one page at a time ("Option C", owner's
 * pick on 2026-11-17).
 *
 * What: every page of the book side by side on a dark stage, each as big as
 * the stage allows, swiped sideways like reading it. The cover (with its
 * spine) can go first. A counter and two arrow buttons sit under it.
 *
 * Why: a two-page spread squeezed into a phone's width made each page less
 * than half the screen, which is too small to judge a photo book by. One page
 * at a time is about twice the size, and the spreads stay readable because
 * the two pages of a spread sit flush while a gap separates one spread from
 * the next.
 *
 * Approach:
 *  - Native horizontal scrolling with scroll-snap, so the swipe is the
 *    browser's own (momentum, accessibility, no gesture code to get wrong).
 *  - The page size is measured, not guessed: a ResizeObserver on the stage
 *    gives its box, and the page is the largest square that fits with room
 *    for the neighbours to peek in. The bottom sheet beside it can grow
 *    (an open disclosure) and the page shrinks to match.
 *  - Scroll stops are worked out from that same size (stops()), so the
 *    counter, the arrows and "jump to page" all agree with where the browser
 *    snaps. Spacers at both ends let the first and last page centre.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageFace } from "./book";
import type { BookPage, BookTheme, BuilderPhoto, Occasion } from "./data";

/** Gap between one spread and the next, px. */
const GAP = 16;
/** Room left for the neighbouring pages to peek in at each side, px. */
const PEEK = 28;

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function PageRibbon({
  pages,
  photos,
  theme,
  title,
  occasion,
  cover,
  spine,
  index,
  onIndex,
  resetKey,
  label = "Your book",
}: {
  pages: BookPage[];
  photos: BuilderPhoto[];
  theme: BookTheme;
  title: string;
  occasion: Occasion;
  /** the front cover, shown first when given */
  cover?: ReactNode;
  /** the spine beside the cover: its colour and the title on it */
  spine?: { bg: string; ink: string; font?: string };
  /** which stop is showing (0 = the cover when there is one) */
  index: number;
  onIndex: (i: number) => void;
  /** when this changes the book is a new book: go back to its start */
  resetKey?: string;
  label?: string;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  // While the code is moving the rail, its scroll events are not the customer's.
  const hold = useRef(0);

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const ps = Math.max(140, Math.floor(Math.min(box.w - PEEK * 2, box.h - 8)));
  const spineW = cover && spine ? Math.round(ps * 0.07) : 0;
  const hasCover = Boolean(cover);
  // The cover stands alone (owner, 2026-11-22: "front cover not showing on
  // mobile"): page 1 starts past the edge of the stage while the cover is in
  // the middle, so only the cover and its spine are in view.
  // The space beside a centred page is half of what the page leaves of the
  // stage, which grows when the stage is short and the page shrinks to fit.
  const coverGap = GAP + Math.ceil(Math.max(PEEK, (box.w - ps) / 2)) + 8;
  const count = pages.length + (hasCover ? 1 : 0);

  /** Scroll offset at which stop i sits in the middle of the stage. */
  const stops = useMemo(() => {
    const out: number[] = [];
    if (hasCover) out.push(0);
    const first = hasCover ? ps + coverGap : 0;
    for (let k = 0; k < pages.length; k++) out.push(first + k * ps + Math.floor(k / 2) * GAP);
    return out;
  }, [hasCover, ps, pages.length]);

  const go = useCallback(
    (i: number, smooth: boolean) => {
      const el = railRef.current;
      if (!el || !stops.length) return;
      const at = stops[Math.max(0, Math.min(stops.length - 1, i))];
      hold.current = Date.now() + (smooth ? 650 : 120);
      if (smooth && !reducedMotion() && el.scrollTo) el.scrollTo({ left: at, behavior: "smooth" });
      else el.scrollLeft = at;
    },
    [stops],
  );

  // A new size (the sheet opened) or a new book: put the right page back in view.
  const indexRef = useRef(index);
  indexRef.current = index;
  useLayoutEffect(() => {
    if (ps > 0) go(indexRef.current, false);
  }, [ps, go]);
  const firstReset = useRef(true);
  useEffect(() => {
    if (firstReset.current) {
      firstReset.current = false;
      return;
    }
    onIndex(0);
    go(0, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const sync = () => {
    const el = railRef.current;
    if (!el) return;
    let best = 0;
    let dist = Infinity;
    stops.forEach((at, i) => {
      const d = Math.abs(el.scrollLeft - at);
      if (d < dist) {
        dist = d;
        best = i;
      }
    });
    if (best !== indexRef.current) onIndex(best);
  };
  const settle = useRef<ReturnType<typeof setTimeout>>();
  const onScroll = () => {
    clearTimeout(settle.current);
    if (Date.now() < hold.current) {
      settle.current = setTimeout(sync, 160);
      return;
    }
    sync();
  };
  useEffect(() => () => clearTimeout(settle.current), []);

  const step = (d: number) => {
    const to = Math.max(0, Math.min(count - 1, index + d));
    if (to === index) return;
    onIndex(to);
    go(to, true);
  };

  const pad = Math.max(0, (box.w - ps) / 2);
  const spreads: Array<[BookPage, BookPage | undefined]> = [];
  for (let i = 0; i < pages.length; i += 2) spreads.push([pages[i], pages[i + 1]]);
  const where =
    hasCover && index === 0 ? "Front cover and spine" : "Page " + (hasCover ? index : index + 1) + " of " + pages.length;
  const pageStyle = { width: ps, height: ps, "--pw": ps + "px" } as CSSProperties;

  return (
    <div className="pr-root">
      <div className="pr-stage" ref={stageRef}>
        {box.w > 0 ? (
          <div className="pr-rail" ref={railRef} onScroll={onScroll} role="region" aria-roledescription="carousel" aria-label={label}>
            <div className="pr-spacer" style={{ width: pad - spineW }} aria-hidden="true" />
            {hasCover ? (
              <div className="pr-spread pr-cover" style={{ marginRight: pages.length ? coverGap : 0 }}>
                {spine ? (
                  <div className="pr-spine" style={{ width: spineW, height: ps, background: spine.bg, color: spine.ink }} aria-hidden="true">
                    <span style={{ fontFamily: spine.font, fontSize: Math.max(8, spineW * 0.42) }}>{title}</span>
                  </div>
                ) : null}
                <div className="pr-page" style={pageStyle} aria-label="Front cover">
                  {cover}
                </div>
              </div>
            ) : null}
            {spreads.map(([l, r], k) => (
              <div className="pr-spread" key={l.id} style={{ marginRight: k < spreads.length - 1 ? GAP : 0 }}>
                <div className="pr-page left" style={pageStyle} aria-label={"Page " + (2 * k + 1)}>
                  <PageFace page={l} photos={photos} theme={theme} title={title} occasion={occasion} />
                </div>
                {r ? (
                  <div className="pr-page right" style={pageStyle} aria-label={"Page " + (2 * k + 2)}>
                    <PageFace page={r} photos={photos} theme={theme} title={title} occasion={occasion} />
                  </div>
                ) : null}
              </div>
            ))}
            <div className="pr-spacer" style={{ width: pad }} aria-hidden="true" />
          </div>
        ) : null}
      </div>
      <div className="pr-nav">
        <button type="button" className="pr-arrow" onClick={() => step(-1)} disabled={index <= 0} aria-label="Previous page">
          <ChevronLeft size={20} />
        </button>
        <span className="pr-where" aria-live="polite">
          {where}
        </span>
        <button type="button" className="pr-arrow" onClick={() => step(1)} disabled={index >= count - 1} aria-label="Next page">
          <ChevronRight size={20} />
        </button>
      </div>
    </div>
  );
}
