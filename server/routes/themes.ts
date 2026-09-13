/**
 * /api/themes — catalogue reads (public) and admin-only writes.
 *
 * Previously anyone could POST a theme with an arbitrary price; that is
 * now behind requireAdmin.
 */

import { Router } from "express";
import { insertThemeSchema } from "@shared/schema";
import { storage } from "../storage";
import { requireAdmin } from "../middleware/auth";
import { asyncHandler, parse } from "./helpers";

export const themesRouter = Router();

themesRouter.get(
  "/api/themes",
  asyncHandler(async (req, res) => {
    const category = typeof req.query.category === "string" ? req.query.category : undefined;
    res.json(category ? await storage.getThemesByCategory(category) : await storage.getThemes());
  }),
);

themesRouter.get(
  "/api/themes/:id",
  asyncHandler(async (req, res) => {
    const theme = await storage.getTheme(req.params.id);
    if (!theme) return res.status(404).json({ error: "Theme not found" });
    res.json(theme);
  }),
);

themesRouter.post(
  "/api/themes",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = parse(insertThemeSchema, req.body, res);
    if (!body) return;
    res.status(201).json(await storage.createTheme(body));
  }),
);
