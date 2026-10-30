/**
 * Landing primitives — brand logo, placeholder photo tiles, and the
 * closed 3-D "mini book" used across the hero, showcase, and occasion cards.
 *
 * Ported from the TrueKeeps Design System prototypes
 * (`landing_page/logo.jsx` + `landing_page/hero-kit.jsx`), converted to
 * typed TSX. Icons come from lucide-react (statically imported per
 * component so Vite can tree-shake) instead of the prototype's runtime
 * `window.lucide` lookup.
 *
 * The logo is now the supplied raster artwork (see TKLogo). The marketing
 * sections themselves use real product photography (./assets); the
 * labelled, brand-tinted Ph tiles remain for in-app "your photos go here"
 * placeholders.
 */

import type { CSSProperties, ReactNode } from "react";
import logoIndigo40 from "./assets/logo-indigo-40.png";
import logoIndigo80 from "./assets/logo-indigo-80.png";
import logoIndigo120 from "./assets/logo-indigo-120.png";
import logoPink40 from "./assets/logo-pink-40.png";
import logoPink80 from "./assets/logo-pink-80.png";
import logoPink120 from "./assets/logo-pink-120.png";
import markIndigo32 from "./assets/mark-indigo-32.png";
import markIndigo64 from "./assets/mark-indigo-64.png";
import markIndigo96 from "./assets/mark-indigo-96.png";
import markPink32 from "./assets/mark-pink-32.png";
import markPink64 from "./assets/mark-pink-64.png";
import markPink96 from "./assets/mark-pink-96.png";

/* ── Brand logo ─────────────────────────────────────────────── */

/*
 * Brand artwork — raster exports of the supplied "truekeeps" logo
 * (Website Images/Website Logo - 200px), trimmed and exported at three
 * heights (40/80/120px) plus a square "tk" mark (32/64/96px).
 *
 * Sizing strategy, so every device downloads only what it needs:
 *  - `srcSet` with width descriptors + an exact `sizes` lets the browser
 *    pick the export matching rendered size × device pixel ratio (a 1×
 *    laptop pulls the 7 KB file, a 3× phone the 23 KB one).
 *  - Rendered height is a CSS custom property (--tk-logo-h), so surfaces
 *    can shrink it per breakpoint in CSS without new props.
 *  - Below 360px wide the lockup collapses to the mark via <picture>,
 *    keeping narrow phone navs from overflowing.
 * Indigo is the light-surface variant; pink is for dark surfaces.
 */

const LOGOS = {
  light: { full: [logoIndigo40, logoIndigo80, logoIndigo120], mark: [markIndigo32, markIndigo64, markIndigo96] },
  dark: { full: [logoPink40, logoPink80, logoPink120], mark: [markPink32, markPink64, markPink96] },
};

/** Width ÷ height of the trimmed wordmark export (610×120). */
const LOGO_ASPECT = 610 / 120;

/** TKMark — the square "tk" monogram on its own, `size` px square. */
export function TKMark({ size = 36, theme = "light" }: { size?: number; theme?: "light" | "dark" }) {
  const px = Math.round(size * 0.86);
  const [m1, m2, m3] = LOGOS[theme].mark;
  return (
    <img
      src={m1}
      srcSet={`${m1} 32w, ${m2} 64w, ${m3} 96w`}
      sizes={`${px}px`}
      width={px}
      height={px}
      alt=""
      aria-hidden="true"
      style={{ display: "block", borderRadius: 2 }}
    />
  );
}

/**
 * TKLogo — the full "tk truekeeps" lockup. `size` keeps its old meaning
 * (roughly the wordmark cap size) so existing call sites stay balanced;
 * the image is rendered ~1.5× that tall. `theme="dark"` swaps to pink.
 * Override the height per breakpoint with `--tk-logo-h` in CSS.
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
  const h = Math.round(size * 1.5);
  const w = Math.round(h * LOGO_ASPECT);
  const [f1, f2, f3] = LOGOS[theme].full;
  const [m1, m2, m3] = LOGOS[theme].mark;
  return (
    <picture className="tk-logo" style={{ display: "block", ["--tk-logo-h" as string]: `${h}px`, ...style }}>
      <source media="(max-width: 359px)" srcSet={`${m1} 32w, ${m2} 64w, ${m3} 96w`} sizes={`${h}px`} />
      <img
        src={f1}
        srcSet={`${f1} 203w, ${f2} 406w, ${f3} 610w`}
        sizes={`${w}px`}
        alt="truekeeps"
        width={w}
        height={h}
        style={{ display: "block", height: "var(--tk-logo-h)", width: "auto" }}
      />
    </picture>
  );
}

/* ── Placeholder photo tiles ────────────────────────────────── */

