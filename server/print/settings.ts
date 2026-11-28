/**
 * Print settings the owner changes in the admin (Admin › Print queue › Print
 * settings, docs/adr/026). Stored in app_settings under "print", so a switch
 * needs no redeploy; anything missing or invalid falls back to the default.
 *
 *   sheetDpi  the resolution of the sheet JPEGs for the printer: 300 (default,
 *             the photo-lab standard) or 640 (the Noritsu's native laser
 *             resolution; files about 4 times larger)
 *   coversTogether  front and back cover on one sheet (back | front), saving a
 *             print per book (default, owner 2026-11-28), or two pictures
 *
 * A change applies to print files built from then on; existing versions are
 * immutable, so "Rebuild as a new version" makes one at the new setting.
 */

import { z } from "zod";
import { storage } from "../storage";
import { DEFAULT_SHEET_DPI, SHEET_DPI_OPTIONS } from "./jpegs";

export const PRINT_SETTINGS_KEY = "print";

export const printSettingsSchema = z.object({
  sheetDpi: z.union([z.literal(SHEET_DPI_OPTIONS[0]), z.literal(SHEET_DPI_OPTIONS[1])]),
  coversTogether: z.boolean().default(true),
});
export type PrintSettings = z.infer<typeof printSettingsSchema>;

export const DEFAULT_PRINT_SETTINGS: PrintSettings = { sheetDpi: DEFAULT_SHEET_DPI, coversTogether: true };

export async function getPrintSettings(): Promise<PrintSettings> {
  const parsed = printSettingsSchema.safeParse(await storage.getSetting(PRINT_SETTINGS_KEY));
  return parsed.success ? parsed.data : DEFAULT_PRINT_SETTINGS;
}
