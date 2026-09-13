/**
 * Server entry — middleware order is the whole story here.
 *
 *   config (validated env)          → refuse to boot misconfigured
 *   security headers + trust proxy  → before anything touches cookies
 *   request logger                  → structured, redacted
 *   CORS                            → allow-list only
 *   /api/auth/*  (better-auth)      → BEFORE express.json: it parses
 *                                     its own bodies
 *   express.json (1 MB)             → bytes never come through here
 *                                     (uploads use presigned PUTs)
 *   origin check (CSRF)             → mutating /api calls only
 *   domain routes                   → all owner-checked
 *   error handler                   → JSON, never re-throws
 *   Vite (dev) / static (prod)      → SPA catch-all, last
 */

import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import { toNodeHandler } from "better-auth/node";
import { config } from "./config";
import { log, httpLogger } from "./logger";
import { auth } from "./auth";
import { applySecurity } from "./middleware/security";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic } from "./vite";
import { corsConfig } from "./cors";

const app = express();

applySecurity(app);
app.use(httpLogger);
app.use(cors(corsConfig));

// better-auth owns everything under /api/auth — sign-in, OAuth callback,
// magic-link verify, session, sign-out. Must precede the body parser.
app.all("/api/auth/*", toNodeHandler(auth));

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || (err.type === "entity.too.large" ? 413 : 500);
    // Log and respond — never re-throw here: an exception thrown from an
    // Express error handler escapes the request cycle and kills the process.
    if (status >= 500) log.error({ err, reqId: (req as { id?: string }).id }, "unhandled error");
    res.status(status).json({ error: status >= 500 ? "Internal Server Error" : err.message || "Request failed" });
  });

  // Vite only in development and after all API routes so its catch-all
  // doesn't shadow them.
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Railway injects PORT; serves API + client on the one open port.
  server.listen({ port: config.port, host: "0.0.0.0", reusePort: true }, () => {
    log.info({ port: config.port, env: config.nodeEnv, appUrl: config.appUrl }, "serving");
  });
})();
