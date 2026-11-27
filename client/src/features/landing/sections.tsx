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
 *  - copy is the owner's "The Truekeeps: Website Copy (Final)" (website copy
 *    v1, 22 Nov 2026, applied 2026-11-26); the single "Start my album" action
 *    follows Truekeeps-Brand-Kit
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
import { ArrowRight, Baby, Cake, Check, Eye, Heart, Instagram, MessageCircle, Plane, ShieldCheck, Truck } from "lucide-react";
import { TKLogo } from "./primitives";
import { BOOK_IMAGES } from "./book-images";
import heroSm from "./assets/hero-1280.webp";
import heroLg from "./assets/hero-2400.webp";
import heroM800 from "./assets/hero-mobile-800.webp";
import heroM1200 from "./assets/hero-mobile-1200.webp";
import stack800 from "./assets/album-stack-800.webp";
import stack1600 from "./assets/album-stack-1600.webp";
import stack2400 from "./assets/album-stack-2400.webp";
import inHand480 from "./assets/album-in-hand-480.webp";
import inHand960 from "./assets/album-in-hand-960.webp";
import inHand1440 from "./assets/album-in-hand-1440.webp";
import row480 from "./assets/album-row-480.webp";
import row960 from "./assets/album-row-960.webp";
import row1440 from "./assets/album-row-1440.webp";
import ctaSm from "./assets/cta-1280.webp";
import ctaLg from "./assets/cta-2400.webp";
import ctaM800 from "./assets/cta-mobile-800.webp";
import ctaM1200 from "./assets/cta-mobile-1200.webp";
import how3 from "./assets/how-3.webp";
import { AccountMenu } from "@/features/auth/AccountMenu";
import { BOOK_TYPES, SITE } from "@shared/site";
import { formatPKR, INCLUDED_PAGES, STARTING_PRICE_MINOR } from "@shared/pricing";
import { ARRANGEMENTS, MAX_SHEETS } from "@/features/builder/arrange";
import { SUPPORT_WHATSAPP } from "@shared/payments";

/** The brand's Instagram (website copy v1). */
const INSTAGRAM = { handle: "@thetruekeeps", url: "https://www.instagram.com/thetruekeeps" };
/** "Your own mix": no page of its own yet, so it opens the builder on that occasion. */
export const OWN_MIX_HREF = "/wizard?occasion=mix";

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
          <a href="/#book">The album</a>
          <a href="/#occasions">Occasions</a>
          <Link href="/photo-books">Prices</Link>
        </div>
        <div className="lp-nav-cta">
          <AccountMenu signInClassName="lp-nav-signin" />
          <Link href={BUILDER_PATH} className="lp-btn lp-btn-main lp-btn-sm">
            Start my album
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
            No shop visits, no guesswork. Pakistan's first Online Album Maker shows you every page live, and you're done in
            minutes.
          </p>
          <div className="lp-hero-actions">
            <Link href={BUILDER_PATH} className="lp-btn lp-btn-main lp-btn-lg">
              Start my album <ArrowRight size={18} />
            </Link>
            <Link href="/photo-books" className="lp-btn lp-btn-outline-light lp-btn-lg">
              Explore designs
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}

/* ── Trust strip ────────────────────────────────────────────── */

