/**
 * Landing sections — Nav, Hero, TrustStrip, HowItWorks, Showcase,
 * Occasions, Proof (testimonials), FinalCTA, Footer.
 *
 * Ported from the updated design-system prototypes
 * (`~/Downloads/landing.jsx` composition + `landing_page/hero.jsx` /
 * `landing_page/sections.jsx`), converted to typed TSX:
 *  - `window.lucide` icon lookups → static lucide-react imports
 *  - prototype `<a href="../book_builder/...">` CTAs → wouter <Link>
 *    into the in-app builder at /wizard (occasion cards deep-link with
 *    ?occasion=<id> so the quiz pre-selects the moment)
 *  - Hero + Showcase copy comes from "Website Copywriting.docx"
 *    (Oct 2026); the rest is still the prototype copy
 *  - imagery is real product photography from "Website Images/" and
 *    "Website Assets/", pre-sized to WebP in ./assets (srcset picks
 *    1280w vs 2400w; phones get the designer's square crops, 800w/1200w)
 */

import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, Leaf, ShieldCheck, Star, Truck } from "lucide-react";
import { TKLogo, tintFor } from "./primitives";
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
import how1 from "./assets/how-1.webp";
import how2 from "./assets/how-2.webp";
import how3 from "./assets/how-3.webp";
import bookWedding from "./assets/book-wedding.webp";
import bookBaby from "./assets/book-baby.webp";
import bookBirthday from "./assets/book-birthday.webp";
import bookSchool from "./assets/book-school.webp";
import bookUmrah from "./assets/book-umrah.webp";
import bookTravel from "./assets/book-travel.webp";
import bookAnniversary from "./assets/book-anniversary.webp";
import { AccountMenu } from "@/features/auth/AccountMenu";
import { formatPKR, PRICE_LIST } from "@shared/pricing";

