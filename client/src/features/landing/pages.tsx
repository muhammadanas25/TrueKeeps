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
import { ArrowRight, Check, ChevronDown } from "lucide-react";
import { DELIVERY_TIME, formatPKR, INCLUDED_PAGES, PRICE_LIST } from "@shared/pricing";
import { BOOK_TYPES, FAQS, SHIPPING_LINE, type BookType } from "@shared/site";
import { FAQ_GROUPS, POLICIES, type PolicyPage } from "@shared/info-pages";
import { SUPPORT_WHATSAPP } from "@shared/payments";
import { ARRANGEMENTS } from "@/features/builder/arrange";
import { BOOK_IMAGES } from "./book-images";
import { BUILDER_PATH, FinalCTA, Footer, Nav, StickyCTA } from "./sections";
import { storyFor } from "@shared/occasion-stories";
import { OccasionStoryPage } from "./occasion-story";

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
          <h3>Album, hardcover</h3>
          <p>{formatPKR(PRICE_LIST.bookMinor)}</p>
        </div>
        <div className="lp-price-card">
          <h3>Each extra sheet</h3>
          <p>{formatPKR(PRICE_LIST.extraSheetMinor)}</p>
        </div>
        <div className="lp-price-card">
          <h3>Delivery</h3>
          <p>Free in Karachi</p>
        </div>
      </div>
      <p className="lp-page-note">
        The album price covers {INCLUDED_PAGES} pages. A sheet is
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

/** What every album includes (website copy v1, 5). Only what is true today. */
const INCLUDED = [
  "12x12 inch album",
  "Glossy or matte finish, same price",
  "3 cover styles and 8 font styles",
  "Automatic layout, edit anything",
  "Live preview of every page",
  "Low-quality photo check",
  "WhatsApp help, Mon to Fri",
];

/**
 * /photo-books — the Prices page (website copy v1, section 5, 2026-11-26):
 * layouts, today's prices, what's included, delivery, paying, and the price
 * questions. The occasions grid and the how-it-works list moved off it.
 */