export function TrustStrip() {
  // website copy v1: delivery is charged by city (prices page), so no "Free shipping"
  const items: Array<{ icon: typeof Eye; text: ReactNode; href?: string }> = [
    { icon: Eye, text: <span><b>Preview every page</b>, live</span> },
    { icon: Truck, text: <span><b>Delivered</b> anywhere in Pakistan</span> },
    { icon: ShieldCheck, text: <span><b>Prepaid</b>, secure checkout</span> },
    { icon: MessageCircle, text: <span>Questions? <b>WhatsApp us</b></span>, href: `https://wa.me/${SUPPORT_WHATSAPP.digits}` },
  ];
  return (
    <div className="lp-trust">
      <div className="lp-wrap">
        {items.map((it, k) => (
          <div key={k} style={{ display: "contents" }}>
            {it.href ? (
              <a className="lp-trust-item" href={it.href} target="_blank" rel="noreferrer">
                <it.icon size={18} strokeWidth={1.8} /> {it.text}
              </a>
            ) : (
              <div className="lp-trust-item">
                <it.icon size={18} strokeWidth={1.8} /> {it.text}
              </div>
            )}
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
export function SwipeRail({ className, label, children }: { className: string; label: string; children: ReactNode }) {
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

/**
 * HowSteps — the three "How it works" cards (art, number, title, line), shared
 * by the homepage and the occasion story pages so the steps read the same
 * everywhere (wedding page copy: "Same as the landing page").
 */
export function HowSteps() {
  return (
    <>
      <SwipeRail className="lp-steps" label="How it works, three steps">
        <div className="lp-step lp-reveal">
          <div className="lp-step-vis">
            <OccasionArt />
          </div>
          <h3>
            <span className="lp-step-num">1</span>
            Pick the moment
          </h3>
          <p>Wedding, new baby, birthday or a trip. Tell us the occasion and we set the look.</p>
        </div>
        <div className="lp-step lp-reveal">
          <div className="lp-step-vis">
            <PickPhotosArt />
          </div>
          <h3>
            <span className="lp-step-num">2</span>
            Add your favourites
          </h3>
          <p>Pick the photos you love. We make sure each photo is good enough to print.</p>
        </div>
        <div className="lp-step lp-reveal">
          <div className="lp-step-vis">
            <img src={how3} alt="A finished hardcover album" width={521} height={255} loading="lazy" />
          </div>
          <h3>
            <span className="lp-step-num">3</span>
            We do the layout
          </h3>
          <p>Every page is set for you. Preview it live, edit as you like, then order.</p>
        </div>
      </SwipeRail>
    </>
  );
}

export function HowItWorks() {
  return (
    <section className="lp-section" id="how">
      <div className="lp-wrap lp-center">
        <div className="lp-eyebrow center">How it works</div>
        <h2 className="lp-h2">No design skills? No problem.</h2>
        <p className="lp-lede">
          You don't need to be a designer. Tell us the occasion, add your photos, and your album is laid out for you in
          minutes.
        </p>
      </div>
      <div className="lp-wrap">
        <HowSteps />
        <div className="lp-steps-cta">
          <Link href={BUILDER_PATH} className="lp-btn lp-btn-main lp-btn-lg">
            Start my album <ArrowRight size={18} />
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ── Book divider ──────────────────────────────────────────── */

/**
 * BookDivider — the separator between the landing's chapters, replacing the
 * Rose dash before section labels (owner, 2026-11-26: "too generic").
 *
 * What: one centred hairline that draws out from the middle as it scrolls
 * into view (owner, 2026-11-27: the opening-book version was too busy, "keep
 * it single line"). The scroll observer (useScrollReveal) stamps `.in`; the
 * line is drawn and still without motion. Decorative, so aria-hidden.
 *
 * `tone` paints the band behind it to match the section it opens
 * ("warm" = the grey #F4F4F4 band, "page" = lavender).
 */
export function BookDivider({ tone = "page" }: { tone?: "page" | "warm" }) {
  return (
    <div className={"lp-divider-band" + (tone === "warm" ? " lp-warm" : "")}>
      <div className="lp-divider" aria-hidden="true" />
    </div>
  );
}

/* ── Know your album ─────────────────────────────────────── */

/**
 * KnowAlbum — the owner's "Know your album" section (design export in
 * "Know your album (website section)-html", 2026-11-26), replacing the old
 * "What you get" banner. Facts come from the price list and the layout
 * engine, so the starting price, page range and style names can't drift
 * from what checkout and step 5 do. id="book" keeps the "The album" nav link.
 * Desktop: facts left (max 420px), photos right. Phones: stacked, facts first.
 */
export function KnowAlbum() {
  const styles = ARRANGEMENTS.map((a) => a.name);
  return (
    <section className="lp-know" id="book">
      <div className="lp-wrap">
        <div className="lp-know-head">
          <div className="lp-know-eyebrow">Know your album</div>
          <h2>Print it once. Keep it for life.</h2>
        </div>
        <div className="lp-know-body">
          <div className="lp-know-facts">
            <div className="lp-know-card lp-know-price">
              <h3>The Truekeeps Album</h3>
              <p>12 x 12 inches</p>
              <p>
                Starts from: <strong>{formatPKR(STARTING_PRICE_MINOR)}</strong>
              </p>
              <p className="lp-know-small">Final price depends on the style you pick.</p>
            </div>
            <div className="lp-know-card lp-know-rows">
              <div>Square hardcover</div>
              <div>Glossy or matte, same price</div>
              <div>
                From {INCLUDED_PAGES} to {MAX_SHEETS * 2} pages
              </div>
              <div>
                {styles.length} styles: {styles.join(", ")}
              </div>
              <div className="strong">Made to last for generations</div>
            </div>
            <div className="lp-know-card lp-know-why">
              <p>Our 12 x 12 album gives your photos room to shine. A strong hardcover that keeps your memories safe for years.</p>
              <hr />
              <p>Weddings, trips or an ordinary Sunday. If it matters to you, it belongs here.</p>
              <hr />
              <div>
                <p className="lp-know-lead">Why you'll love it:</p>
                <ul>
                  <li>Easy to make in minutes</li>
                  <li>See every page before you pay</li>
                  <li>Made to last for years</li>
                </ul>
              </div>
              <Link href={BUILDER_PATH} className="lp-btn lp-btn-main lp-know-btn">
                Start my album
              </Link>
            </div>
          </div>
          <div className="lp-know-photos">
            <img
              className="lp-know-main"
              src={stack800}
              srcSet={`${stack800} 800w, ${stack1600} 1600w, ${stack2400} 2400w`}
              sizes="(max-width: 940px) 100vw, 840px"
              alt="A stack of four square hardcover albums"
              width={2400}
              height={1340}
              loading="lazy"
              decoding="async"
            />
            <div className="lp-know-pair">
              <img src={inHand480} srcSet={`${inHand480} 480w, ${inHand960} 960w, ${inHand1440} 1440w`} sizes="(max-width: 940px) 50vw, 420px" alt="A hand holding a square album with a baby photo on the cover" width={1440} height={804} loading="lazy" decoding="async" />
              <img src={row480} srcSet={`${row480} 480w, ${row960} 960w, ${row1440} 1440w`} sizes="(max-width: 940px) 50vw, 420px" alt="Three square albums standing in a row, spines showing" width={1440} height={804} loading="lazy" decoding="async" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Occasions ──────────────────────────────────────────────── */

export function Occasions() {
  return (
    // the second ground (landing.css --lp-band), shared with Know your album
    <section className="lp-section" id="occasions">
      <div className="lp-wrap lp-center">
        <div className="lp-eyebrow center">Pick your occasion</div>
        <h2 className="lp-h2">
          Pick your moment.
          <br />
          We'll handle the design.
        </h2>
        <p className="lp-lede">
          Choose an occasion to see its designs. Don't see yours? <Link href={OWN_MIX_HREF}>Make your own mix.</Link>
        </p>
      </div>
      <div className="lp-wrap">
        <SwipeRail className="lp-occ-grid" label="Occasions">
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
        <h2 className="lp-h2">Pakistan's Online Album Maker</h2>
        <p className="lp-lede">
          Make a 12x12 inch hardcover album from any photos you have. Pick how many pages you need, starting from{" "}
          {formatPKR(STARTING_PRICE_MINOR)}, and we'll deliver it across Pakistan.
        </p>
        <Link href="/questions" className="lp-link">
          Questions? Start here <ArrowRight size={16} />
        </Link>
      </div>
    </section>
  );
}

/* ── Final CTA ──────────────────────────────────────────────── */

/**
 * FinalCTA — the page closes on a real book, as it opened. `showDesigns` is off
 * on the /photo-books hub, where "Explore designs" would link to the page
 * itself; `heading` lets the Prices page close on its own line.
 */
/**
 * FinalCTA — the dark closing panel.
 * `minimal` keeps only the heading and the button (occasion story pages, whose
 * copy has a closing line and a button and nothing else); `href` lets the
 * button open the builder on an occasion.
 */
export function FinalCTA({
  showDesigns = true,
  heading,
  minimal = false,
  href = BUILDER_PATH,
}: {
  showDesigns?: boolean;
  heading?: string;
  minimal?: boolean;
  href?: string;
}) {
  return (
    // Centred closing panel on Indigo 900: Banner 03 is only a faint texture
    // under two soft glows (Indigo and Rose), as in the owner's preferred
    // pre-kit version, recoloured to the kit (2026-11-11).
    <section className="lp-cta">
      <BannerPhoto set={CTA_PHOTO} className="lp-cta-photo" alt="A first day of school album on a coffee table" />
      <div className="lp-cta-glow" aria-hidden="true"></div>
      <div className="lp-cta-glow rose" aria-hidden="true"></div>
      <div className="lp-wrap">
        <div className="lp-cta-inner">
          {minimal ? null : <div className="lp-eyebrow center">It only takes a few minutes</div>}
          <h2 className="lp-h2">{heading ?? "One day you'll be glad you printed them."}</h2>
          {minimal ? null : <p>We do the layout, you add the love. See every page before you order.</p>}
          <div className="lp-cta-actions">
            <Link href={href} className="lp-btn lp-btn-main lp-btn-lg">
              Start my album <ArrowRight size={18} />
            </Link>
            {showDesigns && !minimal ? (
              <Link href="/photo-books" className="lp-btn lp-btn-outline-light lp-btn-lg">
                Explore designs
              </Link>
            ) : null}
          </div>
          {minimal ? null : (
            <div className="lp-cta-sub">No design skills needed · Preview every page, live · Delivered anywhere in Pakistan</div>
          )}
        </div>
      </div>
    </section>
  );
}

/* ── Sticky CTA (phones) ────────────────────────────────────── */

/**
 * StickyCTA — keeps "Start my album" in thumb reach on phones (landing.css hides
 * it above 720px). Shown only between the hero button leaving the screen and
 * the final CTA arriving, so it never duplicates a button already in view and
 * never sits on top of the footer.
 *
 * Both checks treat "scrolled past" as well as "visible" so the state stays
 * right after a reload partway down the page. The hidden state uses
 * `visibility`, which also takes the link out of the tab order.
 */
/** `href` lets an occasion page keep its occasion (the builder then skips step 1). */
export function StickyCTA({ href = BUILDER_PATH }: { href?: string }) {
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
      <Link href={href} className="lp-btn lp-btn-main">
        Start my album <ArrowRight size={18} />
      </Link>
    </div>
  );
}

/* ── Footer ─────────────────────────────────────────────────── */

/**
 * Footer (website copy v1, section 3): three link columns and a bottom bar
 * with the policies and Instagram. Only links that lead somewhere real:
 * "About us" and "Privacy" join once those pages exist; "Contact us" is
 * WhatsApp, the one contact the business answers today.
 */
export function Footer() {
  const cols: Array<{ h: string; links: Array<{ label: string; href: string; external?: boolean }> }> = [
    {
      h: "Pick your moment",
      links: [...BOOK_TYPES.map((b) => ({ label: b.label, href: `/photo-books/${b.slug}` })), { label: "Your own mix", href: OWN_MIX_HREF }],
    },
    {
      h: "Support",
      links: [
        { label: "How it works", href: "/#how", external: true },
        { label: "Prices", href: "/photo-books" },
        { label: "FAQs", href: "/questions" },
        { label: "Contact us", href: `https://wa.me/${SUPPORT_WHATSAPP.digits}`, external: true },
      ],
    },
    {
      h: "For you",
      links: [
        { label: "My albums", href: "/books" },
        { label: "My orders", href: "/orders" },
        { label: "Account", href: "/account" },
        { label: "Leave a review", href: "/review" },
      ],
    },
  ];
  const policyName: Record<string, string> = { shipping: "Shipping", cancellation: "Cancellations", "refund-and-reprint": "Refunds & reprints" };
  return (
    <footer className="lp-footer">
      <div className="lp-wrap">
        <div className="lp-footer-brand">
          <TKLogo size={24} theme="dark" />
          <p>Your memories, off the screen and into your hands. Delivered across Pakistan.</p>
        </div>
        {cols.map((c) => (
          <div className="lp-fcol" key={c.h}>
            <h5>{c.h}</h5>
            {c.links.map((l) =>
              l.external ? (
                <a href={l.href} key={l.href} {...(l.href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}>
                  {l.label}
                </a>
              ) : (
                <Link href={l.href} key={l.href}>
                  {l.label}
                </Link>
              ),
            )}
          </div>
        ))}
      </div>
      <div className="lp-wrap">
        <div className="lp-footer-bar">
          {/* the prerendered year can lag a rebuild across New Year */}
          <span suppressHydrationWarning>
            © {new Date().getFullYear()} {SITE.name}. Made in Pakistan.
          </span>
          <nav className="lp-footer-legal" aria-label="Policies">
            {["shipping", "cancellation", "refund-and-reprint"].map((slug) => (
              <Link href={`/policies/${slug}`} key={slug}>
                {policyName[slug]}
              </Link>
            ))}
            <a className="lp-footer-ig" href={INSTAGRAM.url} target="_blank" rel="noreferrer" aria-label={`Instagram ${INSTAGRAM.handle}`}>
              <Instagram size={18} aria-hidden="true" />
            </a>
          </nav>
        </div>
      </div>
    </footer>
  );
}
