/**
 * LandingPage — the TrueKeep marketing page.
 *
 * Composition ported verbatim from the updated prototype shell
 * (`~/Downloads/landing.jsx`): Nav → Hero → TrustStrip → HowItWorks →
 * Showcase → Occasions → Proof → FinalCTA → Footer, with
 * reveal-on-scroll handled by useScrollReveal (see that hook for the
 * motion-gating rationale).
 *
 * Rendered by pages/home.tsx; lazy-loaded at the route level so the
 * landing bundle stays independent of the builder/editor chunks.
 */

import "./landing.css";
import { useScrollReveal } from "./use-scroll-reveal";
import { FinalCTA, Footer, Hero, HowItWorks, Nav, Occasions, Proof, Showcase, TrustStrip } from "./sections";

export default function LandingPage() {
  useScrollReveal();
  return (
    <div className="lp">
      <Nav />
      <Hero />
      <TrustStrip />
      <HowItWorks />
      <Showcase />
      <Occasions />
      <Proof />
      <FinalCTA />
      <Footer />
    </div>
  );
}
