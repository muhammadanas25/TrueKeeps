/**
 * OccasionStoryPage — the long-form page for one occasion (/photo-books/<slug>).
 *
 * What: the owner's occasion page copy (wedding first, 28 Nov 2026) laid out
 * as approved on the design canvas "Truekeeps: Wedding page":
 *   Hero → Why print → What to put in it → Cover styles → How it works +
 *   price line → Other occasions → Questions → Closing
 *
 * Approach:
 *  - Copy comes from shared/occasion-stories.ts, which also feeds the FAQPage
 *    structured data, so the visible questions and the data can't disagree.
 *  - The light sections alternate lavender (the page) and grey (`--lp-band`),
 *    the same rhythm as the homepage.
 *  - Steps, the closing panel, Nav, Footer and the phone StickyCTA are the
 *    homepage's own components; nothing is restyled for this page.
 *  - The cover cards are drawn here in CSS (`.os-cv-*` in landing.css) from
 *    one cover photo, matching the builder's three cover styles. Pulling the
 *    builder's CoverFace in would drag the builder chunk into a public page.
 *  - Prerendered at build time, so nothing browser-only runs outside effects.
 *
 * Why the price is read, not written: the copy says "Rs xxx = real price"; the
 * starting price is STARTING_PRICE_MINOR from the checkout price list.
 */

import { Link } from "wouter";
import { ArrowRight, Check, ChevronDown } from "lucide-react";
import type { BookType } from "@shared/site";
import { BOOK_TYPES } from "@shared/site";
import type { OccasionStory } from "@shared/occasion-stories";
import { formatPKR, STARTING_PRICE_MINOR } from "@shared/pricing";
import { BOOK_IMAGES } from "./book-images";
import { BUILDER_PATH, FinalCTA, Footer, HowSteps, Nav, OWN_MIX_HREF, StickyCTA, SwipeRail } from "./sections";
import { useScrollReveal } from "./use-scroll-reveal";
import coverPhoto from "./assets/cover-wedding.webp";
import ownMix from "./assets/album-row-960.webp";

/** One occasion card: a crawlable link with the book photo, name and line. */
function OccasionCard({ href, img, alt, label, blurb }: { href: string; img: string; alt: string; label: string; blurb: string }) {
  return (
    <Link href={href} className="lp-occ-card os-occ-card">
      <div className="lp-occ-img">
        <img src={img} alt={alt} width={720} height={720} loading="lazy" decoding="async" />
      </div>
      <h3>{label}</h3>
      <p>{blurb}</p>
    </Link>
  );
}

/**
 * The three cover styles from the builder (data.ts COVER_STYLES): Minimal,
 * Photo cover and Just text, with the same names and lines as step 3.
 * Proportions follow builder.css: the text block of "Just text" sits on the
 * 38.2% line, the photo cover keeps a 4.17% (0.5 in) border.
 */
function CoverCards({ example }: { example: OccasionStory["coverExample"] }) {
  const words = (
    <div className="os-cv-words">
      <div className="os-cv-title">{example.title}</div>
      <div className="os-cv-rule" />
      <div className="os-cv-sub">{example.line}</div>
    </div>
  );
  // a grid on desktop, a swipe rail on phones (like the steps)
  return (
    <SwipeRail className="os-covers" label="Cover styles">
      <div className="os-cover-card">
        <div className="os-stage" role="img" aria-label={`Minimal cover: a small photo with ${example.title} under it`}>
          <div className="os-cv os-cv-minimal">
            <img src={coverPhoto} alt="" width={480} height={480} loading="lazy" decoding="async" />
            {words}
          </div>
        </div>
        <h3>Minimal</h3>
        <p>A small photo and your title.</p>
      </div>
      <div className="os-cover-card">
        <div className="os-stage" role="img" aria-label={`Photo cover: one big photo, with ${example.title} on the spine`}>
          <div className="os-spine">
            <div className="os-spine-strip">{example.title}</div>
            <div className="os-cv os-cv-photo">
              <img src={coverPhoto} alt="" width={480} height={480} loading="lazy" decoding="async" />
            </div>
          </div>
        </div>
        <h3>Photo cover</h3>
        <p>One big photo, your title on the spine.</p>
      </div>
      <div className="os-cover-card">
        <div className="os-stage" role="img" aria-label={`Just text cover: ${example.title} and a line, no photo`}>
          <div className="os-cv os-cv-text">{words}</div>
        </div>
        <h3>Just text</h3>
        <p>Your title and a line. No photo.</p>
      </div>
    </SwipeRail>
  );
}

