/**
 * Prerender entry: built by `vite build --ssr`, run once per public page by
 * scripts/prerender.mjs at build time, never on a live request. Re-exports the
 * site data so the script needs no TypeScript of its own.
 *
 * Public pages are imported eagerly in App.tsx, so renderToString never meets
 * an unresolved lazy route. Effects don't run here: everything browser-only
 * in those pages must stay inside useEffect.
 */

import { renderToString } from "react-dom/server";
import { Router } from "wouter";
import App from "./App";

export { PUBLIC_PAGES, headHtml, llmsTxt, sitemapXml } from "@shared/site";

/** The HTML for #root at one URL. */
export function render(path: string): string {
  return renderToString(
    <Router ssrPath={path}>
      <App />
    </Router>,
  );
}
