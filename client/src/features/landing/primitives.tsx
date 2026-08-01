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
 * Why placeholder tiles instead of stock photos: the design system
 * deliberately uses labelled, brand-tinted tiles so the marketing page
 * ships zero image bytes and reads as "your photos go here".
 */

import type { CSSProperties, ReactNode } from "react";

/* ── Brand logo ─────────────────────────────────────────────── */

/**
 * TKMark — the geometric "kept moment" mark: a cobalt photo-book cover
 * with a gold keepsake bookmark and a framed horizon line.
 */
export function TKMark({ size = 36 }: { size?: number }) {
  const cover = "#1D46A0";
  const gold = "#F5D547";
  const paper = "#FAFAF7";
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true" style={{ display: "block" }}>
      {/* book cover */}
      <rect x="6" y="4" width="32" height="40" rx="6" fill={cover} />
      {/* spine highlight */}
      <rect x="6" y="4" width="5" height="40" rx="2.5" fill="#000" opacity="0.16" />
      {/* framed photo: sky + horizon + sun */}
      <rect x="13" y="11" width="19" height="20" rx="2.5" fill={paper} />
      <circle cx="19" cy="18" r="3" fill={gold} />
      <path
        d="M13 27.5 L18.5 23 L23 26 L28 21 L32 25 V28.5 a2.5 2.5 0 0 1 -2.5 2.5 H15.5 A2.5 2.5 0 0 1 13 28.5 Z"
        fill={cover}
        opacity="0.85"
      />
      {/* gold keepsake bookmark */}
      <path d="M27 4 H33 V15 L30 12.4 L27 15 Z" fill={gold} />
    </svg>
  );
}

/** TKLogo — mark + Clash Display wordmark. `theme="dark"` for dark surfaces. */
export function TKLogo({
  size = 26,
  theme = "light",
  mark = true,
  style,
}: {
  size?: number;
  theme?: "light" | "dark";
  mark?: boolean;
  style?: CSSProperties;
}) {
  const ink = theme === "dark" ? "#FFFFFF" : "var(--tk-gunmetal)";
  return (
    <div className="tk-logo" style={{ display: "inline-flex", alignItems: "center", gap: size * 0.34, ...style }}>
      {mark ? <TKMark size={size * 1.46} /> : null}
      <span
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 600,
          fontSize: size,
          letterSpacing: "-0.02em",
          color: ink,
          lineHeight: 1,
          whiteSpace: "nowrap",
        }}
      >
        True<span style={{ color: theme === "dark" ? "#F5D547" : "var(--tk-cobalt)" }}>Keep</span>
      </span>
    </div>
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
