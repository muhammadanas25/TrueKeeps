/**
 * useScrollReveal — reveal-on-scroll for elements carrying `.lp-reveal`.
 *
 * Ported from the updated landing prototype (`~/Downloads/landing.jsx`).
 * Approach:
 *  1. Adds `motion-ok` to <html> after the first requestAnimationFrame —
 *     idle/entrance animations in landing.css are gated behind it so
 *     nothing moves before the browser is actually painting frames
 *     (also keeps headless captures static).
 *  2. Observes every `.lp-reveal` element with IntersectionObserver and
 *     stamps `.in` once it enters the viewport (one-shot: unobserved after).
 *  3. Fallbacks: if IntersectionObserver is unavailable, or the observer
 *     never fires (headless), everything is revealed after a beat so no
 *     content can be permanently hidden.
 */

import { useEffect } from "react";

export function useScrollReveal() {
  useEffect(() => {
    // gate idle animations on real frames
    const raf = requestAnimationFrame(() => document.documentElement.classList.add("motion-ok"));

    const els = document.querySelectorAll(".lp-reveal");
    if (!("IntersectionObserver" in window)) {
      els.forEach((e) => e.classList.add("in"));
      return () => cancelAnimationFrame(raf);
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            en.target.classList.add("in");
            io.unobserve(en.target);
          }
        });
      },
      { threshold: 0.16, rootMargin: "0px 0px -8% 0px" },
    );
    els.forEach((e) => io.observe(e));
    // safety: reveal everything after a beat in case the observer never fires
    const t = setTimeout(() => els.forEach((e) => e.classList.add("in")), 1400);
    return () => {
      io.disconnect();
      clearTimeout(t);
      cancelAnimationFrame(raf);
    };
  }, []);
}
