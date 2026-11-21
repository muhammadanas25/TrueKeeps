/**
 * Unit checks for the ops console's building blocks (docs/adr/018).
 * Run: npx tsx server/ops.test.ts   (exits 1 on the first failure)
 *
 * Covers what is easy to get subtly wrong and hard to notice in use:
 *  - TOTP against the RFC 6238 reference values, the ±30 s window, replay
 *    step reporting, base32 round trips
 *  - backup codes are single-use and case/dash insensitive
 *  - the authenticator secret seals and opens, and tampering is detected
 *  - latency percentiles read from merged histograms
 *  - device / OS / browser buckets for common Pakistani phones and desktops
 *  - WhatsApp numbers normalise to 92…
 */

import assert from "node:assert/strict";
import { base32Decode, base32Encode, codeAt, newBackupCodes, openSecret, sealSecret, useBackupCode, verifyCode } from "./security/totp";
import { BUCKET_BOUNDS, bucketOf, percentile } from "./analytics/latency";
import { parseUA } from "./analytics/ua";
import { toWhatsappNumber } from "./notify/whatsapp";
import { whatsappNumberSchema } from "@shared/ops";
import { ipAllowed } from "./middleware/staff";

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (err) {
    console.error(`FAIL ${name}\n`, err);
    process.exit(1);
  }
}

test("base32 round trip", () => {
  const buf = Buffer.from("12345678901234567890");
  assert.equal(base32Encode(buf), "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  assert.deepEqual(base32Decode("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"), buf);
});

test("TOTP matches RFC 6238 SHA-1 vectors (last 6 digits)", () => {
  const secret = base32Encode(Buffer.from("12345678901234567890"));
  // RFC 6238 Appendix B: T=59 → 94287082, T=1111111109 → 07081804, T=1234567890 → 89005924
  assert.equal(codeAt(secret, Math.floor(59 / 30)), "287082");
  assert.equal(codeAt(secret, Math.floor(1111111109 / 30)), "081804");
  assert.equal(codeAt(secret, Math.floor(1234567890 / 30)), "005924");
});

test("TOTP accepts ±1 step and reports the step, rejects others", () => {
  const secret = base32Encode(Buffer.from("12345678901234567890"));
  const now = 1234567890_000;
  const step = Math.floor(now / 30000);
  assert.equal(verifyCode(secret, codeAt(secret, step), now), step);
  assert.equal(verifyCode(secret, codeAt(secret, step - 1), now), step - 1);
  assert.equal(verifyCode(secret, codeAt(secret, step + 1), now), step + 1);
  assert.equal(verifyCode(secret, codeAt(secret, step + 2), now), null);
  assert.equal(verifyCode(secret, "12345", now), null);
  assert.equal(verifyCode(secret, "abcdef", now), null);
});

test("backup codes are single use and forgiving about case and dashes", () => {
  const { plain, hashes } = newBackupCodes();
  assert.equal(plain.length, 10);
  const left = useBackupCode(hashes, plain[3].toLowerCase().replace("-", ""));
  assert.ok(left && left.length === 9);
  assert.equal(useBackupCode(left!, plain[3]), null);
  assert.equal(useBackupCode(hashes, "AAAA-BBBB"), null);
});

test("sealed secret opens; tampering throws", () => {
  const sealed = sealSecret("JBSWY3DPEHPK3PXP");
  assert.equal(openSecret(sealed), "JBSWY3DPEHPK3PXP");
  const [iv, tag, ct] = sealed.split(".");
  const bad = [iv, tag, Buffer.from(Buffer.from(ct, "base64url").map((b, i) => (i === 0 ? b ^ 1 : b))).toString("base64url")].join(".");
  assert.throws(() => openSecret(bad));
});

test("latency percentiles from buckets", () => {
  const buckets = new Array(BUCKET_BOUNDS.length + 1).fill(0);
  for (let i = 0; i < 90; i++) buckets[bucketOf(40)]++; // 90 fast calls ≤ 50 ms
  for (let i = 0; i < 9; i++) buckets[bucketOf(400)]++; // 9 at ≤ 500 ms
  buckets[bucketOf(4000)]++; // 1 outlier ≤ 5 s
  assert.equal(percentile(buckets, 0.5), 50);
  assert.equal(percentile(buckets, 0.9), 50);
  assert.equal(percentile(buckets, 0.95), 500);
  assert.equal(percentile(buckets, 0.99), 500);
  assert.equal(percentile(buckets, 1), 5000);
  assert.equal(percentile(new Array(BUCKET_BOUNDS.length + 1).fill(0), 0.5), null);
});

test("user-agent buckets", () => {
  const samsung = "Mozilla/5.0 (Linux; Android 13; SM-A145F) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36";
  assert.deepEqual(parseUA(samsung), { device: "phone", os: "Android", browser: "Samsung Internet" });
  const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
  assert.deepEqual(parseUA(iphone), { device: "phone", os: "iOS", browser: "Safari" });
  const mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
  assert.deepEqual(parseUA(mac), { device: "computer", os: "macOS", browser: "Chrome" });
  assert.equal(parseUA(mac, { touch: true, screenW: 1024 }).device, "tablet"); // iPad asking for the desktop site
  const win = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0";
  assert.deepEqual(parseUA(win), { device: "computer", os: "Windows", browser: "Edge" });
  const insta = "Mozilla/5.0 (Linux; Android 12; Infinix X6816) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36 Instagram 300.0";
  assert.equal(parseUA(insta).browser, "In-app (Facebook/Instagram)");
});

test("WhatsApp numbers normalise to 92…", () => {
  assert.equal(toWhatsappNumber("0300 1234567"), "923001234567");
  assert.equal(toWhatsappNumber("+92 300-1234567"), "923001234567");
  assert.equal(toWhatsappNumber("00923001234567"), "923001234567");
  assert.equal(toWhatsappNumber("12"), null);
  assert.equal(whatsappNumberSchema.parse("0300 1234567"), "923001234567");
  assert.equal(whatsappNumberSchema.safeParse("abc").success, false);
});

test("IP allow-list", () => {
  assert.equal(ipAllowed("1.2.3.4", []), true);
  assert.equal(ipAllowed("203.0.113.9", ["203.0.113."]), true);
  assert.equal(ipAllowed("::ffff:203.0.113.9", ["203.0.113."]), true);
  assert.equal(ipAllowed("203.0.114.9", ["203.0.113."]), false);
  assert.equal(ipAllowed("10.0.0.1", ["10.0.0.1"]), true);
  assert.equal(ipAllowed(undefined, ["10.0.0.1"]), false);
});

console.log(`ALL CHECKS PASSED (${passed} tests)`);
