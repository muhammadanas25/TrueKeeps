/**
 * Editor v2 tool panels — Layout · Photos · Style · Text.
 *
 * One panel is open at a time: in the desktop drawer beside the canvas,
 * or as a bottom sheet on a phone. Each panel shows the few choices most
 * people need and tucks the rest one tap away ("4 more looks", the "+"
 * colour grid, "Re-arrange the whole book"), the way onceupon.photo
 * offers depth without a wall of controls.
 */

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Columns2,
  FlipHorizontal2,
  Frame,
  LayoutDashboard,
  Loader2,
  Plus,
  RefreshCw,
  Square,
  SquareDashed,
} from "lucide-react";
import { LayoutWire } from "../book";
import {
  BOOK_THEMES,
  DENSITIES,
  LAYOUTS,
  isMirrorable,
  themeById,
  type BookPage,
  type BookTheme,
  type BuilderPhoto,
  type DensityId,
  type PageLayoutId,
} from "../data";
import { FONTS, LOOK_ORDER, lookDefaults, type EdgeId, type FontId } from "../looks";
import { THEME_COLOUR, relativeLuminance, resolvePageHex } from "../palette";
import type { BookSlice } from "./book-ops";
import { PHOTO_MIME } from "./SlotLayer";

/* ── small building blocks ─────────────────────────────────────── */

export function Section({ label, right, children, hint }: { label: string; right?: ReactNode; children: ReactNode; hint?: ReactNode }) {
  return (
    <section className="tke-sec">
      <div className="tke-sec-h">
        <span>{label}</span>
        {right}
      </div>
      {children}
      {hint ? <p className="tke-hint">{hint}</p> : null}
    </section>
  );
}

