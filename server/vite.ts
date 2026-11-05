import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";
import { isAppRoute, isPublicPath } from "@shared/site";

const viteLogger = createLogger();

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

/**
 * Production file serving. Crawlers read status codes literally, so each URL
 * gets an honest answer instead of the old "index.html, 200" for everything:
 *  - public pages → their prerendered HTML (dist/pages), 200
 *  - app routes (builder, account) → the empty app shell, 200 + noindex
 *  - anything else → the app shell, 404 + noindex (the app shows its not-found)
 * Real files (robots.txt, sitemap.xml, /assets/*) are served first.
 */
export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "public");
  const pagesPath = path.resolve(import.meta.dirname, "pages");

  if (!fs.existsSync(distPath) || !fs.existsSync(pagesPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  const shell = path.resolve(distPath, "index.html");
  const NOINDEX = "noindex, nofollow";

  // the raw shell must not exist as a second, empty copy of the homepage
  app.get("/index.html", (_req, res) => res.redirect(301, "/"));

  app.use(
    express.static(distPath, {
      index: false,
      setHeaders: (res, file) => {
        // Vite puts a content hash in these filenames, so they never change
        if (file.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
      },
    }),
  );

  app.use("*", (req, res) => {
    // originalUrl, not baseUrl: under "*" Express reports "" for the homepage
    // and drops trailing slashes
    const queryAt = req.originalUrl.indexOf("?");
    const url = queryAt < 0 ? req.originalUrl : req.originalUrl.slice(0, queryAt);
    const query = queryAt < 0 ? "" : req.originalUrl.slice(queryAt);

    // one URL per page: /photo-books/ → /photo-books, keeping any query string
    if (url.length > 1 && url.endsWith("/") && isPublicPath(url.slice(0, -1))) {
      return res.redirect(301, url.slice(0, -1) + query);
    }

    if (isPublicPath(url)) {
      const file = url === "/" ? "index.html" : `${url.slice(1)}.html`;
      return res.sendFile(path.resolve(pagesPath, file));
    }

    res.setHeader("X-Robots-Tag", NOINDEX);
    res.status(isAppRoute(url) ? 200 : 404).sendFile(shell);
  });
}
