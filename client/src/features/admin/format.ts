/**
 * Small display helpers shared by the admin pages: money, dates, ages,
 * status and print-state labels with their colour tone.
 *
 * Tones map to admin.css pill classes (ad-pill-*): `ok` teal, `warn` amber,
 * `bad` rose, `info` indigo tint, `muted` grey. Colours that must be told
 * apart also differ in lightness (brand + accessibility rule).
 */

import { formatPKR } from "@shared/pricing";
import { PRINT_STATE_LABEL, type PrintState } from "@shared/ops";

export type Tone = "ok" | "warn" | "bad" | "info" | "muted";
export type ActionKind = "print" | "late" | "printer" | "delivery" | "transfer" | "payment";

export const money = (minor: number | null | undefined) => (minor === null || minor === undefined ? "—" : formatPKR(minor));

export function ago(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60000);
  if (m < 60) return `${Math.max(1, m)}m`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

export const day = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-PK", { day: "numeric", month: "short", timeZone: "Asia/Karachi" }) : "—";

export const when = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("en-PK", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Karachi" }) : "—";

export const STATUS: Record<string, [string, Tone]> = {
  pending_payment: ["Awaiting payment", "muted"],
  paid: ["Paid", "ok"],
  in_production: ["At printer", "info"],
  shipped: ["Shipped", "info"],
  delivered: ["Delivered", "ok"],
  cancelled: ["Cancelled", "muted"],
  expired: ["Expired", "muted"],
  refunded: ["Refunded", "bad"],
};

export function printTone(state: string | undefined, problems = 0): [string, Tone] {
  if (!state) return ["Not started", "muted"];
  if (state === "failed") return ["Failed", "bad"];
  if (state === "checked") return problems ? [`Checked · ${problems} problem${problems > 1 ? "s" : ""}`, "warn"] : ["Checked", "ok"];
  return [PRINT_STATE_LABEL[state as PrintState] ?? state, "muted"];
}

export const ACTION_KIND: Record<ActionKind, [string, Tone]> = {
  print: ["Print file", "bad"],
  late: ["Late", "warn"],
  printer: ["Printer", "warn"],
  delivery: ["Delivery", "warn"],
  transfer: ["Bank transfer", "info"],
  payment: ["Payment", "bad"],
};

export const pct = (x: number | null | undefined, digits = 1) => (x === null || x === undefined || !isFinite(x) ? "—" : `${(x * 100).toFixed(digits)}%`);

/** "▲ 12%" / "▼ 3%" against the previous period, with its tone. */
export function delta(cur: number, prev: number): { text: string; tone: Tone } {
  if (!prev) return { text: cur ? "new" : "no change", tone: "muted" };
  const d = (cur - prev) / prev;
  return { text: `${d >= 0 ? "▲" : "▼"} ${Math.abs(d * 100).toFixed(0)}% vs previous`, tone: d >= 0 ? "ok" : "bad" };
}

export const ms = (v: number | null | undefined) => (v === null || v === undefined ? "—" : v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)} s` : `${Math.round(v)} ms`);
export const secs = (msv: number | null | undefined) => {
  if (msv === null || msv === undefined) return "—";
  const s = Math.round(Number(msv) / 1000);
  return s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`;
};

/** WhatsApp link for a Pakistani number (03… → 923…). */
export function waLink(phone: string): string {
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("0")) d = "92" + d.slice(1);
  return `https://wa.me/${d}`;
}
