# ADR 009 — Prerender public pages at build time

**Status:** accepted · 2026-11-05

## Context

The app was a client-only React SPA: every URL returned the same HTML with an
empty `<div id="root">`, no title, and a 200 status (even robots.txt, favicon.ico
and made-up URLs). Anything that doesn't run JavaScript saw a blank site: WhatsApp
and Facebook link previews, AI assistants such as Claude on the web, and many
crawlers. Google does run JavaScript, but later and less reliably.

## Decision

Keep the Vite + Express SPA. At build time, render each public page to static HTML
(`client/src/entry-server.tsx` + `scripts/prerender.mjs`) into `dist/pages/`, and
hydrate it in the browser. `shared/site.ts` is the one source for public paths,
titles, descriptions, structured data, sitemap.xml and llms.txt.

`server/vite.ts` answers honestly: public pages 200, app routes 200 + `noindex`,
everything else 404 + `noindex`. Private pages are not listed in robots.txt,
because a crawler blocked from fetching a page can't see its `noindex`.

## Alternatives rejected

- **Next.js migration:** real SSR, but a rewrite of routing, auth wiring and the
  server for pages whose content barely changes. Prices live in code, so every
  change already means a deploy, which removes prerendering's main drawback.
- **Shopify:** discards the builder, which is the product.
- **Headless-browser prerender (Puppeteer):** adds Chromium to the Railway build.
- **Serve bots different HTML (dynamic rendering):** Google calls it a workaround
  and it can drift into cloaking.

## Consequences

- Public pages must not touch browser APIs outside effects, and must render the
  same on server and client, or hydration warnings appear.
- Public pages can't vary per request. The nav's signed-in state fills in after
  load (`useSession` starts as loading, so the server renders nothing there).
- Copy, prices and pages are published by deploying. Fine at this page count.
- Structured data must stay truthful: no ratings until real reviews exist. The
  book size is 12×12 inches, confirmed by the owner on 2026-11-05.
