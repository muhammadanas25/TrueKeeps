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
 *                                     (uploads use presigned PUTs);
 *                                     skipped for signed webhooks
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
import { auth, CLIENT_IP_HEADER } from "./auth";
import { applySecurity } from "./middleware/security";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic } from "./vite";
import { corsConfig } from "./cors";
import { startOrderJobs } from "./orders/service";

const app = express();

applySecurity(app);
app.use(httpLogger);
app.use(cors(corsConfig));

// better-auth owns everything under /api/auth — sign-in, OAuth callback,
// magic-link verify, session, sign-out. Must precede the body parser.
//
// Client IP for its rate limiter: behind Railway's proxy better-auth sees
// only a multi-hop X-Forwarded-For, which it (rightly) won't trust, and
// would put every visitor in ONE bucket — 3 magic links/min site-wide.
// Express already resolved the real client via `trust proxy`; pass that
// through a header we always overwrite, so clients can't spoof it.
app.all("/api/auth/*", (req, _res, next) => {
  req.headers[CLIENT_IP_HEADER] = req.ip ?? "";
  next();
}, toNodeHandler(auth));

// Webhooks are authenticated by an HMAC over their exact bytes, so their
// body must reach the route unparsed (it uses express.raw itself).
const jsonParser = express.json({ limit: "1mb" });
const formParser = express.urlencoded({ extended: false, limit: "1mb" });
app.use((req, res, next) => (req.path.startsWith("/api/payments/webhook/") ? next() : jsonParser(req, res, next)));
app.use((req, res, next) => (req.path.startsWith("/api/payments/webhook/") ? next() : formParser(req, res, next)));

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
  // payment reconciliation + expiry sweep (see server/orders/service.ts)
  startOrderJobs();

  server.listen({ port: config.port, host: "0.0.0.0", reusePort: true }, () => {
    log.info({ port: config.port, env: config.nodeEnv, appUrl: config.appUrl }, "serving");
  });
})();