/** /photo-books/<slug> for an occasion that has story copy. */
export function OccasionStoryPage({ book, story }: { book: BookType; story: OccasionStory }) {
  // the homepage leaves html.motion-ok behind on in-app navigation, which hides
  // .lp-reveal until observed; observing here keeps the step cards visible
  useScrollReveal();
  // "Opens the builder with Weddings already selected (skips step 1)":
  // builder/index.tsx seedFromUrl starts on the upload step for ?occasion=
  const startHref = `${BUILDER_PATH}?occasion=${book.occasion}`;
  const others = BOOK_TYPES.filter((b) => b.slug !== book.slug);

  return (
    <div className="lp lp-page os">
      <Nav />
      <main>
        <div className="lp-wrap">
          <nav className="lp-crumbs" aria-label="Breadcrumb">
            <Link href="/">Home</Link>
            <span aria-hidden="true"> / </span>
            <Link href="/photo-books">Photo books</Link>
            <span aria-hidden="true"> / </span>
            <span aria-current="page">{book.label}</span>
          </nav>

          {/* 1. Hero */}
          <header className="lp-page-hero os-hero">
            <div>
              <h1>
                {story.heroLead}
                <span className="lp-mark">{story.heroMark}</span>
              </h1>
              <p className="lp-lede">{story.heroText}</p>
              <div className="lp-hero-actions">
                <Link href={startHref} className="lp-btn lp-btn-main lp-btn-lg">
                  Start my album <ArrowRight size={18} />
                </Link>
              </div>
            </div>
            <img src={BOOK_IMAGES[book.slug]} alt={book.imageAlt} width={720} height={720} {...{ fetchpriority: "high" }} />
          </header>
        </div>

        {/* 2. Why print (grey) */}
        <section className="os-sec lp-warm" aria-labelledby="why">
          <div className="lp-wrap">
            <h2 className="lp-h2 lp-center" id="why">
              {story.reasonsTitle}
            </h2>
            <div className="os-why">
              {story.reasons.map((r) => (
                <div className="os-card" key={r.title}>
                  <h3>{r.title}</h3>
                  <p>{r.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 3. What to put in it */}
        <section className="os-sec" aria-labelledby="ideas">
          <div className="lp-wrap os-what">
            <h2 className="lp-h2" id="ideas">
              {story.ideasTitle}
            </h2>
            <ul className="os-list">
              {story.ideas.map((idea) => (
                <li key={idea}>
                  <span className="os-tick" aria-hidden="true">
                    <Check size={15} strokeWidth={2.6} />
                  </span>
                  {idea}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* 4. Cover styles (grey) */}
        <section className="os-sec lp-warm" aria-labelledby="covers">
          <div className="lp-wrap">
            <div className="lp-center">
              <h2 className="lp-h2" id="covers">
                {story.coversTitle}
              </h2>
              <p className="lp-lede">{story.coversIntro}</p>
            </div>
            <CoverCards example={story.coverExample} />
          </div>
        </section>

        {/* 5. How it works + 6. price line */}
        <section className="os-sec" aria-labelledby="how">
          <div className="lp-wrap">
            <h2 className="lp-h2 lp-center" id="how">
              How it works
            </h2>
            <HowSteps />
            <p className="os-price">
              <span>A 12x12 inch hardcover from {formatPKR(STARTING_PRICE_MINOR)}.</span>
              <Link href="/photo-books" className="lp-link">
                How pricing works <ArrowRight size={16} />
              </Link>
            </p>
          </div>
        </section>

        {/* 7. Other occasions (grey) */}
        <section className="os-sec lp-warm" aria-labelledby="other">
          <div className="lp-wrap">
            <h2 className="lp-h2 lp-center" id="other">
              {story.otherTitle}
            </h2>
            <div className="os-occ">
              {others.map((b) => (
                <OccasionCard key={b.slug} href={`/photo-books/${b.slug}`} img={BOOK_IMAGES[b.slug]} alt={b.imageAlt} label={b.label} blurb={b.blurb} />
              ))}
              <OccasionCard href={OWN_MIX_HREF} img={ownMix} alt="Three white albums standing in a row" label="Your own mix" blurb="Bring together photos from any time" />
            </div>
          </div>
        </section>

        {/* 8. Questions: native <details>, so answers are in the HTML and work without JS */}
        <section className="os-sec" aria-labelledby="questions">
          <div className="lp-wrap">
            <h2 className="lp-h2 lp-center" id="questions">
              Questions
            </h2>
            <div className="lp-faq os-faq">
              {story.faqs.map((f) => (
                <details key={f.q}>
                  <summary>
                    {f.q} <ChevronDown size={18} aria-hidden="true" />
                  </summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* 9. Closing */}
      <FinalCTA heading={story.closing} minimal href={startHref} />
      <Footer />
      <StickyCTA href={startHref} />
    </div>
  );
}
