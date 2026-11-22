/**
 * Email checks for the sign-in sheet (owner, 2026-11-22: "add validation to
 * email"). A sign-in link sent to "ayesha@gmial.com" never arrives and the
 * customer thinks the site is broken, so the common slips are caught before
 * sending.
 *
 * Approach: a strict-enough shape check, then a fix for the domain when it is
 * one or two letters away from a mailbox most of our customers use (edit
 * distance <= 2, and never "fixing" a domain that is itself on the list).
 */

/** Mail domains common in Pakistan, most used first. */
const COMMON = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com", "live.com", "ymail.com", "msn.com"];

/** Shape: something@something.tld, no spaces, a 2+ letter ending. */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

/** Levenshtein distance, capped small: only near-misses matter here. */
function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/** The address with its domain corrected, or null when it looks right (or isn't close to anything). */
export function suggestEmail(value: string): string | null {
  const at = value.lastIndexOf("@");
  if (at < 1) return null;
  const domain = value.slice(at + 1).toLowerCase();
  if (COMMON.includes(domain)) return null;
  let best: string | null = null;
  let bestD = 3;
  for (const c of COMMON) {
    const dd = distance(domain, c);
    if (dd < bestD) {
      best = c;
      bestD = dd;
    }
  }
  return best ? value.slice(0, at + 1) + best : null;
}