export function PhotoBooksPage() {
  useScrollTopOnMount("hub");
  return (
    <div className="lp lp-page">
      <Nav />
      <main className="lp-wrap">
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Prices" }]} />
        <header className="lp-page-head">
          <h1>Simple, clear prices</h1>
          <p className="lp-lede">Your price depends on how many photos go on each page. Here's how it works.</p>
        </header>
        <section className="lp-page-section" aria-labelledby="layouts">
          <h2 className="lp-page-h2" id="layouts">
            Three layouts
          </h2>
          <div className="lp-price-grid">
            {ARRANGEMENTS.map((a) => (
              <div className="lp-price-card lp-layout-card" key={a.id}>
                <h3>
                  {a.name}
                  {a.id === "classic" ? <span className="lp-badge">Our pick</span> : null}
                </h3>
                <p>{a.line}</p>
              </div>
            ))}
          </div>
          <p className="lp-page-note">Want to spend less? Pick Gallery. Want more room? Pick Story.</p>
        </section>
        <PriceList />
        <section className="lp-page-section" aria-labelledby="included">
          <h2 className="lp-page-h2" id="included">
            Every album includes
          </h2>
          <ul className="lp-included">
            {INCLUDED.map((item) => (
              <li key={item}>
                <Check size={18} strokeWidth={2.4} aria-hidden="true" /> {item}
              </li>
            ))}
          </ul>
        </section>
        <section className="lp-page-section" aria-labelledby="delivery">
          <h2 className="lp-page-h2" id="delivery">
            Delivery across Pakistan
          </h2>
          <div className="lp-doc-table lp-delivery-table">
            <table>
              <tbody>
                <tr>
                  <td>Karachi</td>
                  <td>Free</td>
                </tr>
                <tr>
                  <td>Rest of Pakistan</td>
                  <td>{formatPKR(PRICE_LIST.standardDeliveryMinor)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="lp-page-note">{DELIVERY_TIME} In a hurry? Call us first to see if we can make it faster.</p>
        </section>
        <section className="lp-page-section" aria-labelledby="paying">
          <h2 className="lp-page-h2" id="paying">
            Paying for your album
          </h2>
          <p className="lp-page-text">We accept bank transfer. Cards are coming soon. Since each album is personal, we print only after payment.</p>
          <p className="lp-page-note">Have a discount code? Add it at checkout.</p>
        </section>
        <Faq />
      </main>
      <FinalCTA showDesigns={false} heading="Start now, pay only when you order." />
      <Footer />
      <StickyCTA />
    </div>
  );
}

/**
 * /photo-books/<slug> — one book type; App.tsx has already validated the slug.
 * An occasion with the owner's long-form copy (shared/occasion-stories.ts,
 * wedding first) gets the story page; the rest keep this shorter page.
 */
export function BookTypePage({ book }: { book: BookType }) {
  useScrollTopOnMount(book.slug);
  const story = storyFor(book.slug);
  if (story) return <OccasionStoryPage book={book} story={story} />;
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
                Start my album <ArrowRight size={18} />
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

/* ── /questions and /policies/<slug> (owner's documents, 2026-11-23) ── */

/**
 * /questions — the FAQ, grouped as in the owner's document (shared/info-pages.ts).
 * One question open at a time is the browser's own <details>, so it works
 * before the page's script loads and in the prerendered HTML.
 */
export function QuestionsPage() {
  useScrollTopOnMount("questions");
  return (
    <div className="lp lp-page">
      <Nav />
      <main className="lp-wrap">
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Questions" }]} />
        <header className="lp-page-head">
          <h1>Questions</h1>
          <p className="lp-lede">Sizes, pages, prices, delivery, paying, and what happens if something goes wrong.</p>
        </header>
        {FAQ_GROUPS.map((g) => (
          <section className="lp-page-section lp-faq-group" key={g.title} aria-labelledby={"g-" + g.title}>
            <h2 className="lp-page-h2" id={"g-" + g.title}>
              {g.title}
            </h2>
            <div className="lp-faq">
              {g.items.map((f) => (
                <details key={f.q}>
                  <summary>
                    {f.q} <ChevronDown size={18} aria-hidden="true" />
                  </summary>
                  {f.a.length > 2 ? (
                    <ol className="lp-faq-steps">
                      {f.a.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ol>
                  ) : (
                    f.a.map((line) => <p key={line}>{line}</p>)
                  )}
                </details>
              ))}
            </div>
          </section>
        ))}
        <p className="lp-page-note">
          Still stuck?{" "}
          <a href={`https://wa.me/${SUPPORT_WHATSAPP.digits}`} target="_blank" rel="noreferrer">
            Ask us on WhatsApp
          </a>
          . Our policies: <PolicyLinks />.
        </p>
      </main>
      <Footer />
    </div>
  );
}

function PolicyLinks({ except }: { except?: string }) {
  const list = POLICIES.filter((p) => p.slug !== except);
  return (
    <>
      {list.map((p, k) => (
        <span key={p.slug}>
          {k > 0 ? (k === list.length - 1 ? " and " : ", ") : null}
          <Link href={`/policies/${p.slug}`}>{p.title.replace(" Policy", "").toLowerCase()}</Link>
        </span>
      ))}
    </>
  );
}

/** /policies/<slug> — a plain reading page; App.tsx has already found the policy. */
export function PolicyPageView({ policy }: { policy: PolicyPage }) {
  useScrollTopOnMount(policy.slug);
  return (
    <div className="lp lp-page">
      <Nav />
      <main className="lp-wrap">
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: policy.title }]} />
        <article className="lp-doc">
          <h1>{policy.title}</h1>
          <p className="lp-doc-date">Last updated: {policy.updated}</p>
          {policy.blocks.map((b, k) =>
            "h" in b ? (
              <h2 key={k}>{b.h}</h2>
            ) : "p" in b ? (
              <p key={k}>{b.p}</p>
            ) : "list" in b ? (
              <ul key={k}>
                {b.list.map((li) => (
                  <li key={li}>{li}</li>
                ))}
              </ul>
            ) : (
              <div className="lp-doc-table" key={k}>
                <table>
                  <thead>
                    <tr>
                      <th>{b.table.head[0]}</th>
                      <th>{b.table.head[1]}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {b.table.rows.map((r) => (
                      <tr key={r[0]}>
                        <td>{r[0]}</td>
                        <td>{r[1]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ),
          )}
          <p className="lp-doc-more">
            Also see our <PolicyLinks except={policy.slug} />, or the <Link href="/questions">questions</Link> page.
          </p>
        </article>
      </main>
      <Footer />
    </div>
  );
}
