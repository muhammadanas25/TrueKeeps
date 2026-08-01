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
 *  - copy is verbatim from the prototype (design-system voice rules)
 */

import { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  ArrowRight,
  Award,
  Baby,
  BookOpen,
  Cake,
  Check,
  Heart,
  Leaf,
  Plane,
  PlayCircle,
  ShieldCheck,
  Sparkles,
  Star,
  Truck,
} from "lucide-react";
import { MiniBook, Ph, Stars, TKLogo, tintFor, type BookTone } from "./primitives";

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
          <button className="lp-nav-signin">Sign in</button>
          <Link href={BUILDER_PATH} className="lp-btn lp-btn-cobalt lp-btn-sm">
            Start free
          </Link>
        </div>
      </div>
    </nav>
  );
}

/* ── Hero — camera-roll loss aversion ───────────────────────── */

/** Floating photo tiles "spilling" out of the phone in the hero art. */
const HERO_TILES = [
  { l: "IMG_4471", i: 0, x: 158, y: 16, r: -7, s: 134 },
  { l: "IMG_5096", i: 1, x: 286, y: 6, r: 6, s: 120 },
  { l: "IMG_2210", i: 2, x: 206, y: 132, r: -3, s: 142 },
  { l: "IMG_6633", i: 5, x: 330, y: 120, r: 9, s: 124 },
  { l: "IMG_1188", i: 4, x: 150, y: 168, r: 5, s: 112 },
];

