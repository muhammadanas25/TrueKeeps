/**
 * RepickSheet — exactly which photos to add again (design A4, owner-approved
 * 2026-11-28).
 *
 * When it shows: only for photos whose HD copy never finished AND that the
 * phone couldn't keep (stash.ts): private browsing, a full phone, or a browser
 * that cleared its storage. Everyone else is carried on automatically.
 *
 * Why it looks like this: the owner found it "very hard to upload the exact
 * remaining images". So each photo is shown as the customer will recognise
 * it in their gallery: its picture, its file name, when it was taken and
 * which page it's on. And they don't have to find them one by one: choosing
 * the whole album again is fine, because the sheet only takes the photos the
 * book is waiting on (engine.add with onlyMissing) and ignores the rest.
 */

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ImagePlus, SquareCheckBig } from "lucide-react";
import { pageNumber, type BookPage, type BuilderPhoto } from "../data";
import { photoSrc } from "./previews";
import { useUploads } from "./UploadContext";

/** How many photos to show by name before "and N more". */
const SHOWN = 3;

const dayFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit", hour12: true });
const dayMonth = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long" });

/** "15–17 July", "30 July – 2 August" or "15 July", for the photos not listed by name. */
function dateRange(times: number[]): string {
  if (!times.length) return "";
  const a = new Date(Math.min(...times));
  const b = new Date(Math.max(...times));
  if (a.toDateString() === b.toDateString()) return dayMonth.format(a);
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) return `${a.getDate()}–${dayMonth.format(b)}`;
  return `${dayMonth.format(a)} – ${dayMonth.format(b)}`;
}

/** Where the photo is in the book, as the customer sees it numbered. */
function whereInBook(id: string, pages: BookPage[], coverPhotoId: string | null): string | null {
  if (coverPhotoId === id) return "cover";
  const idx = pages.findIndex((pg) => pg.slots.some((s) => s.photoId === id));
  return idx < 0 ? null : `page ${pageNumber(pages, idx)}`;
}

export function RepickSheet({
  photos,
  pages,
  coverPhotoId,
  onClose,
}: {
  /** the photos to add again */
  photos: BuilderPhoto[];
  pages: BookPage[];
  coverPhotoId: string | null;
  onClose: () => void;
}) {
  const { addFiles } = useUploads();
  const inputRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState<string | null>(null);
  const n = photos.length;
  const rest = photos.slice(SHOWN);
  const restDates = dateRange(rest.map((p) => p.taken).filter((t): t is number => Boolean(t)));

  const onPicked = async (files: File[] | null) => {
    const before = n;
    const { resumed } = await addFiles(files, { onlyMissing: true });
    if (!resumed) {
      setNote("None of those are the photos below. Look for the names and dates shown here.");
      return;
    }
    if (resumed >= before) return onClose();
    setNote(`Found ${resumed}. ${before - resumed} still to add.`);
  };

  return createPortal(
    <div className="rp-veil" role="dialog" aria-modal="true" aria-labelledby="rp-title">
      <div className="rp-sheet">
        <header className="rp-head">
          <button type="button" className="rp-back" aria-label="Back" onClick={onClose}>
            <ChevronLeft size={20} />
          </button>
        </header>
        <div className="rp-body">
          <div className="rp-intro">
            <h2 id="rp-title">
              {n} {n === 1 ? "photo needs" : "photos need"} adding again
            </h2>
            <p>This phone couldn't keep {n === 1 ? "it" : "them"} while the page was closed. {n === 1 ? "It's the one below." : "They're the ones below."}</p>
          </div>
          <div className="rp-tip">
            <SquareCheckBig size={20} aria-hidden="true" />
            <p>
              <b>The easy way:</b> select the same album again, even all of it. We'll take only {n === 1 ? "this one" : `these ${n}`} and skip the rest.
            </p>
          </div>
          <ul className="rp-list">
            {photos.slice(0, SHOWN).map((p) => {
              const src = photoSrc(p, "thumb");
              const where = whereInBook(p.id, pages, coverPhotoId);
              const when = p.taken ? `Taken ${dayFmt.format(p.taken)}, ${timeFmt.format(p.taken)}` : null;
              return (
                <li key={p.id}>
                  {src ? <img src={src} alt="" /> : <span className="rp-noimg" aria-hidden="true" />}
                  <span>
                    <b>{p.name ?? p.label}</b>
                    <span>{[when, where].filter(Boolean).join(" · ")}</span>
                  </span>
                </li>
              );
            })}
            {rest.length ? (
              <li className="rp-more">
                and {rest.length} more{restDates ? ` from ${restDates}` : ""}
              </li>
            ) : null}
          </ul>
          {note ? (
            <p className="rp-note" role="status">
              {note}
            </p>
          ) : null}
        </div>
        <footer className="rp-foot">
          <input
            ref={inputRef}
            type="file"
            accept="image/*,.heic,.heif"
            multiple
            hidden
            onChange={(e) => {
              void onPicked(e.target.files ? Array.from(e.target.files) : null);
              e.target.value = "";
            }}
          />
          <button type="button" className="bb-btn bb-btn-primary bb-btn-lg" onClick={() => inputRef.current?.click()}>
            <ImagePlus size={17} /> Choose photos
          </button>
          <span>Your book keeps its layout. Nothing you've designed changes.</span>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
