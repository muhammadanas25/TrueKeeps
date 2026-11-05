/**
 * Build step: write real HTML for every public page.
 *
 * Why: the app otherwise ships an empty <div id="root">, so anything that
 * doesn't run JavaScript (WhatsApp and Facebook previews, AI assistants, many
 * crawlers) sees a blank site. Steps:
 *  1. Take dist/public/index.html, the built shell with hashed script + CSS.
 *  2. For each page in PUBLIC_PAGES: swap in its <head> tags and rendered body.
 *  3. Write it to dist/pages/, outside dist/public so these files are only
 *     reachable at their clean URLs (server/vite.ts maps path to file).
 *  4. Write sitemap.xml and llms.txt from the same data.
 * Any failure aborts the build, so a broken page can't deploy silently.
 *
 * See docs/adr/009-prerendered-public-pages.md.
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const dist = path.resolve(import.meta.dirname, "..", "dist");
const { render, PUBLIC_PAGES, headHtml, sitemapXml, llmsTxt } = await import(
  pathToFileURL(path.join(dist, "ssr", "entry-server.js")).href
);

const shell = fs.readFileSync(path.join(dist, "public", "index.html"), "utf8");
const seoBlock = /<!-- seo:start[\s\S]*?<!-- seo:end -->/;
const emptyRoot = '<div id="root"></div>';
if (!seoBlock.test(shell) || !shell.includes(emptyRoot)) throw new Error("prerender: shell markers missing from index.html");

fs.rmSync(path.join(dist, "pages"), { recursive: true, force: true });
for (const page of PUBLIC_PAGES) {
  const body = render(page.path);
  if (!body.includes("<h1")) throw new Error(`prerender: ${page.path} rendered no <h1>`);
  // function replacers: a literal "$" in copy must not act as a regex group
  const html = shell.replace(seoBlock, () => headHtml(page)).replace(emptyRoot, () => `<div id="root">${body}</div>`);
  const file = path.join(dist, "pages", page.path === "/" ? "index.html" : `${page.path.slice(1)}.html`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
  console.log(`prerendered ${page.path} (${(html.length / 1024).toFixed(0)} KB)`);
}

fs.writeFileSync(path.join(dist, "public", "sitemap.xml"), sitemapXml());
fs.writeFileSync(path.join(dist, "public", "llms.txt"), llmsTxt());
console.log(`wrote sitemap.xml (${PUBLIC_PAGES.length} URLs) and llms.txt`);