export function Seg<T extends string | boolean>({
  options,
  value,
  onChange,
  small,
}: {
  options: Array<{ v: T; label: string; icon?: ReactNode }>;
  value: T;
  onChange: (v: T) => void;
  small?: boolean;
}) {
  return (
    <div className={"tke-seg" + (small ? " sm" : "")} role="radiogroup">
      {options.map((o) => (
        <button key={String(o.v)} role="radio" aria-checked={value === o.v} className={value === o.v ? "on" : ""} onClick={() => onChange(o.v)}>
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Swatch({ c, on, onClick, label }: { c: string; on: boolean; onClick: () => void; label?: string }) {
  const dark = relativeLuminance(c) < 0.18;
  return (
    <button
      className={"tke-sw" + (on ? " on" : "")}
      style={{ background: c, color: dark ? "#fff" : "#3C3C3B" }}
      onClick={onClick}
      title={label ?? c}
      aria-label={label ?? c}
      aria-pressed={on}
    >
      {on ? <Check size={13} strokeWidth={2.5} /> : null}
    </button>
  );
}

/* ── Layout ────────────────────────────────────────────────────── */

export function LayoutPanel({
  theme,
  activePage,
  spreadTargets,
  density,
  onPickPage,
  onLayout,
  onMirror,
  onReflow,
}: {
  theme: BookTheme;
  activePage: BookPage | null;
  /** the photo pages on this spread, to choose which one the panel edits */
  spreadTargets: Array<{ id: string; label: string }>;
  density: DensityId;
  onPickPage: (id: string) => void;
  onLayout: (layout: PageLayoutId) => void;
  onMirror: () => void;
  onReflow: (d: DensityId) => void;
}) {
  const [openBook, setOpenBook] = useState(false);
  return (
    <div>
      {!activePage || activePage.layout === "title" ? (
        <Section label="This page">
          <p className="tke-empty">The title page is words only — tap the title on the page to change it.</p>
        </Section>
      ) : (
        <Section label="Page layout">
          {spreadTargets.length > 1 ? (
            <Seg small options={spreadTargets.map((t) => ({ v: t.id, label: t.label }))} value={activePage.id} onChange={onPickPage} />
          ) : null}
          {[1, 2, 3].map((n) => (
            <div key={n} className="tke-wire-group">
              <div className="tke-wire-n">
                {n} photo{n > 1 ? "s" : ""}
              </div>
              <div className="tke-wire-row">
                {LAYOUTS.filter((l) => l.slots === n).map((l) => (
                  <button key={l.id} className={"tke-wire" + (activePage.layout === l.id ? " on" : "")} onClick={() => onLayout(l.id)} aria-pressed={activePage.layout === l.id}>
                    <span className="tke-wire-pg">
                      <LayoutWire id={l.id} theme={theme} mirror={l.id === activePage.layout ? activePage.mirror : false} />
                    </span>
                    <span className="tke-wire-l">{l.name}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          {isMirrorable(activePage.layout) ? (
            <button className="tke-more" onClick={onMirror}>
              <FlipHorizontal2 size={14} /> Flip the collage
            </button>
          ) : null}
        </Section>
      )}
      <section className="tke-sec">
        <button className="tke-disclose" onClick={() => setOpenBook(!openBook)} aria-expanded={openBook}>
          <span>
            <b>Re-arrange the whole book</b>
            <small>Same photos, new rhythm</small>
          </span>
          {openBook ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {openBook ? (
          <div className="tke-density">
            {DENSITIES.map((d) => (
              <button key={d.id} className={density === d.id ? "on" : ""} onClick={() => onReflow(d.id)}>
                {d.id === "minimal" ? <Square size={18} /> : d.id === "balanced" ? <Columns2 size={18} /> : <LayoutDashboard size={18} />}
                <span>
                  <b>{d.name}</b>
                  <small>{d.blurb}</small>
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}

/* ── Photos ────────────────────────────────────────────────────── */

export function PhotosPanel({
  photos,
  usage,
  selecting,
  isMobile,
  uploading,
  onPick,
  onAddFiles,
}: {
  photos: BuilderPhoto[];
  usage: Map<string, number>;
  /** a photo is selected → tapping here swaps it */
  selecting: boolean;
  isMobile: boolean;
  uploading: boolean;
  onPick: (photoId: string) => void;
  onAddFiles: (files: FileList) => void;
}) {
  const [filter, setFilter] = useState<"all" | "unused">("all");
  const input = useRef<HTMLInputElement>(null);
  const unused = photos.filter((p) => !usage.get(p.id)).length;
  const list = filter === "unused" ? photos.filter((p) => !usage.get(p.id)) : photos;
  return (
    <div>
      {selecting ? (
        <div className="tke-banner">
          <RefreshCw size={15} /> Tap a photo to swap it in
        </div>
      ) : null}
      <Section
        label={photos.length + " photos"}
        right={
          <button className="tke-link" onClick={() => input.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 size={14} className="tke-spin" /> : <Plus size={14} />}
            {uploading ? "Adding…" : "Add"}
          </button>
        }
      >
        <input
          ref={input}
          type="file"
          accept="image/*,.heic,.heif"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) onAddFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <Seg
          small
          options={[
            { v: "all" as const, label: "All" },
            { v: "unused" as const, label: "Not in book · " + unused },
          ]}
          value={filter}
          onChange={setFilter}
        />
        <div className="tke-photos">
          {list.map((p) => {
            const n = usage.get(p.id) ?? 0;
            return (
              <button
                key={p.id}
                className="tke-ph"
                draggable={!isMobile}
                title={p.label}
                onDragStart={(e) => {
                  e.dataTransfer.setData(PHOTO_MIME, p.id);
                  e.dataTransfer.effectAllowed = "copy";
                }}
                onClick={() => onPick(p.id)}
              >
                {p.url ? <img src={p.url} alt={p.label} draggable={false} loading="lazy" /> : <span className="tke-ph-missing">{p.label}</span>}
                {n ? <span className="tke-ph-used">{n > 1 ? "×" + n : <Check size={11} strokeWidth={3} />}</span> : <span className="tke-ph-new">New</span>}
              </button>
            );
          })}
          {list.length === 0 ? (
            <p className="tke-empty" style={{ gridColumn: "1/-1" }}>
              Every photo is in the book.
            </p>
          ) : null}
        </div>
      </Section>
      <p className="tke-hint" style={{ padding: "0 20px" }}>
        {selecting
          ? "The selected photo will be replaced."
          : isMobile
            ? "Tap a photo to add it to the page you're on."
            : "Drag onto a photo to replace it, or click to add it to the current page."}
      </p>
    </div>
  );
}

/* ── Style ─────────────────────────────────────────────────────── */

const COLOR_QUICK = ["#FAF7EE", "#FFFFFF", "#F9EEEF", "#E4E8DC", "#DCE4EB", "#23262B"];
const COLOR_GROUPS = [
  { name: "Paper", colors: ["#FFFFFF", "#FBFAF7", "#FAF7EE", "#F7F1E3", "#F1ECE1", "#EDE4D5", "#E3D6C0", "#D9C3A0"] },
  { name: "Warm tints", colors: ["#FBF1EF", "#F9EEEF", "#F2DFE0", "#EFD3D3", "#F3DCCB", "#F6E7C8", "#F5D547", "#E9C9A8"] },
  { name: "Cool tints", colors: ["#F1F5F8", "#DCE4EB", "#CBD8E6", "#E6E1EE", "#E4E8DC", "#D9E1D3", "#C9D6C3", "#B9CBC4"] },
  { name: "Deep", colors: ["#1D46A0", "#163880", "#4F5A65", "#2B2F33", "#23262B", "#3B4A3A", "#5A2E3A", "#4A3420"] },
];
const same = (a: string | null, b: string | null) => Boolean(a && b && a.toUpperCase() === b.toUpperCase());

function LookCard({ theme, on, photo, onClick }: { theme: BookTheme; on: boolean; photo: BuilderPhoto | undefined; onClick: () => void }) {
  const d = lookDefaults(theme.id);
  const font = FONTS.find((f) => f.id === d.font)!;
  return (
    <button className={"tke-look" + (on ? " on" : "")} onClick={onClick} aria-pressed={on}>
      <span className="tke-look-spread">
        <span style={{ background: theme.page, color: theme.ink, fontFamily: font.display, fontWeight: font.weight }}>
          Aa
          <i style={{ background: theme.accent }} />
        </span>
        <span style={{ background: theme.page }}>
          <em
            style={{
              background: photo?.url ? `url("${photo.url}") center/cover` : theme.stripeB,
              borderRadius: d.edge === "soft" ? 3 : 0,
              boxShadow: d.edge === "border" ? "0 0 0 1.5px #fff" : "none",
            }}
          />
        </span>
      </span>
      <span className="tke-look-n">{theme.name}</span>
    </button>
  );
}

function ColorGrid({ value, recent, onPick, onBack }: { value: string; recent: string[]; onPick: (c: string) => void; onBack: () => void }) {
  const [hex, setHex] = useState(value);
  useEffect(() => setHex(value), [value]);
  const ok = /^#[0-9a-fA-F]{6}$/.test(hex);
  return (
    <div className="tke-colorview">
      <button className="tke-back" onClick={onBack}>
        <ChevronLeft size={16} /> Page colour
      </button>
      {recent.length ? (
        <div className="tke-cg">
          <div className="tke-cg-n">Recently used</div>
          <div className="tke-cg-row">
            {recent.map((c) => (
              <Swatch key={c} c={c} on={same(c, value)} onClick={() => onPick(c)} />
            ))}
          </div>
        </div>
      ) : null}
      {COLOR_GROUPS.map((g) => (
        <div key={g.name} className="tke-cg">
          <div className="tke-cg-n">{g.name}</div>
          <div className="tke-cg-row">
            {g.colors.map((c) => (
              <Swatch key={c} c={c} on={same(c, value)} onClick={() => onPick(c)} />
            ))}
          </div>
        </div>
      ))}
      <div className="tke-cg">
        <div className="tke-cg-n">Your own</div>
        <div className="tke-hexrow">
          <label className="tke-native" style={{ background: ok ? hex : value }}>
            <input
              type="color"
              value={ok ? hex : value}
              onChange={(e) => {
                setHex(e.target.value.toUpperCase());
                onPick(e.target.value.toUpperCase());
              }}
              aria-label="Pick any colour"
            />
          </label>
          <input
            className="tke-input"
            value={hex}
            onChange={(e) => setHex(e.target.value.trim())}
            onKeyDown={(e) => e.key === "Enter" && ok && onPick(hex.toUpperCase())}
            spellCheck={false}
            aria-label="Hex colour"
          />
          <button className="tke-btn sm" disabled={!ok} onClick={() => onPick(hex.toUpperCase())}>
            Apply
          </button>
        </div>
      </div>
      <p className="tke-hint">Text switches between dark and light ink automatically, so captions stay readable on any colour.</p>
    </div>
  );
}

export function StylePanel({
  book,
  photos,
  spreadBg,
  onLook,
  onColour,
  onFont,
  onEdge,
}: {
  book: BookSlice;
  photos: BuilderPhoto[];
  /** the current spread's own colour override, if any */
  spreadBg: string | null;
  onLook: (themeId: string) => void;
  onColour: (colour: string | null, scope: "book" | "spread") => void;
  onFont: (f: FontId) => void;
  onEdge: (e: EdgeId) => void;
}) {
  const [view, setView] = useState<"main" | "colors">("main");
  const [allLooks, setAllLooks] = useState(false);
  const [scope, setScope] = useState<"book" | "spread">("book");
  const theme = themeById(book.themeId);
  const d = lookDefaults(book.themeId);
  const bookHex = resolvePageHex(book.pageColor) ?? theme.page;
  const current = scope === "spread" ? resolvePageHex(spreadBg) ?? bookHex : bookHex;
  const customized = book.pageColor !== THEME_COLOUR || book.fontId !== d.font || book.edge !== d.edge;
  // one row: six swatches, the current colour always among them
  const quick = COLOR_QUICK.slice(0, 6).some((c) => same(c, current)) ? COLOR_QUICK.slice(0, 6) : [current, ...COLOR_QUICK.slice(0, 5)];
  const pick = (c: string) => onColour(c, scope);
  if (view === "colors") return <ColorGrid value={current} recent={book.recentColors} onPick={pick} onBack={() => setView("main")} />;
  const looks = LOOK_ORDER.map((id) => BOOK_THEMES.find((t) => t.id === id)!).filter(Boolean);
  const shown = allLooks ? looks : looks.slice(0, 4);
  const sample = photos.filter((p) => p.url);
  return (
    <div>
      <Section label="Look" right={customized ? <button className="tke-link" onClick={() => onLook(book.themeId)}>Reset</button> : null}>
        <div className="tke-looks">
          {shown.map((t, i) => (
            <LookCard key={t.id} theme={t} on={book.themeId === t.id && !customized} photo={sample[i % Math.max(1, sample.length)]} onClick={() => onLook(t.id)} />
          ))}
        </div>
        <button className="tke-more" onClick={() => setAllLooks(!allLooks)}>
          {allLooks ? "Fewer looks" : `${looks.length - 4} more looks`}
          {allLooks ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </Section>
      <Section
        label="Page colour"
        right={
          <Seg
            small
            options={[
              { v: "book" as const, label: "Whole book" },
              { v: "spread" as const, label: "This spread" },
            ]}
            value={scope}
            onChange={setScope}
          />
        }
        hint={
          scope === "spread" && spreadBg ? (
            <span>
              This spread has its own colour.{" "}
              <button className="tke-link inline" onClick={() => onColour(null, "spread")}>
                Match the book
              </button>
            </span>
          ) : scope === "book" && book.pageColor !== THEME_COLOUR ? (
            <span>
              <button className="tke-link inline" onClick={() => onColour(null, "book")}>
                Back to {theme.name}'s colour
              </button>
            </span>
          ) : null
        }
      >
        <div className="tke-swrow">
          {quick.map((c) => (
            <Swatch key={c} c={c} on={same(c, current)} onClick={() => pick(c)} />
          ))}
          <button className="tke-sw tke-sw-more" onClick={() => setView("colors")} aria-label="More colours" title="More colours">
            <span>
              <Plus size={15} />
            </span>
          </button>
        </div>
      </Section>
      <Section label="Type">
        <div className="tke-fonts">
          {FONTS.map((f) => (
            <button key={f.id} className={book.fontId === f.id ? "on" : ""} onClick={() => onFont(f.id)} aria-pressed={book.fontId === f.id}>
              <span style={{ fontFamily: f.display, fontWeight: f.weight, fontSize: f.id === "script" ? 30 : f.id === "editorial" ? 28 : 24 } as CSSProperties}>Aa</span>
              <small>{f.name}</small>
            </button>
          ))}
        </div>
      </Section>
      <Section label="Photo edges">
        <Seg
          options={[
            { v: "clean" as const, label: "Clean", icon: <Square size={15} /> },
            { v: "soft" as const, label: "Rounded", icon: <SquareDashed size={15} /> },
            { v: "border" as const, label: "Bordered", icon: <Frame size={15} /> },
          ]}
          value={book.edge}
          onChange={onEdge}
        />
      </Section>
    </div>
  );
}

/* ── Text ──────────────────────────────────────────────────────── */

export function TextPanel({
  book,
  subtitleDefault,
  activePage,
  onTitle,
  onSubtitle,
  onCaption,
  onCaptions,
}: {
  book: BookSlice;
  subtitleDefault: string;
  activePage: BookPage | null;
  onTitle: (v: string) => void;
  onSubtitle: (v: string) => void;
  onCaption: (pageId: string, v: string) => void;
  onCaptions: (hidden: boolean) => void;
}) {
  const capable = activePage && activePage.layout !== "title" && activePage.layout !== "collage";
  return (
    <div>
      <Section label="Cover & title page">
        <label className="tke-field">
          <span>Title</span>
          <input className="tke-input" value={book.title} maxLength={48} onChange={(e) => onTitle(e.target.value)} />
        </label>
        <label className="tke-field">
          <span>Line underneath</span>
          <input className="tke-input" value={book.subtitle ?? subtitleDefault} maxLength={60} onChange={(e) => onSubtitle(e.target.value)} />
        </label>
      </Section>
      <Section label="Caption for this page" hint="Tip: you can also tap a caption right on the page.">
        {capable ? (
          <textarea
            className="tke-input"
            rows={2}
            maxLength={280}
            placeholder="A few words…"
            value={activePage!.caption}
            onChange={(e) => onCaption(activePage!.id, e.target.value)}
          />
        ) : (
          <p className="tke-empty">
            {activePage?.layout === "title"
              ? "Pick a photo page to caption it."
              : "Collage pages let the photos speak. Switch to another layout to add words."}
          </p>
        )}
      </Section>
      <Section label="Captions in the book">
        <Seg
          options={[
            { v: false, label: "Show" },
            { v: true, label: "Hide all" },
          ]}
          value={book.captionsHidden}
          onChange={onCaptions}
        />
      </Section>
    </div>
  );
}
