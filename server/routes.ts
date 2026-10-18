/**
 * Route registration — one module per domain, mounted here in order.
 *
 * Order matters:
 *  1. /api/auth/* (better-auth) is mounted in index.ts BEFORE the JSON
 *     body parser because it reads the raw request itself.
 *  2. Domain routers below all sit behind express.json() and the
 *     security/origin middleware.
 *  3. The SPA catch-all (vite.ts) is registered after everything.
 *
 * Every domain router validates bodies with zod and resolves rows
 * through the ownership helpers — there are no unauthenticated writes
 * left (docs/adr/004).
 */

import type { Express } from "express";
import { createServer, type Server } from "http";
import { meRouter } from "./routes/me";
import { themesRouter } from "./routes/themes";
import { projectsRouter } from "./routes/projects";
import { pagesRouter } from "./routes/pages";
import { uploadsRouter } from "./routes/uploads";
import { ordersRouter } from "./routes/orders";

export async function registerRoutes(app: Express): Promise<Server> {
  // Liveness probe — used by the hosting platform (Railway healthcheck)
  // to gate deploys and restart dead instances. Keep it dependency-free
  // (no DB call) so a slow DB doesn't get the process killed.
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", uptime: process.uptime() });
  });

  app.use(meRouter);
  app.use(themesRouter);
  app.use(projectsRouter);
  app.use(pagesRouter);
  app.use(uploadsRouter);
  app.use(ordersRouter);

  // unknown /api paths must never fall through to the SPA index.html
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  return createServer(app);
}
