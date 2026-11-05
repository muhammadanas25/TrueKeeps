/**
 * NotFound — shown for any unknown URL. The server sends a real 404 status with
 * this page (server/vite.ts), so search engines drop the URL while a person who
 * followed a bad link still gets a way forward.
 */

import { Link } from "wouter";
import { BUILDER_PATH, Footer, Nav } from "@/features/landing/sections";

export default function NotFound() {
  return (
    <div className="lp lp-page">
      <Nav />
      <main className="lp-wrap" style={{ minHeight: "50vh" }}>
        <div className="lp-page-head">
          <h1>We couldn't find that page</h1>
          <p className="lp-lede">The link may be old or mistyped. Your books and photos are safe.</p>
          <div className="lp-hero-actions">
            <Link href={BUILDER_PATH} className="lp-btn lp-btn-main">
              Make my book
            </Link>
            <Link href="/photo-books" className="lp-btn lp-btn-outline">
              See photo books
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