/** Route the marketing CTAs land on — the quiz-first book builder. */
const BUILDER_PATH = "/wizard";

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
        <TKLogo size={23} />
        <div className="lp-nav-links">
          <a href="#how">How it works</a>
          <a href="#book">The book</a>
          <a href="#occasions">Occasions</a>
          <a href="#reviews">Reviews</a>
        </div>
        <div className="lp-nav-cta">
          <AccountMenu signInClassName="lp-nav-signin" />
          <Link href={BUILDER_PATH} className="lp-btn lp-btn-cobalt lp-btn-sm">
            Start free
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
function BannerPhoto({ set, eager, className }: { set: BannerSet; eager?: boolean; className?: string }) {
  return (
    <picture className={"lp-banner-photo" + (className ? " " + className : "")}>
      <source media="(max-width: 720px)" srcSet={`${set.m800} 800w, ${set.m1200} 1200w`} sizes="100vw" />
      <img
        src={set.sm}
        srcSet={`${set.sm} 1280w, ${set.lg} 2400w`}
        sizes="100vw"
        alt=""
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
      <BannerPhoto set={HERO_PHOTO} eager />
      <div className="lp-wrap">
        <div className="lp-hero-copy">
          <h1>Your best moments deserve more than a phone.</h1>
          <p className="sub">
            Design it yourself in minutes, or let us create it for you. Then hold it, share it, and keep it forever.
          </p>
          <div className="lp-hero-actions">
            <Link href={BUILDER_PATH} className="lp-btn lp-btn-accent lp-btn-lg">
              Make my book <ArrowRight size={18} />
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
    { icon: Truck, text: <span><b>Free shipping</b> from {formatPKR(PRICE_LIST.freeShippingFromMinor)}</span> },
    { icon: Leaf, text: <span><b>Archival</b>, FSC-certified paper</span> },
    { icon: ShieldCheck, text: <span><b>Love-it</b> guarantee</span> },
    { icon: Star, text: <span><b>4.9/5</b> from 12,000 reviews</span> },
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

/* ── How it works ───────────────────────────────────────────── */

export function HowItWorks() {
  return (
    <section className="lp-section" id="how">
      <div className="lp-wrap lp-center">
        <div className="lp-eyebrow center">How it works</div>
        <h2 className="lp-h2">
          From camera roll to keepsake
          <br />
          in about a minute.
        </h2>
        <p className="lp-lede">
          No blank canvas, no design skills. Answer one question, add your photos, and we lay out the whole book for
          you — change anything you like, or just order it.
        </p>
      </div>
      <div className="lp-wrap">
        <div className="lp-steps">
          <div className="lp-step lp-reveal">
            <div className="lp-step-num">1</div>
            <div className="lp-step-vis">
              <img src={how1} alt="Choosing Wedding from a grid of occasions" width={521} height={255} loading="lazy" />
            </div>
            <h3>Pick the moment</h3>
            <p>Wedding, a new baby, the trip of a lifetime — tell us what you're celebrating and we set the tone.</p>
          </div>
          <div className="lp-step lp-reveal">
            <div className="lp-step-num">2</div>
            <div className="lp-step-vis">
              <img src={how2} alt="Selecting photos to add" width={521} height={255} loading="lazy" />
            </div>
            <h3>Add your photos</h3>
            <p>Drop in a handful or a thousand. We sift out the blurry duplicates and keep the ones that matter.</p>
          </div>
          <div className="lp-step lp-reveal">
            <div className="lp-step-num">3</div>
            <div className="lp-step-vis">
              <img src={how3} alt="A finished hardcover photo book" width={521} height={255} loading="lazy" />
            </div>
            <h3>We design it</h3>
            <p>A complete book appears — cover, layouts, and captions. Hold it in 3-D, tweak anything, then order.</p>
          </div>
        </div>
        <div className="lp-steps-cta">
          <Link href={BUILDER_PATH} className="lp-btn lp-btn-accent lp-btn-lg">
            Make my book <ArrowRight size={18} />
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ── Showcase: what you'll hold ─────────────────────────────── */

/*
 * Feature art — small bespoke duotone drawings (raspberry + gold on
 * white) instead of stock line icons, each one depicting the actual
 * product detail: a square hardcover with its 12" dimension rule, a
 * glossy sheet over a matte one, and an open spread with a check.
 */

const ART_PINK = "var(--tk-raspberry)";
const ART_GOLD = "var(--tk-gold)";

function ArtHardcover() {
  return (
    <svg viewBox="0 0 56 56" aria-hidden="true">
      <rect x="12" y="7" width="34" height="34" rx="3" fill={ART_PINK} />
      <rect x="12" y="7" width="6" height="34" rx="2" fill="#000" opacity="0.18" />
      <rect x="22" y="13" width="18" height="16" rx="1.5" fill="#fff" />
      <path d="M22 29 l5-5 4 3 4-4 5 6 z" fill={ART_GOLD} />
      <circle cx="35.5" cy="17.5" r="2" fill={ART_GOLD} />
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
      <rect x="21" y="21" width="28" height="28" rx="3" fill={ART_GOLD} />
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
      <rect x="9" y="18" width="15" height="11" rx="1.5" fill={ART_PINK} />
      <rect x="32" y="18" width="15" height="6" rx="1.5" fill={ART_GOLD} />
      <rect x="32" y="27" width="15" height="6" rx="1.5" fill={ART_PINK} opacity="0.55" />
      <circle cx="44" cy="44" r="8" fill={ART_PINK} stroke="#1c181a" strokeOpacity="0.25" />
      <path d="M40.3 44.2 l2.6 2.6 l5-5.2" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Showcase() {
  const features = [
    { Art: ArtHardcover, h: "Big 12×12 hardcover", p: "Large square pages that give your photos the space they deserve." },
    { Art: ArtFinish, h: "Glossy or matte, your choice", p: "Pick the finish that feels right for your memories." },
    { Art: ArtPreview, h: "What you see is what you get", p: "Preview every page before you order. No surprises, just your book." },
  ];
  return (
    <section className="lp-showcase" id="book">
      <BannerPhoto set={KEEP_PHOTO} />
      <div className="lp-wrap">
        <div className="lp-showcase-copy">
          <div className="lp-eyebrow">What you'll hold</div>
          <h2 className="lp-h2">
            Not a print-out.
            <br />A <span className="lp-mark">real keepsake.</span>
          </h2>
          <p className="lp-lede">
            A big, beautiful hardcover book you can hold in your hands, share with family, and keep for years. Not lost
            in a phone.
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
      </div>
    </section>
  );
}

/* ── Occasions ──────────────────────────────────────────────── */

/**
 * Card → builder deep link: ?occasion pre-selects the quiz answer. The
 * builder knows five occasions (wedding/baby/travel/birthday/mix), so the
 * newer book types map onto the nearest one until they get their own.
 */
const OCC_CARDS: Array<{ img: string; alt: string; name: string; blurb: string; occasion: string }> = [
  { img: bookWedding, alt: "Wedding photo book for Mubeen & Farah", name: "Weddings", blurb: "The day, start to last dance", occasion: "wedding" },
  { img: bookBaby, alt: "Baby photo book titled Little Feet, First Journey", name: "New baby", blurb: "First smiles to first steps", occasion: "baby" },
  { img: bookBirthday, alt: "First birthday photo book open to a cake spread", name: "Birthdays", blurb: "Parties, cakes & big days", occasion: "birthday" },
  { img: bookSchool, alt: "First day of school photo book", name: "School days", blurb: "First days and proud milestones", occasion: "mix" },
  { img: bookUmrah, alt: "Umrah photo book with a family at the Kaaba", name: "Umrah & Hajj", blurb: "A journey of a lifetime", occasion: "travel" },
  { img: bookTravel, alt: "Travel photo book titled No Signal, Just Kumrat", name: "Travel", blurb: "Every place you wandered", occasion: "travel" },
  { img: bookAnniversary, alt: "Pink anniversary book titled You & Me, our love story", name: "Anniversaries", blurb: "Your story, year after year", occasion: "wedding" },
];

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
        <div className="lp-occ-grid">
          {OCC_CARDS.map((o) => (
            <Link href={`${BUILDER_PATH}?occasion=${o.occasion}`} className="lp-occ-card lp-reveal" key={o.name}>
              <div className="lp-occ-img">
                <img src={o.img} alt={o.alt} width={720} height={720} loading="lazy" decoding="async" />
              </div>
              <h4>{o.name}</h4>
              <p>{o.blurb}</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Proof / testimonials ───────────────────────────────────── */

const REVIEWS = [
  { n: 5, q: "I cried opening it. It felt like holding the whole year in my hands.", who: "Maya & Sam", role: "Wedding album", av: 0 },
  { n: 5, q: "I dreaded designing it. Turns out I didn't have to — it was just done, and gorgeous.", who: "Priya R.", role: "Baby's first year", av: 2 },
  { n: 5, q: "The paper, the binding — it looks like something from a bookstore. Worth every penny.", who: "James O.", role: "Iceland trip", av: 6 },
];

export function Proof() {
  return (
    <section className="lp-proof lp-section" id="reviews">
      <div className="lp-wrap">
        <div className="lp-proof-head">
          <div>
            <div className="lp-eyebrow">Loved by families</div>
            <h2 className="lp-h2">
              The part that surprises
              <br />
              people most: it's easy.
            </h2>
          </div>
          <div className="lp-proof-rating">
            <div className="big">4.9</div>
            <div className="stars">★★★★★</div>
            <span>12,000+ verified reviews</span>
          </div>
        </div>
        <div className="lp-tcards">
          {REVIEWS.map((r, k) => (
            <div className="lp-tcard lp-reveal" key={k}>
              <div className="stars">{"★★★★★".slice(0, r.n)}</div>
              <blockquote>“{r.q}”</blockquote>
              <div className="lp-tcard-who">
                <div className="lp-tcard-av" style={{ background: tintFor(r.av) }}></div>
                <div>
                  <b>{r.who}</b>
                  <span>{r.role}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Final CTA ──────────────────────────────────────────────── */

export function FinalCTA() {
  return (
    <section className="lp-cta">
      {/* Banner 03 as a barely-there texture under the glows */}
      <BannerPhoto set={CTA_PHOTO} className="lp-cta-photo" />
      <div className="lp-cta-glow"></div>
      <div className="lp-cta-glow gold"></div>
      <div className="lp-wrap">
        <div className="lp-cta-inner">
          <div className="lp-eyebrow center" style={{ color: "var(--tk-gold)", justifyContent: "center" }}>
            Your story is already written
          </div>
          <h2>Don’t let your best photos get lost.</h2>
          <p>Start for free. We design your whole book, you make it yours, and you only pay when you love it.</p>
          <div className="lp-cta-actions">
            <Link href={BUILDER_PATH} className="lp-btn lp-btn-gold lp-btn-lg">
              Free my memories <ArrowRight size={18} />
            </Link>
            <Link href={BUILDER_PATH} className="lp-btn lp-btn-light lp-btn-lg">
              See a sample book
            </Link>
          </div>
          <div className="lp-cta-sub">Free to start · No design skills needed · See every page before you pay</div>
        </div>
      </div>
    </section>
  );
}

/* ── Footer ─────────────────────────────────────────────────── */

export function Footer() {
  const cols = [
    { h: "Product", links: ["Photo books", "Wedding albums", "Baby books", "Travel books", "Gift cards"] },
    { h: "Company", links: ["Our story", "Quality promise", "Reviews", "Careers"] },
    { h: "Support", links: ["Help center", "Shipping", "Track order", "Contact us"] },
  ];
  return (
    <footer className="lp-footer">
      <div className="lp-wrap">
        <div className="lp-footer-brand">
          <TKLogo size={24} theme="dark" />
          <p>Beautiful quality, for beautiful moments. Turning the photos on your phone into keepsakes worth holding.</p>
        </div>
        {cols.map((c, k) => (
          <div className="lp-fcol" key={k}>
            <h5>{c.h}</h5>
            {c.links.map((l) => (
              <a href="#" key={l}>
                {l}
              </a>
            ))}
          </div>
        ))}
      </div>
      <div className="lp-wrap">
        <div className="lp-footer-bar">
          <span>© 2026 TrueKeep. All rights reserved.</span>
          <span style={{ display: "flex", gap: 20 }}>
            <a href="#" style={{ color: "inherit", textDecoration: "none" }}>
              Privacy
            </a>
            <a href="#" style={{ color: "inherit", textDecoration: "none" }}>
              Terms
            </a>
          </span>
        </div>
      </div>
    </footer>
  );
}
