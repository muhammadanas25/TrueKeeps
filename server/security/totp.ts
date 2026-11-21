/**
 * Authenticator-app codes for staff (TOTP, RFC 6238) — no dependencies.
 *
 * What: make a secret, show it as an otpauth:// link (the QR code an
 * authenticator app scans), check the 6-digit codes it produces, encrypt the
 * secret at rest and hash the one-time backup codes.
 *
 * Why our own, ~100 lines: better-auth's two-factor plugin only challenges
 * password-style sign-ins, and TrueKeeps signs in with magic links and
 * Google, so it would never ask. The algorithm is small and fixed by the
 * RFC; Node's crypto provides everything else.
 *
 * Checking a code, step by step:
 *   1. counter = floor(unix seconds / 30)
 *   2. for the counter and its two neighbours (±30 s of clock drift):
 *      HMAC-SHA1(secret, counter as 8 bytes), take 4 bytes at the offset the
 *      last nibble names, drop the sign bit, keep the last 6 decimal digits
 *   3. compare in constant time; return the counter that matched so the
 *      caller can refuse the same code twice (replay inside its window)
 */

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { config } from "../config";

const STEP_SECONDS = 30;
const DIGITS = 6;
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** RFC 4648 base32, no padding — the format authenticator apps expect. */
export function base32Encode(buf: Buffer): string {
  let bits = 0,
    value = 0,
    out = "";
  for (let i = 0; i < buf.length; i++) {
    value = (value << 8) | buf[i];
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.replace(/=+$/, "").toUpperCase().replace(/\s/g, "");
  let bits = 0,
    value = 0;
  const out: number[] = [];
  for (let i = 0; i < clean.length; i++) {
    const idx = B32.indexOf(clean[i]);
    if (idx < 0) throw new Error("bad base32");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A new 160-bit secret, base32 (what the app stores). */
export const newSecret = () => base32Encode(randomBytes(20));

/** The 6-digit code for one 30-second step. */
export function codeAt(secretB32: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac("sha1", base32Decode(secretB32)).update(counter).digest();
  const offset = mac[mac.length - 1] & 15;
  const bin = mac.readUInt32BE(offset) & 0x7fffffff;
  return String(bin % 10 ** DIGITS).padStart(DIGITS, "0");
}

/**
 * The step a code is valid for (now ± 1 step), or null. Callers store the
 * returned step and reject any code whose step isn't greater (no replays).
 */
export function verifyCode(secretB32: string, code: string, now = Date.now()): number | null {
  const clean = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return null;
  const current = Math.floor(now / 1000 / STEP_SECONDS);
  for (const step of [current - 1, current, current + 1]) {
    const expected = Buffer.from(codeAt(secretB32, step));
    if (timingSafeEqual(expected, Buffer.from(clean))) return step;
  }
  return null;
}

/** otpauth:// link for the QR code. */
export function otpauthUrl(secretB32: string, account: string, issuer = "TrueKeeps Admin"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}

/* ── Secret at rest: AES-256-GCM ────────────────────────────────── */

/** STAFF_2FA_KEY if set, otherwise a key derived from the auth secret (never the auth secret itself). */
const KEY = createHash("sha256")
  .update(config.ops.staffKey ?? `${config.auth.secret}:staff-totp-v1`)
  .digest();

/** iv.tag.ciphertext, each base64url. */
export function sealSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", KEY, iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), ct].map((b) => b.toString("base64url")).join(".");
}

export function openSecret(sealed: string): string {
  const [iv, tag, ct] = sealed.split(".").map((p) => Buffer.from(p, "base64url"));
  const d = createDecipheriv("aes-256-gcm", KEY, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString("utf8");
}

/* ── Backup codes ───────────────────────────────────────────────── */

const hashCode = (code: string) => createHash("sha256").update(code.replace(/[\s-]/g, "").toUpperCase()).digest("hex");

/** Ten single-use codes like `K7Q2-9WXM`; returns the plain codes (shown once) and their hashes (stored). */
export function newBackupCodes(): { plain: string[]; hashes: string[] } {
  const plain = Array.from({ length: 10 }, () => {
    const s = base32Encode(randomBytes(5)).slice(0, 8);
    return `${s.slice(0, 4)}-${s.slice(4)}`;
  });
  return { plain, hashes: plain.map(hashCode) };
}

/** The remaining hashes if `code` matched one (it's used up), else null. */
export function useBackupCode(hashes: string[], code: string): string[] | null {
  const h = hashCode(code);
  const i = hashes.findIndex((x) => timingSafeEqual(Buffer.from(x), Buffer.from(h)));
  if (i < 0) return null;
  return hashes.filter((_, j) => j !== i);
}
