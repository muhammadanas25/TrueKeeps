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
 * left (docs/adr/004), except POST /api/feedback, which anyone may send
 * and which is rate limited and honeypotted instead (docs/adr/015).
 */

import type { Express } from "express";
import { createServer, type Server } from "http";
import { meRouter } from "./routes/me";
import { themesRouter } from "./routes/themes";
import { projectsRouter } from "./routes/projects";
import { pagesRouter } from "./routes/pages";
import { uploadsRouter } from "./routes/uploads";
import { uploadMetricsRouter } from "./routes/upload-metrics";
import { ordersRouter } from "./routes/orders";
import { feedbackRouter } from "./routes/feedback";
import { staffAuthRouter } from "./routes/staff-auth";
import { adminConsoleRouter } from "./routes/admin-console";
import { whatsappWebhookRouter } from "./routes/webhooks-whatsapp";
import { collectRouter } from "./analytics/collect";
import { affiliatesRouter } from "./routes/affiliates";
import { refAttach, refCapture } from "./affiliates/attribution";
import { requireStaff } from "./middleware/staff";
import rateLimit from "express-rate-limit";

export async function registerRoutes(app: Express): Promise<Server> {
  // Liveness probe — used by the hosting platform (Railway healthcheck)
  // to gate deploys and restart dead instances. Keep it dependency-free
  // (no DB call) so a slow DB doesn't get the process killed.
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", uptime: process.uptime() });
  });

  // Affiliate links (docs/adr/022): remember a ?ref= tap on any page, and
  // save it onto the account at the next API call. Neither ever fails a request.
  app.use(refCapture);
  app.use("/api", refAttach);

  // The staff gate (docs/adr/018): every /api/admin/* request, including any
  // added later, must be staff with the second sign-in step passed. Mounted
  // before the routers so no admin route can be reached around it.
  app.use(
    "/api/admin",
    rateLimit({ windowMs: 60_000, limit: 600, standardHeaders: "draft-7", legacyHeaders: false, message: { error: "Too many requests" } }),
    requireStaff(),
  );

  app.use(staffAuthRouter);
  app.use(adminConsoleRouter);
  app.use(affiliatesRouter);
  app.use(collectRouter);
  app.use(whatsappWebhookRouter);
  app.use(meRouter);
  app.use(themesRouter);
  app.use(projectsRouter);
  app.use(pagesRouter);
  app.use(uploadsRouter);
  app.use(uploadMetricsRouter);
  app.use(ordersRouter);
  app.use(feedbackRouter);

  // unknown /api paths must never fall through to the SPA index.html
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  return createServer(app);
}
