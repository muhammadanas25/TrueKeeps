/**
 * What we say while photos upload. Copy written by the owner.
 *
 * Rotates every 7 seconds and is chosen for the moment rather than shuffled:
 * it opens with the one thing the customer has to do, "Almost there" only ever
 * appears when it's true, and a warning about the customer's actual photos
 * beats any general advice.
 *
 * "Pick from your gallery" and the like only help before photos are chosen, so
 * those are the BEFORE tips, on the upload screen. Afterwards the same advice
 * only appears when it applies to a photo they really picked.
 *
 * Each line carries a `kind`, which TipLine turns into a short bold lead-in
 * ("About your photos:", "Good to know:"…), so a warning about the
 * customer's own photos never looks like a passing thought. The words
 * themselves are the owner's and are unchanged.
 */

import type { PhotoNotices } from "./engine";

export const TIP_INTERVAL_MS = 7000;

/**
 * What a line is, which decides its lead-in (UploadStatus.tsx):
 *  - keep-open: the one thing the customer has to do
 *  - photo: about photos they actually picked (a gentle warning)
 *  - advice: practical, about the book
 *  - thought: why the book is worth making
 *  - privacy: what happens to their photos
 *  - nearly: the upload is close to done
 *  - before: print advice shown before photos are chosen
 */
export type TipKind = "keep-open" | "photo" | "advice" | "thought" | "privacy" | "nearly" | "before";

export interface Tip {
  kind: TipKind;
  text: string;
}

/** Shown before photos are chosen, while the advice can still change the choice. */
export const BEFORE_TIPS: Tip[] = [
  { kind: "before", text: "Bright, sharp photos print best. Dark or blurry ones may look softer on paper." },
  { kind: "before", text: "Screenshots and WhatsApp-forwarded photos are lower quality. Use the original from your phone's gallery if you can." },
  { kind: "before", text: "Use the full photo instead of a cropped one. It keeps the print sharp." },
  { kind: "before", text: "Night photos can print a little darker. Choose the brightest ones." },
];

const FIRST: Tip = { kind: "keep-open", text: "Please keep this page open while your photos upload." };

/** Still useful while they wait, because all of these are about the book, not the picking. */
const WAITING: Tip[] = [
  { kind: "thought", text: "Remember Nani's old albums? You're making the next one." },
  { kind: "advice", text: "Zoom in on your photo. If faces look clear, they'll print lovely." },
  { kind: "thought", text: "Someday, someone small will point at a photo and ask, “Who's that?”" },
  { kind: "advice", text: "You can still change your photos before you order." },
  { kind: "thought", text: "The stories behind these photos deserve to outlive our phones." },
  { kind: "advice", text: "Save your best photo for a full page. It deserves the space." },
  { kind: "thought", text: "A photo on your phone gets seen once. A photo in a book gets seen for years." },
  { kind: "privacy", text: "Your photos stay private and are only used to make your book." },
  { kind: "thought", text: "Every photo uploading right now is a memory being kept safe." },
];

const NEARLY: Tip = { kind: "nearly", text: "Almost there. Your story is coming together." };

/** A line about the photos they actually chose, or null when there's nothing to say. */
export function noticeLines(n: PhotoNotices): string[] {
  const lines: string[] = [];
  const many = (count: number, one: string, more: string) => (count === 1 ? one : `${count} ${more}`);
  if (n.whatsapp) lines.push(`${many(n.whatsapp, "One photo looks", "photos look")} like a WhatsApp copy. The original from your gallery will print sharper.`);
  if (n.screenshots) lines.push(`${many(n.screenshots, "One photo looks", "photos look")} like a screenshot. Screenshots lose a lot of detail on paper.`);
  if (n.small) lines.push(`${many(n.small, "One photo is", "photos are")} on the small side and may look soft on a full page.`);
  if (n.dark) lines.push(`${many(n.dark, "One photo is", "photos are")} quite dark. Dark photos can print a little darker still.`);
  return lines;
}

/**
 * The line for tick `n`. `progress` runs from 0 to 1 across the whole upload.
 * Notices lead so they're seen once, then the sequence runs and repeats.
 */
export function tipFor(n: number, progress: number, notices: string[]): Tip {
  if (progress >= 0.85 && n % 2 === 0) return NEARLY;
  const sequence: Tip[] = [FIRST, ...notices.map((text): Tip => ({ kind: "photo", text })), ...WAITING];
  if (n < sequence.length) return sequence[n];
  // after the first pass, skip the instruction and the one-off notices
  return WAITING[(n - sequence.length) % WAITING.length];
}

/** "about 12 minutes", without pretending to more precision than the estimate has. */
export function formatEta(seconds: number): string {
  if (seconds < 60) return "under a minute";
  const min = Math.ceil(seconds / 60);
  if (min === 1) return "about a minute";
  if (min < 60) return `about ${min} minutes`;
  const h = Math.floor(min / 60);
  const m = Math.round((min % 60) / 5) * 5;
  const hours = h === 1 ? "1 hour" : `${h} hours`;
  return m ? `about ${hours} ${m} minutes` : `about ${hours}`;
}
