/**
 * Home — renders the TrueKeep landing page.
 *
 * The page itself lives in features/landing (design ported from the
 * updated design-system prototype); this file only binds it to the
 * "/" route so the router stays a flat list of pages.
 */

import LandingPage from "@/features/landing";

export default function Home() {
  return <LandingPage />;
}
