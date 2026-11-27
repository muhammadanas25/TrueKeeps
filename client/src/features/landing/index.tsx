/**
 * LandingPage — the TrueKeeps marketing page.
 *
 * Composition ported verbatim from the updated prototype shell
 * (`~/Downloads/landing.jsx`): Nav → Hero → TrustStrip → HowItWorks →
 * BookDivider → KnowAlbum → BookDivider → Occasions → PlainFacts → FinalCTA → Footer (plus the phone-only StickyCTA), with
 * reveal-on-scroll handled by useScrollReveal (see that hook for the
 * motion-gating rationale).
 *
 * Rendered by pages/home.tsx; lazy-loaded at the route level so the
 * landing bundle stays independent of the builder/editor chunks.
 */

import "./landing.css";
import { useScrollReveal } from "./use-scroll-reveal";
import { BookDivider, FinalCTA, Footer, Hero, HowItWorks, KnowAlbum, Nav, Occasions, PlainFacts, StickyCTA, TrustStrip } from "./sections";

export default function LandingPage() {
  useScrollReveal();
  return (
    <div className="lp">
      <Nav />
      <Hero />
      <TrustStrip />
      <HowItWorks />
      {/* the two grey chapters open with a hairline divider (owner, 2026-11-26/27) */}
      <BookDivider tone="warm" />
      <KnowAlbum />
      <BookDivider tone="warm" />
      <Occasions />
      <PlainFacts />
      <FinalCTA />
      <Footer />
      <StickyCTA />
    </div>
  );
}
