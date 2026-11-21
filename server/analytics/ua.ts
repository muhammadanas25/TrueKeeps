/**
 * Device, operating system and browser from a User-Agent — a few regexes.
 *
 * Why not a library: the well-known parser changed to a copyleft licence in
 * v2, and the admin only needs coarse buckets (phone/tablet/computer,
 * Android/iPhone/Windows/Mac…, Chrome/Safari/Samsung…). The browser also
 * sends its screen width and whether it has touch, which settles the cases a
 * UA can't (an iPad asks for desktop sites and claims to be a Mac).
 *
 * Order matters in each list: Samsung Internet and Edge say "Chrome" too, and
 * Chrome says "Safari", so the more specific names are tested first.
 */

export interface UaInfo {
  device: "phone" | "tablet" | "computer";
  os: string;
  browser: string;
}

export function parseUA(ua: string, hints: { screenW?: number; touch?: boolean } = {}): UaInfo {
  const s = ua || "";
  const os = /Android/i.test(s)
    ? "Android"
    : /iPhone|iPod/i.test(s)
      ? "iOS"
      : /iPad/i.test(s) || (/Macintosh/i.test(s) && hints.touch)
        ? "iPadOS"
        : /Windows/i.test(s)
          ? "Windows"
          : /CrOS/i.test(s)
            ? "ChromeOS"
            : /Macintosh|Mac OS X/i.test(s)
              ? "macOS"
              : /Linux/i.test(s)
                ? "Linux"
                : "Other";
  const browser = /SamsungBrowser/i.test(s)
    ? "Samsung Internet"
    : /Edg\//i.test(s)
      ? "Edge"
      : /OPR\/|Opera/i.test(s)
        ? "Opera"
        : /FBAN|FBAV|Instagram/i.test(s)
          ? "In-app (Facebook/Instagram)"
          : /Firefox|FxiOS/i.test(s)
            ? "Firefox"
            : /Chrome|CriOS/i.test(s)
              ? "Chrome"
              : /Safari/i.test(s)
                ? "Safari"
                : "Other";
  const tabletUa = /iPad|Tablet|(Android(?!.*Mobile))/i.test(s) || os === "iPadOS";
  const phoneUa = /Mobi|iPhone|iPod|Android.*Mobile/i.test(s);
  const device: UaInfo["device"] = tabletUa ? "tablet" : phoneUa || (hints.touch && (hints.screenW ?? 9999) < 600) ? "phone" : "computer";
  return { device, os, browser };
}
