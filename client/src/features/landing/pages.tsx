/**
 * Photo-book pages: the /photo-books hub and one page per book type.
 *
 * What: pages that exist to be found. Someone searching "wedding photo album
 * Pakistan" should land on a page about exactly that, with the price visible,
 * and a link shared on WhatsApp should preview the right book.
 *
 * Approach: all copy lives in shared/site.ts so the visible page, the search
 * metadata and the structured data can't disagree. These are imported eagerly
 * by App.tsx and prerendered at build time, so nothing browser-only may run
 * outside an effect. They reuse the landing's Nav, Footer, FinalCTA and CSS.
 */

import { useEffect } from "react";
import { Link } from "wouter";
import { ArrowRight, ChevronDown } from "lucide-react";
import { formatPKR, INCLUDED_PAGES, PRICE_LIST } from "@shared/pricing";
import { BOOK_TYPES, FAQS, SHIPPING_LINE, type BookType } from "@shared/site";
import { BOOK_IMAGES } from "./book-images";
import { BUILDER_PATH, FinalCTA, Footer, Nav, StickyCTA } from "./sections";

/** In-app links keep the old scroll position; a new page should start at the top. */
function useScrollTopOnMount(key: string) {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [key]);
}

function Breadcrumbs({ items }: { items: Array<{ label: string; href?: string }> }) {
  return (
    <nav className="lp-crumbs" aria-label="Breadcrumb">
      {items.map((it, k) => (
        <span key={it.label}>
          {k > 0 ? <span aria-hidden="true"> / </span> : null}
          {it.href ? <Link href={it.href}>{it.label}</Link> : <span aria-current="page">{it.label}</span>}
        </span>
      ))}
    </nav>
  );
}

/** The book price, the extra-sheet rate and the shipping rule, straight from the checkout price list. */
function PriceList() {
  return (
    <section className="lp-page-section" aria-labelledby="prices">
      <h2 className="lp-page-h2" id="prices">
        Prices
      </h2>
      <div className="lp-price-grid">
        <div className="lp-price-card">
          <h3>Book, any binding</h3>
          <p>{formatPKR(PRICE_LIST.bookMinor)}</p>
        </div>
        <div className="lp-price-card">
          <h3>Each extra sheet</h3>
          <p>{formatPKR(PRICE_LIST.extraSheetMinor)}</p>
        </div>
        <div className="lp-price-card">
          <h3>Shipping</h3>
          <p>Free</p>
        </div>
      </div>
      <p className="lp-page-note">
        The book price covers {INCLUDED_PAGES} pages, in softcover, hardcover or layflat. A sheet is
        2 pages. {SHIPPING_LINE} It's free to start, and you only pay when you order.
      </p>
    </section>
  );
}

function Steps() {
  return (
    <section className="lp-page-section" aria-labelledby="steps">
      <h2 className="lp-page-h2" id="steps">
        How it works
      </h2>
      <ol className="lp-page-steps">
        <li>
          <b>Pick the moment.</b> Tell us what you're celebrating and we set the tone.
        </li>
        <li>
          <b>Add your photos.</b> Choose them from your phone or computer.
        </li>
        <li>
          <b>We design it.</b> A complete book appears. Change anything you like, then order.
        </li>
      </ol>
    </section>
  );
}

/** Native <details>: answers stay in the HTML for crawlers, and it works without JS. */
function Faq() {
  return (
    <section className="lp-page-section" aria-labelledby="faq">
      <h2 className="lp-page-h2" id="faq">
        Questions
      </h2>
      <div className="lp-faq">
        {FAQS.map((f) => (
          <details key={f.q}>
            <summary>
              {f.q} <ChevronDown size={18} aria-hidden="true" />
            </summary>
            <p>{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function BookCard({ book }: { book: BookType }) {
  return (
    <Link href={`/photo-books/${book.slug}`} className="lp-occ-card">
      <div className="lp-occ-img">
        <img src={BOOK_IMAGES[book.slug]} alt={book.imageAlt} width={720} height={720} loading="lazy" decoding="async" />
      </div>
      <h3>{book.label}</h3>
      <p>{book.blurb}</p>
    </Link>
  );
}

/** /photo-books — prices, every book type, and the FAQ on one page. */
export function PhotoBooksPage() {
  useScrollTopOnMount("hub");
  return (
    <div className="lp lp-page">
      <Nav />
      <main className="lp-wrap">
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Photo books" }]} />
        <header className="lp-page-head">
          <h1>Photo books, delivered across Pakistan</h1>
          <p className="lp-lede">
            Turn the photos on your phone into a printed book. Design it yourself in minutes, or let us create it for
            you. Then hold it, share it, and keep it forever.
          </p>
          <div className="lp-hero-actions">
            <Link href={BUILDER_PATH} className="lp-btn lp-btn-main lp-btn-lg">
              Make my book <ArrowRight size={18} />
            </Link>
          </div>
        </header>
        <PriceList />
        <section className="lp-page-section" aria-labelledby="types">
          <h2 className="lp-page-h2" id="types">
            Choose your moment
          </h2>
          <div className="lp-page-grid">
            {BOOK_TYPES.map((b) => (
              <BookCard book={b} key={b.slug} />
            ))}
          </div>
        </section>
        <Steps />
        <Faq />
      </main>
      {/* this is the page "See designs" points to */}
      <FinalCTA showDesigns={false} />
      <Footer />
      <StickyCTA />
    </div>
  );
}

/** /photo-books/<slug> — one book type; App.tsx has already validated the slug. */
export function BookTypePage({ book }: { book: BookType }) {
  useScrollTopOnMount(book.slug);
  const startHref = `${BUILDER_PATH}?occasion=${book.occasion}`;
  return (
    <div className="lp lp-page">
      <Nav />
      <main className="lp-wrap">
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Photo books", href: "/photo-books" }, { label: book.label }]} />
        <header className="lp-page-hero">
          <div>
            <h1>{book.h1}</h1>
            <p className="lp-lede">{book.intro}</p>
            <div className="lp-hero-actions">
              <Link href={startHref} className="lp-btn lp-btn-main lp-btn-lg">
                Make my book <ArrowRight size={18} />
              </Link>
            </div>
          </div>
          <img src={BOOK_IMAGES[book.slug]} alt={book.imageAlt} width={720} height={720} {...{ fetchpriority: "high" }} />
        </header>
        <section className="lp-page-section" aria-labelledby="ideas">
          <h2 className="lp-page-h2" id="ideas">
            What people put in it
          </h2>
          <ul className="lp-page-ideas">
            {book.ideas.map((idea) => (
              <li key={idea}>{idea}</li>
            ))}
          </ul>
        </section>
        <Steps />
        <PriceList />
        <section className="lp-page-section" aria-labelledby="more">
          <h2 className="lp-page-h2" id="more">
            Other photo books
          </h2>
          <div className="lp-page-grid">
            {BOOK_TYPES.filter((b) => b.slug !== book.slug).map((b) => (
              <BookCard book={b} key={b.slug} />
            ))}
          </div>
        </section>
      </main>
      <FinalCTA />
      <Footer />
      <StickyCTA />
    </div>
  );
}