export function Hero() {
  return (
    <header className="lp-hero">
      <div className="lp-wrap">
        <div className="lp-hero-copy">
          <div className="lp-eyebrow" style={{ color: "var(--tk-raspberry)" }}>
            Don't let them disappear
          </div>
          <h1>
            Your best moments are <span className="lp-gold">stuck</span> in your phone.
          </h1>
          <p className="sub">
            The average camera roll holds 8,000 photos no one ever sees again. Pick a moment and we'll turn the best of
            them into a book you can actually hold — designed for you, automatically.
          </p>
          <div className="lp-hero-actions">
            <Link href={BUILDER_PATH} className="lp-btn lp-btn-accent lp-btn-lg">
              Free my memories
            </Link>
            <a href="#how" className="lp-btn lp-btn-ghost">
              <PlayCircle size={20} /> See how it works
            </a>
          </div>
          <div className="lp-hero-proof">
            <div className="avatars">
              {[0, 2, 4, 6].map((i) => (
                <span key={i} style={{ background: tintFor(i) }} />
              ))}
            </div>
            <Stars />{" "}
            <span>
              Loved by <b style={{ color: "var(--tk-gunmetal)" }}>40,000+</b> families
            </span>
          </div>
        </div>

        <div className="lp-hero-stage">
          <div className="lp-hero-art floaty">
            <div className="lp-phone">
              <div className="lp-phone-screen">
                {[10, 11, 12, 13, 14, 15].map((i) => (
                  <Ph key={i} i={i} style={{ borderRadius: 5 }} />
                ))}
              </div>
              <div className="lp-phone-notch"></div>
            </div>
            {HERO_TILES.map((t, k) => (
              <div
                key={k}
                className="lp-tile drift"
                style={{
                  left: t.x,
                  top: t.y,
                  width: t.s,
                  height: t.s * 0.82,
                  transform: `rotate(${t.r}deg)`,
                  animationDelay: 0.25 + k * 0.13 + "s",
                }}
              >
                <Ph i={t.i} label={t.l} style={{ width: "100%", height: "100%", borderRadius: 5 }} />
              </div>
            ))}
            <div className="lp-hero-book drift" style={{ animationDelay: "1s" }}>
              <MiniBook tone="ivory" title={"Our\nSummer"} sub="2025, in photos" coverLabel="golden hour" coverIdx={4} style={{ width: "100%", height: "100%" }} />
            </div>
            <span className="lp-spark" style={{ right: 96, top: 8 }}>
              <Sparkles size={26} />
            </span>
            <span className="lp-spark" style={{ right: 40, bottom: 30 }}>
              <Sparkles size={20} />
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}

/* ── Trust strip ────────────────────────────────────────────── */

export function TrustStrip() {
  const items = [
    { icon: Truck, text: <span><b>Free shipping</b> over $50</span> },
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
            <div className="lp-step-vis lp-step-pick">
              <div className="lp-pick-grid">
                {[
                  { n: "Wedding", Ic: Heart, on: true },
                  { n: "New baby", Ic: Baby, on: false },
                  { n: "Travel", Ic: Plane, on: false },
                  { n: "Birthday", Ic: Cake, on: false },
                ].map((o, k) => (
                  <div className={"lp-pick" + (o.on ? " on" : "")} key={k}>
                    <span className="lp-pick-ic">
                      <o.Ic size={16} strokeWidth={1.9} />
                    </span>
                    <span className="lp-pick-label">{o.n}</span>
                    {o.on ? (
                      <span className="lp-pick-check">
                        <Check size={11} strokeWidth={3} />
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
            <h3>Pick the moment</h3>
            <p>Wedding, a new baby, the trip of a lifetime — tell us what you're celebrating and we set the tone.</p>
          </div>
          <div className="lp-step lp-reveal">
            <div className="lp-step-num">2</div>
            <div className="lp-step-vis">
              <div className="lp-step-photos">
                {[0, 1, 2, 5, 4, 3].map((i) => (
                  <Ph key={i} i={i} style={{ borderRadius: 6 }} />
                ))}
              </div>
            </div>
            <h3>Add your photos</h3>
            <p>Drop in a handful or a thousand. We sift out the blurry duplicates and keep the ones that matter.</p>
          </div>
          <div className="lp-step lp-reveal">
            <div className="lp-step-num">3</div>
            <div className="lp-step-vis" style={{ background: "var(--tk-cobalt-dim)" }}>
              <div className="lp-step-wand">
                <MiniBook tone="cobalt" title={"The Good\nDays"} sub="Made for you" coverIdx={3} full={false} style={{ width: 96, height: 116 }} />
              </div>
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

export function Showcase() {
  const quality = [
    { Icon: BookOpen, h: "True lay-flat binding", p: "Pages open completely flat, so a panorama spreads across the spine without losing a thing." },
    { Icon: Leaf, h: "Archival, museum-grade paper", p: "Thick, lightly textured pages that resist fading for 100+ years. Made to be handled." },
    { Icon: Sparkles, h: "Hand-checked before it ships", p: "A real person reviews every book for color and binding. If it isn't right, we reprint it free." },
  ];
  return (
    <section className="lp-showcase lp-section" id="book">
      <div className="lp-wrap">
        <div className="lp-showcase-book">
          <div className="lp-show-big floaty">
            <MiniBook tone="ivory" title={"The Day We\nSaid Yes"} sub="June 2026" coverLabel="the first kiss" coverIdx={2} style={{ width: "100%", height: "100%" }} />
          </div>
          <div className="lp-show-badge lp-reveal">
            <Award size={22} strokeWidth={1.8} />
            <div>
              <b>Premium</b>
              <span>8×8" hardcover</span>
            </div>
          </div>
        </div>
        <div>
          <div className="lp-eyebrow">What you'll hold</div>
          <h2 className="lp-h2">
            Not a print-out.
            <br />A real keepsake.
          </h2>
          <p className="lp-lede">
            Beautiful quality, for beautiful moments. Every TrueKeep book is printed and bound to last a lifetime — the
            kind of thing that gets passed down, not deleted.
          </p>
          <div className="lp-quality">
            {quality.map((q, k) => (
              <div className="lp-qrow lp-reveal" key={k}>
                <div className="lp-qicon">
                  <q.Icon size={22} strokeWidth={1.8} />
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

/** Card → builder deep link: ?occasion pre-selects the quiz answer. */
const OCC_CARDS: Array<{
  tone: BookTone;
  title: string;
  sub: string;
  label: string;
  idx: number;
  name: string;
  blurb: string;
  occasion: string;
}> = [
  { tone: "blush", title: "Our\nWedding", sub: "The vows", label: "first look", idx: 2, name: "Weddings", blurb: "The day, start to last dance", occasion: "wedding" },
  { tone: "ivory", title: "Hello,\nBaby", sub: "Year one", label: "tiny toes", idx: 6, name: "New baby", blurb: "First smiles to first steps", occasion: "baby" },
  { tone: "cobalt", title: "The Long\nWay", sub: "On the road", label: "sunset point", idx: 5, name: "Travel", blurb: "Every place you wandered", occasion: "travel" },
  { tone: "blush", title: "What a\nDay", sub: "Celebrate", label: "make a wish", idx: 1, name: "Birthdays", blurb: "Parties, grads & big days", occasion: "birthday" },
  { tone: "ivory", title: "The Good\nDays", sub: "A bit of everything", label: "sunday", idx: 4, name: "Everything", blurb: "A year of ordinary magic", occasion: "mix" },
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
          {OCC_CARDS.map((o, k) => (
            <Link href={`${BUILDER_PATH}?occasion=${o.occasion}`} className="lp-occ-card lp-reveal" key={k}>
              <MiniBook tone={o.tone} title={o.title} sub={o.sub} coverLabel={o.label} coverIdx={o.idx} className="lp-occ-book" />
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
      <div className="lp-cta-glow"></div>
      <div className="lp-cta-glow gold"></div>
      <div className="lp-wrap">
        <div className="lp-cta-inner">
          <div className="lp-eyebrow center" style={{ color: "var(--tk-gold)", justifyContent: "center" }}>
            Your story is already written
          </div>
          <h2>
            Let's get it off your phone
            <br />
            and into your hands.
          </h2>
          <p>Start free — design your whole book in minutes and only pay when you love it.</p>
          <div className="lp-cta-actions">
            <Link href={BUILDER_PATH} className="lp-btn lp-btn-gold lp-btn-lg">
              Free my memories <ArrowRight size={18} />
            </Link>
            <Link href={BUILDER_PATH} className="lp-btn lp-btn-light lp-btn-lg">
              See a sample book
            </Link>
          </div>
          <div className="lp-cta-sub">No credit card · Designed in ~1 minute · Ships in 3–5 days</div>
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
