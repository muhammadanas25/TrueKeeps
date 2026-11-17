/**
 * useNarrow — true while the window is phone-width.
 *
 * The flow's steps 5 and 6 show the book differently on a phone (one page
 * at a time on a dark stage, see PageRibbon) than on a wide screen (the 3-D
 * spread). That is a different component tree, not a restyle, so it is a
 * hook rather than a media query. 760px matches the builder's other phone
 * breakpoint (builder.css, editor v2).
 */

import { useEffect, useState } from "react";

export const NARROW_QUERY = "(max-width: 760px)";

export function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.matchMedia(NARROW_QUERY).matches);
  useEffect(() => {
    const mql = window.matchMedia(NARROW_QUERY);
    const on = () => setNarrow(mql.matches);
    on();
    mql.addEventListener("change", on);
    return () => mql.removeEventListener("change", on);
  }, []);
  return narrow;
}