/** Warm, brand-adjacent placeholder tints — indexed deterministically. */
const TINTS = ["#E8E0CD", "#D7E0EC", "#EAD8DA", "#DCE5DE", "#E4DCC4", "#D2DCEB", "#EFE7D6", "#E0D6E0"];
export const tintFor = (i: number) => TINTS[((i % TINTS.length) + TINTS.length) % TINTS.length];

/** Ph — a single tinted placeholder tile with an optional label chip. */
export function Ph({
  label,
  i = 0,
  dark,
  style,
  className = "",
}: {
  label?: string;
  i?: number;
  dark?: boolean;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <div
      className={"ph " + (dark ? "on-dark " : "") + className}
      style={{ "--ph-bg": tintFor(i), ...style } as CSSProperties}
    >
      {label ? <small>{label}</small> : null}
    </div>
  );
}

/* ── Mini 3-D book ──────────────────────────────────────────── */

const BOOK_TONES = {
  ivory: { page: "#FAF7EE", ink: "#3C3C3B", accent: "#1D46A0", spine: "rgba(0,0,0,0.2)" },
  cobalt: { page: "#1D46A0", ink: "#FFFFFF", accent: "#F5D547", spine: "#163880" },
  blush: { page: "#F4E2E4", ink: "#3C3C3B", accent: "#DB3069", spine: "rgba(0,0,0,0.18)" },
} as const;

export type BookTone = keyof typeof BOOK_TONES;

/**
 * MiniBook — closed 3-D book with a designed cover, used as the product
 * visual everywhere on the landing page. `full` renders a full-bleed
 * cover photo with a bottom scrim; otherwise a centered title layout.
 */
export function MiniBook({
  tone = "ivory",
  title = "The Good Days",
  sub = "Moments worth keeping",
  coverLabel = "your cover photo",
  coverIdx = 1,
  full = true,
  style,
  className = "",
}: {
  tone?: BookTone;
  title?: string;
  sub?: string;
  coverLabel?: string;
  coverIdx?: number;
  full?: boolean;
  style?: CSSProperties;
  className?: string;
}) {
  const t = BOOK_TONES[tone] ?? BOOK_TONES.ivory;
  return (
    <div className={"mbook " + className} style={style}>
      <div className="mbook-i">
        <div className="mbook-spine" style={{ background: t.spine }}></div>
        <div className="mbook-pages"></div>
        <div className="mbook-cover" style={{ background: t.page }}>
          {full ? (
            <Ph i={coverIdx} dark label={coverLabel} style={{ position: "absolute", inset: 0, borderRadius: 0 }} />
          ) : null}
          <div
            className="bookcover-content"
            style={{
              justifyContent: full ? "flex-end" : "center",
              color: full ? "#fff" : t.ink,
              textAlign: full ? "left" : "center",
            }}
          >
            {full ? (
              <div
                style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.5), transparent 55%)" }}
              ></div>
            ) : null}
            <div style={{ position: "relative" }}>
              <div
                className="hero-display"
                style={{
                  fontSize: "clamp(13px, 2.1vw, 21px)",
                  fontWeight: 600,
                  lineHeight: 1.12,
                  letterSpacing: "-0.01em",
                  whiteSpace: "pre-line",
                }}
              >
                {title}
              </div>
              {!full ? <div style={{ width: 34, height: 2, background: t.accent, margin: "10px auto 0" }}></div> : null}
              <div
                style={{
                  fontSize: "clamp(8px, 1vw, 10px)",
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  opacity: 0.82,
                  marginTop: 7,
                }}
              >
                {sub}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Stars — the ★★★★★ rating string, styled by the surrounding section. */
export function Stars({ n = 5 }: { n?: number }): ReactNode {
  return <span className="stars">{"★★★★★".slice(0, n)}</span>;
}
