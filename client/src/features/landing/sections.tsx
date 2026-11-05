/**
 * Landing sections — Nav, Hero, TrustStrip, HowItWorks, Showcase,
 * Occasions, FinalCTA, Footer, plus the phone-only StickyCTA.
 *
 * Ported from the updated design-system prototypes
 * (`~/Downloads/landing.jsx` composition + `landing_page/hero.jsx` /
 * `landing_page/sections.jsx`), converted to typed TSX:
 *  - `window.lucide` icon lookups → static lucide-react imports
 *  - prototype `<a href="../book_builder/...">` CTAs → wouter <Link>
 *    into the in-app builder at /wizard; occasion cards go to their
 *    /photo-books/<slug> page, which is what search engines can index
 *  - Hero + Showcase copy comes from "Website Copywriting.docx" (Oct 2026);
 *    the voice and the single "Make my book" action follow Truekeeps-Brand-Kit
 *  - imagery is real product photography from "Website Images/" and
 *    "Website Assets/", pre-sized to WebP in ./assets (srcset picks
 *    1280w vs 2400w; phones get the designer's square crops, 800w/1200w)
 *  - no reviews, ratings or testimonials until real ones exist (PRODUCT.md,
 *    "Evidence on Hand"), and every claim here must be one the product or the
 *    business can stand behind
 *  - prerendered at build time (scripts/prerender.mjs): anything touching the
 *    browser must stay inside an effect
 *  - phones (≤720px): How it works and Occasions become swipe rails
 *    (SwipeRail) to keep the page short; desktop layout is untouched
 */

import { Children, useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { ArrowRight, Baby, Cake, Check, Eye, Heart, MessageCircle, Plane, ShieldCheck, Truck } from "lucide-react";
import { TKLogo } from "./primitives";
import { BOOK_IMAGES } from "./book-images";
import heroSm from "./assets/hero-1280.webp";
import heroLg from "./assets/hero-2400.webp";
import heroM800 from "./assets/hero-mobile-800.webp";
import heroM1200 from "./assets/hero-mobile-1200.webp";
import keepSm from "./assets/keepsake-1280.webp";
import keepLg from "./assets/keepsake-2400.webp";
import keepM800 from "./assets/keepsake-mobile-800.webp";
import keepM1200 from "./assets/keepsake-mobile-1200.webp";
import ctaSm from "./assets/cta-1280.webp";
import ctaLg from "./assets/cta-2400.webp";
import ctaM800 from "./assets/cta-mobile-800.webp";
import ctaM1200 from "./assets/cta-mobile-1200.webp";
import how3 from "./assets/how-3.webp";
import { AccountMenu } from "@/features/auth/AccountMenu";
import { formatPKR, PRICE_LIST } from "@shared/pricing";
import { BOOK_TYPES, PRICE_SUMMARY, SITE } from "@shared/site";

/** Route the marketing CTAs land on — the quiz-first book builder. */
export const BUILDER_PATH = "/wizard";

/* ── Nav ────────────────────────────────────────────────────── */

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <nav className={"lp-nav" + (scrolled ? " scrolled" : "")}>
      <div className="lp-wrap">
        <Link href="/" aria-label={`${SITE.name} home`}>
          <TKLogo size={23} />
        </Link>
        <div className="lp-nav-links">
          {/* full paths: the nav also appears on /photo-books pages */}
          <a href="/#how">How it works</a>
          <a href="/#book">The book</a>
          <a href="/#occasions">Occasions</a>
          <Link href="/photo-books">Prices</Link>
        </div>
        <div className="lp-nav-cta">
          <AccountMenu signInClassName="lp-nav-signin" />
          <Link href={BUILDER_PATH} className="lp-btn lp-btn-main lp-btn-sm">
            Make my book
          </Link>
        </div>
      </div>
    </nav>
  );
}

/* ── Full-bleed banner photo ────────────────────────────────── */

/** One banner's exports: wide desktop shot + the square phone crop. */
type BannerSet = { sm: string; lg: string; m800: string; m1200: string };

const HERO_PHOTO: BannerSet = { sm: heroSm, lg: heroLg, m800: heroM800, m1200: heroM1200 };
const KEEP_PHOTO: BannerSet = { sm: keepSm, lg: keepLg, m800: keepM800, m1200: keepM1200 };
const CTA_PHOTO: BannerSet = { sm: ctaSm, lg: ctaLg, m800: ctaM800, m1200: ctaM1200 };

