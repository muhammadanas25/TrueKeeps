/**
 * Brand logo, shared by the landing pages, the builder, the editor and the
 * account area.
 *
 * Artwork: the SVGs from Truekeeps-Brand-Kit/logos, used exactly as supplied.
 * The kit allows Indigo on light surfaces and white on Indigo or dark photos,
 * and rules out any other colour, shadows and outlines.
 *
 * Sizing:
 *  - Rendered height is a CSS custom property (--tk-logo-h), so surfaces can
 *    shrink it per breakpoint in CSS without new props.
 *  - Below 360px wide the lockup collapses to the mark via <picture>, keeping
 *    narrow phone navs from overflowing.
 *  - Kit minimums: full logo 120px wide, mark 24px. At this aspect the lockup
 *    reaches 120px at 24px tall, so MIN_LOGO_H guards both.
 */

import type { CSSProperties } from "react";
import logoIndigo from "./assets/truekeeps-logo-indigo.svg";
import logoWhite from "./assets/truekeeps-logo-white.svg";
import markIndigo from "./assets/truekeeps-mark-indigo.svg";
import markWhite from "./assets/truekeeps-mark-white.svg";

const LOGOS = {
  light: { full: logoIndigo, mark: markIndigo },
  dark: { full: logoWhite, mark: markWhite },
};

/** Width ÷ height of the kit's lockup (viewBox 492.83 × 96.8). */
const LOGO_ASPECT = 492.83 / 96.8;

/** Smallest height that keeps the lockup at the kit's 120px minimum width. */
const MIN_LOGO_H = 24;

/**
 * TKLogo — the full "tk truekeeps" lockup. The image renders about 1.5 × `size`
 * tall. `theme="dark"` swaps to white. Override the height per breakpoint with
 * `--tk-logo-h` in CSS.
 */
export function TKLogo({
  size = 26,
  theme = "light",
  style,
}: {
  size?: number;
  theme?: "light" | "dark";
  style?: CSSProperties;
}) {
  const h = Math.max(MIN_LOGO_H, Math.round(size * 1.5));
  const w = Math.round(h * LOGO_ASPECT);
  const { full, mark } = LOGOS[theme];
  return (
    <picture className="tk-logo" style={{ display: "block", ["--tk-logo-h" as string]: `${h}px`, ...style }}>
      <source media="(max-width: 359px)" srcSet={mark} />
      <img
        src={full}
        alt="truekeeps"
        width={w}
        height={h}
        style={{ display: "block", height: "var(--tk-logo-h)", width: "auto" }}
      />
    </picture>
  );
}