/**
 * BannerPhoto — responsive full-bleed photo behind a banner section.
 * Desktop gets the wide shot (srcset 1280w/2400w); ≤720px gets the
 * designer-supplied square phone crop (800w/1200w, picked by DPR).
 * `eager` for the hero (LCP); everything else lazy-loads.
 */
function BannerPhoto({ set, eager, className, alt = "" }: { set: BannerSet; eager?: boolean; className?: string; alt?: string }) {
  return (
    <picture className={"lp-banner-photo" + (className ? " " + className : "")}>
      <source media="(max-width: 720px)" srcSet={`${set.m800} 800w, ${set.m1200} 1200w`} sizes="100vw" />
      <img
        src={set.sm}
        srcSet={`${set.sm} 1280w, ${set.lg} 2400w`}
        sizes="100vw"
        alt={alt}
        loading={eager ? "eager" : "lazy"}
        // React 18 only accepts the lowercase DOM attribute
        {...(eager ? { fetchpriority: "high" } : {})}
        decoding="async"
      />
    </picture>
  );
}

/* ── Hero — banner photo with copy over the open tabletop ────── */

export function Hero() {
  return (
    <header className="lp-hero">
      <BannerPhoto set={HERO_PHOTO} eager alt="Printed photo book on a table, with a family photo on the cover" />
      <div className="lp-wrap">
        <div className="lp-hero-copy">
          <h1>
            Your best moments deserve more than <span className="lp-mark">a phone.</span>
          </h1>
          <p className="sub">
            Design it yourself in minutes, or let us create it for you. Then hold it, share it, and keep it forever.
          </p>
          <div className="lp-hero-actions">
            <Link href={BUILDER_PATH} className="lp-btn lp-btn-main lp-btn-lg">
              Make my book <ArrowRight size={18} />
            </Link>
            <Link href="/photo-books" className="lp-btn lp-btn-outline-light lp-btn-lg">
              See designs
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}

/* ── Trust strip ────────────────────────────────────────────── */

export function TrustStrip() {
  const items = [
    { icon: Eye, text: <span><b>See every page</b> before you pay</span> },
    { icon: Truck, text: <span><b>Free shipping</b> from {formatPKR(PRICE_LIST.freeShippingFromMinor)}</span> },
    { icon: ShieldCheck, text: <span><b>Love-it</b> guarantee</span> },
    { icon: MessageCircle, text: <span><b>Help on WhatsApp</b>, 10am to 6pm</span> },
  ];
  return (
    <div className="lp-trust">
      <div className="lp-wrap">
        {items.map((it, k) => (
          <div key={k} style={{ display: "contents" }}>
            <div className="lp-trust-item">
              <it.icon size={18} strokeWidth={1.8} /> {it.text}
            </div>
            {k < items.length - 1 ? <div className="lp-trust-rule"></div> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Swipe rail ─────────────────────────────────────────────── */

/**
 * SwipeRail — a row that CSS turns into a native scroll-snap rail on phones
 * (`.lp-rail` in landing.css) and leaves as the normal grid on desktop.
 *
 * Scrolling and snapping stay entirely native, so this only adds the things
 * CSS can't do:
 *  1. Detect real overflow (ResizeObserver), so dots and the keyboard tab stop
 *     exist only while the row actually scrolls, never on desktop.
 *  2. Map scroll progress onto a dot: round(scrollLeft / maxScroll × last).
 *     Progress rather than nearest-card, because on a rail showing more than
 *     one card the last few cards can never reach the left edge.
 *
 * The dots are a decorative position cue (aria-hidden, not controls); people
 * move the rail by swiping or by keyboard scroll.
 */
function SwipeRail({ className, label, children }: { className: string; label: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const [active, setActive] = useState(0);
  const count = Children.count(children);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setOverflowing(el.scrollWidth > el.clientWidth + 1);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    if (max > 0) setActive(Math.round((el.scrollLeft / max) * (count - 1)));
  };

  return (
    <>
      <div
        ref={ref}
        className={"lp-rail " + className}
        role="group"
        aria-label={label}
        tabIndex={overflowing ? 0 : undefined}
        onScroll={onScroll}
      >
        {children}
      </div>
      {overflowing ? (
        <div className="lp-rail-dots" aria-hidden="true">
          {Array.from({ length: count }, (_, k) => (
            <span key={k} className={k === active ? "on" : undefined} />
          ))}
        </div>
      ) : null}
    </>
  );
}

/* ── How it works ───────────────────────────────────────────── */

/*
 * Step art. The designer's illustrations for steps 1 and 2 had an off-brand
 * blue selected state baked into the image; drawing them here keeps selection
 * in Indigo, and uses the same words as the quiz ("New baby").
 */

const OCCASION_TILES = [
  { icon: Heart, label: "Wedding", on: true },
  { icon: Baby, label: "New baby", on: false },
  { icon: Cake, label: "Birthday", on: false },
  { icon: Plane, label: "Travel", on: false },
];

function OccasionArt() {
  return (
    <div className="lp-art lp-art-occ" role="img" aria-label="Choosing Wedding from a grid of occasions">
      {OCCASION_TILES.map((t) => (
        <div className={"lp-art-tile" + (t.on ? " on" : "")} key={t.label}>
          <t.icon size={20} strokeWidth={1.8} aria-hidden="true" />
          {t.label}
          {t.on ? (
            <span className="lp-art-check">
              <Check size={12} strokeWidth={3} aria-hidden="true" />
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function PickPhotosArt() {
  return (
    <div className="lp-art lp-art-pick" role="img" aria-label="Selecting photos to add">
      {[true, true, false, false, false, false].map((on, k) => (
        <div className={"lp-art-tile" + (on ? " on" : "")} key={k}>
          {on ? (
            <span className="lp-art-check">
              <Check size={12} strokeWidth={3} aria-hidden="true" />
            </span>
          ) : (
            <span className="lp-art-box" />
          )}
        </div>
      ))}
    </div>
  );
}

export function HowItWorks() {
  return (
    <section className="lp-section" id="how">
      <div className="lp-wrap lp-center">
        <div className="lp-eyebrow center">How it works</div>
        <h2 className="lp-h2">
          From camera roll to keepsake
          <br className="lp-desk-only" /> in about a minute.
        </h2>
        <p className="lp-lede">
          No blank canvas, no design skills. Answer one question, add your photos, and we lay out the whole book for
          you. Change anything you like, or just order it.
        </p>
      </div>
      <div className="lp-wrap">
        <SwipeRail className="lp-steps" label="How it works, three steps">
          <div className="lp-step lp-reveal">
            <div className="lp-step-vis">
              <OccasionArt />
            </div>
            <h3>
              <span className="lp-step-num">1</span>
              Pick the moment
            </h3>
            <p>Wedding, a new baby, the trip of a lifetime. Tell us what you're celebrating and we set the tone.</p>
          </div>
          <div className="lp-step lp-reveal">
            <div className="lp-step-vis">
              <PickPhotosArt />
            </div>
            <h3>
              <span className="lp-step-num">2</span>
              Add your photos
            </h3>
            <p>Add a handful or a whole album. We'll tell you if a photo might print blurry, so there are no surprises.</p>
          </div>
          <div className="lp-step lp-reveal">
            <div className="lp-step-vis">
              <img src={how3} alt="A finished hardcover photo book" width={521} height={255} loading="lazy" />
            </div>
            <h3>
              <span className="lp-step-num">3</span>
              We design it
            </h3>
            <p>A complete book appears, with cover, layouts and captions. See every page, change anything, then order.</p>
          </div>
        </SwipeRail>
        <div className="lp-steps-cta">
          <Link href={BUILDER_PATH} className="lp-btn lp-btn-main lp-btn-lg">
            Make my book <ArrowRight size={18} />
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ── Showcase: what you'll hold ─────────────────────────────── */

/*
 * Feature art: small bespoke drawings in Rose and white instead of stock line
 * icons, each one depicting the actual
 * product detail: a square hardcover with its 12" dimension rule, a
 * glossy sheet over a matte one, and an open spread with a check.
 */

const ART_ROSE = "var(--tk-rose-500)";
const ART_SOFT = "var(--tk-rose-200)";

function ArtHardcover() {
  return (
    <svg viewBox="0 0 56 56" aria-hidden="true">
      <rect x="12" y="7" width="34" height="34" rx="3" fill={ART_ROSE} />
      <rect x="12" y="7" width="6" height="34" rx="2" fill="#000" opacity="0.18" />
      <rect x="22" y="13" width="18" height="16" rx="1.5" fill="#fff" />
      <path d="M22 29 l5-5 4 3 4-4 5 6 z" fill={ART_SOFT} />
      <circle cx="35.5" cy="17.5" r="2" fill={ART_SOFT} />
      <path d="M12 48.5 H46 M12 46 v5 M46 46 v5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" opacity="0.75" />
    </svg>
  );
}

function ArtFinish() {
  return (
    <svg viewBox="0 0 56 56" aria-hidden="true">
      <defs>
        <linearGradient id="lp-art-sheen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.85" />
          <stop offset="0.45" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="7" y="7" width="28" height="28" rx="3" fill="#fff" opacity="0.3" />
      <rect x="21" y="21" width="28" height="28" rx="3" fill={ART_SOFT} />
      <rect x="21" y="21" width="28" height="28" rx="3" fill="url(#lp-art-sheen)" />
      <path d="M27 27 L35 27 L27 35 Z" fill="#fff" opacity="0.6" />
    </svg>
  );
}

function ArtPreview() {
  return (
    <svg viewBox="0 0 56 56" aria-hidden="true">
      <path d="M5 14 Q16 10 28 14 V44 Q16 40 5 44 Z" fill="#fff" />
      <path d="M51 14 Q40 10 28 14 V44 Q40 40 51 44 Z" fill="#fff" opacity="0.82" />
      <rect x="9" y="18" width="15" height="11" rx="1.5" fill={ART_ROSE} />
      <rect x="32" y="18" width="15" height="6" rx="1.5" fill={ART_SOFT} />
      <rect x="32" y="27" width="15" height="6" rx="1.5" fill={ART_ROSE} opacity="0.55" />
      <circle cx="44" cy="44" r="8" fill={ART_ROSE} stroke="var(--surface-dark)" strokeWidth="1.5" />
      <path d="M40.3 44.2 l2.6 2.6 l5-5.2" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Showcase() {
  const features = [
    { Art: ArtHardcover, h: "Big 12×12 pages", p: "Large square pages that give your photos the space they deserve." },
    { Art: ArtFinish, h: "Glossy or matte, your choice", p: "Pick the finish that feels right for your memories." },
    { Art: ArtPreview, h: "What you see is what you get", p: "Preview every page before you order. No surprises, just your book." },
  ];
  return (
    <section className="lp-showcase" id="book">
      <BannerPhoto set={KEEP_PHOTO} alt="A mother and child looking through a printed hardcover photo book of a newborn" />
      <div className="lp-showcase-copy">
        <div className="lp-eyebrow">What you'll hold</div>
        <h2 className="lp-h2">
          Not a print-out.
          <br />A <span className="lp-mark">real keepsake.</span>
        </h2>
        <p className="lp-lede">
          A big, beautiful book you can hold in your hands, share with family, and keep for years. Not lost in a phone.
        </p>
        <div className="lp-quality">
          {features.map((q) => (
            <div className="lp-qrow lp-reveal" key={q.h}>
              <div className="lp-qart">
                <q.Art />
              </div>
              <div>
                <h4>{q.h}</h4>
                <p>{q.p}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Occasions ──────────────────────────────────────────────── */

export function Occasions() {
  return (
    <section className="lp-section" id="occasions">
      <div className="lp-wrap lp-center">
        <div className="lp-eyebrow center">Made for your story</div>
        <h2 className="lp-h2">
          One book for every
          <br />
          kind of moment.
        </h2>
      </div>
      <div className="lp-wrap">
        <SwipeRail className="lp-occ-grid" label="Book types">
          {/* crawlable links to each book page; the page's button opens the builder */}
          {BOOK_TYPES.map((b) => (
            <Link href={`/photo-books/${b.slug}`} className="lp-occ-card lp-reveal" key={b.slug}>
              <div className="lp-occ-img">
                <img src={BOOK_IMAGES[b.slug]} alt={b.imageAlt} width={720} height={720} loading="lazy" decoding="async" />
              </div>
              <h4>{b.label}</h4>
              <p>{b.blurb}</p>
            </Link>
          ))}
        </SwipeRail>
      </div>
    </section>
  );
}

/* ── What, where, how much ───────────────────────────────────── */

/**
 * The plain answer search engines and AI assistants look for, and that a
 * first-time visitor wants too: what this is, where it delivers, what it costs.
 */
export function PlainFacts() {
  return (
    <section className="lp-facts">
      <div className="lp-wrap lp-center">
        <h2 className="lp-h2">Photo books, delivered across Pakistan.</h2>
        <p className="lp-lede">
          {SITE.name} turns the photos on your phone into a printed 12×12 inch photo book. {PRICE_SUMMARY}, with flat{" "}
          {formatPKR(PRICE_LIST.shippingMinor)} delivery nationwide, free from {formatPKR(PRICE_LIST.freeShippingFromMinor)}.
        </p>
        <Link href="/photo-books" className="lp-link">
          See prices and questions <ArrowRight size={16} />
        </Link>
      </div>
    </section>
  );
}

/* ── Final CTA ──────────────────────────────────────────────── */

/**
 * FinalCTA — the page closes on a real book, as it opened. `showDesigns` is off
 * on the /photo-books hub, where "See designs" would link to the page itself.
 */
export function FinalCTA({ showDesigns = true }: { showDesigns?: boolean }) {
  return (
    <section className="lp-cta">
      <BannerPhoto set={CTA_PHOTO} alt="A printed photo book on a table, with a child on the cover holding a first day of school sign" />
      <div className="lp-wrap">
        <div className="lp-cta-inner">
          <div className="lp-eyebrow">Your story is already written</div>
          <h2 className="lp-h2">Don’t let your best photos get lost.</h2>
          <p>Start for free. We design your whole book, you make it yours, and you only pay when you love it.</p>
          <div className="lp-cta-actions">
            <Link href={BUILDER_PATH} className="lp-btn lp-btn-main lp-btn-lg">
              Make my book <ArrowRight size={18} />
            </Link>
            {showDesigns ? (
              <Link href="/photo-books" className="lp-btn lp-btn-outline-light lp-btn-lg">
                See designs
              </Link>
            ) : null}
          </div>
          <div className="lp-cta-sub">Free to start · No design skills needed · See every page before you pay</div>
        </div>
      </div>
    </section>
  );
}

/* ── Sticky CTA (phones) ────────────────────────────────────── */

/**
 * StickyCTA — keeps "Make my book" in thumb reach on phones (landing.css hides
 * it above 720px). Shown only between the hero button leaving the screen and
 * the final CTA arriving, so it never duplicates a button already in view and
 * never sits on top of the footer.
 *
 * Both checks treat "scrolled past" as well as "visible" so the state stays
 * right after a reload partway down the page. The hidden state uses
 * `visibility`, which also takes the link out of the tab order.
 */
export function StickyCTA() {
  const [pastHero, setPastHero] = useState(false);
  const [atEnd, setAtEnd] = useState(false);

  useEffect(() => {
    const hero = document.querySelector(".lp-hero-actions");
    const end = document.querySelector(".lp-cta");
    if (!hero || !end || !("IntersectionObserver" in window)) return;
    const heroIO = new IntersectionObserver(
      ([e]) => setPastHero(!e.isIntersecting && e.boundingClientRect.top < 0),
      { rootMargin: "-60px 0px 0px 0px" }, // the sticky nav covers the top 60px
    );
    const endIO = new IntersectionObserver(([e]) => setAtEnd(e.isIntersecting || e.boundingClientRect.top < 0));
    heroIO.observe(hero);
    endIO.observe(end);
    return () => {
      heroIO.disconnect();
      endIO.disconnect();
    };
  }, []);

  return (
    <div className={"lp-sticky-cta" + (pastHero && !atEnd ? " on" : "")}>
      <Link href={BUILDER_PATH} className="lp-btn lp-btn-main">
        Make my book <ArrowRight size={18} />
      </Link>
    </div>
  );
}

/* ── Footer ─────────────────────────────────────────────────── */

export function Footer() {
  // Only links that lead somewhere real. Add Privacy, Terms and Contact here
  // once those pages exist.
  const cols = [
    { h: "Photo books", links: BOOK_TYPES.slice(0, 4).map((b) => ({ label: b.label, href: `/photo-books/${b.slug}` })) },
    {
      h: "More",
      links: [
        ...BOOK_TYPES.slice(4).map((b) => ({ label: b.label, href: `/photo-books/${b.slug}` })),
        { label: "Prices", href: "/photo-books" },
      ],
    },
    {
      h: "Your account",
      links: [
        { label: "My books", href: "/books" },
        { label: "My orders", href: "/orders" },
        { label: "Account", href: "/account" },
      ],
    },
  ];
  return (
    <footer className="lp-footer">
      <div className="lp-wrap">
        <div className="lp-footer-brand">
          <TKLogo size={24} theme="dark" />
          <p>{SITE.tagline} Turning the photos on your phone into keepsakes worth holding, delivered across Pakistan.</p>
        </div>
        {cols.map((c, k) => (
          <div className="lp-fcol" key={k}>
            <h5>{c.h}</h5>
            {c.links.map((l) => (
              <Link href={l.href} key={l.href}>
                {l.label}
              </Link>
            ))}
          </div>
        ))}
      </div>
      <div className="lp-wrap">
        <div className="lp-footer-bar">
          {/* the prerendered year can lag a rebuild across New Year */}
          <span suppressHydrationWarning>© {new Date().getFullYear()} {SITE.name}. All rights reserved.</span>
        </div>
      </div>
    </footer>
  );
}
