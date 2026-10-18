/**
 * EditorV2 — the redesigned "customize" step (from editor_v2/ prototype).
 *
 * Layout
 *   desktop  top bar · tool rail + one drawer · the open spread with big
 *            ‹ › turn buttons · page strip pinned at the bottom.
 *            Everything fits one screen: no page scroll, ever.
 *   phone    top bar · ONE page at a time, as large as the screen allows
 *            (editing a 180px half-spread with a thumb was the old pain)
 *            · page strip · bottom tabs. Panels open as a bottom sheet;
 *            selecting a photo swaps the tabs for its actions.
 *
 * Gestures (see SlotLayer for the photo ones)
 *   swipe the page            next / previous (one finger)
 *   pinch a photo             zoom it — adjusting starts automatically
 *   two fingers on a photo    move it while zooming
 *   press-and-hold in strip   pick a page up and drag it elsewhere
 *   ← →  ⌘Z  ⇧⌘Z  Esc  Del    desktop keyboard
 *
 * State
 *   The book lives in builder state (so autosave, preview, order and the
 *   classic editor all see the same thing). This component only adds
 *   view state (which page, what's selected, which panel) and an undo
 *   history of BookSlice values. Edits go through the pure functions in
 *   book-ops.ts; gestures write live and record ONE undo step each.
 *
 * Rendering reuses PageFace from book.tsx — the same component the 3-D
 * preview, the order screen and the print snapshot use — so what you
 * edit is exactly what prints. Typeface/edges/subtitle/captions reach it
 * through PageLookContext; this editor adds the inline-edit callbacks.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  CloudOff,
  Crop,
  Images,
  LayoutGrid,
  LayoutPanelLeft,
  Loader2,
  MoreHorizontal,
  Palette,
  PanelLeftClose,
  Redo2,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Trash2,
  Type,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { PageFace } from "../book";
import { occasionById, type BookPage, type BuilderPhoto, type CopyVoice, type Placement } from "../data";
import { PageLookContext, usePageLook, type EdgeId, type FontId } from "../looks";
import { bookTheme, deriveTheme } from "../palette";
import { TILT_MAX, clampTilt, effectiveDpi, framedZoom, placedInches, printQuality, slotMaxZoom } from "../print";
import type { BuilderState } from "../state";
import type { SyncStatus } from "../sync";
import { TKMark } from "@/features/landing/primitives";
import { apiRequest } from "@/lib/queryClient";
import { readImageSize, uploadPhotoFile } from "@/lib/uploads";
import { formatPKR, quote } from "@shared/pricing";
import * as ops from "./book-ops";
import { LayoutPanel, PhotosPanel, StylePanel, TextPanel } from "./panels";
import { SlotLayer } from "./SlotLayer";
import { Arrange, Filmstrip, type ThumbCtx } from "./strip";
import "./editor-v2.css";

type Tool = "layout" | "photos" | "style" | "text";
type Sel = { pageId: string; slot: number } | null;

const TOOLS: Array<{ id: Tool; label: string; Icon: typeof Palette }> = [
  { id: "layout", label: "Layout", Icon: LayoutPanelLeft },
  { id: "photos", label: "Photos", Icon: Images },
  { id: "style", label: "Style", Icon: Palette },
  { id: "text", label: "Text", Icon: Type },
];

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function useSize(ref: React.RefObject<HTMLElement>) {
  const [s, setS] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const m = () => setS((p) => (p.w === el.clientWidth && p.h === el.clientHeight ? p : { w: el.clientWidth, h: el.clientHeight }));
    m();
    const ro = new ResizeObserver(m);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return s;
}

export function EditorV2({
  state,
  set,
  copy,
  saveStatus,
  onBack,
  onPreview,
  onOrder,
  onSwitchClassic,
}: {
  state: BuilderState;
  set: (patch: Partial<BuilderState>) => void;
  copy: CopyVoice;
  saveStatus: SyncStatus;
  onBack: () => void;
  onPreview: () => void;
  onOrder: () => void;
  onSwitchClassic: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const spreadRef = useRef<HTMLDivElement>(null);
  const root = useSize(rootRef);
  const stage = useSize(stageRef);
  const isMobile = root.w > 0 && root.w < 760;

  const stateRef = useRef(state);
  stateRef.current = state;
  const pages = state.pages;
  const photos = state.photos;
  const occ = occasionById(state.occasion);
  const theme = bookTheme(state.themeId, state.pageColor);
  const baseLook = usePageLook();

  /* ── view state ─────────────────────────────────────────────── */
  const [cur, setCur] = useState(() => Math.min(1, Math.max(0, pages.length - 1)));
  const [dir, setDir] = useState(0);
  const [sel, setSel] = useState<Sel>(null);
  const [crop, setCrop] = useState(false);
  const [tool, setTool] = useState<Tool | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [arrange, setArrange] = useState(false);
  const [menu, setMenu] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; undoable?: boolean; k: number } | null>(null);
  const toolInit = useRef(false);
  useEffect(() => {
    if (!toolInit.current && root.w) {
      toolInit.current = true;
      setTool(isMobile ? null : "style");
    }
  }, [root.w, isMobile]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, [toast]);
  const say = (msg: string, undoable?: boolean) => setToast({ msg, undoable, k: Date.now() });

  const last = pages.length - 1;
  const idx = clamp(cur, 0, Math.max(0, last));
  const spreadK = Math.floor(idx / 2);
  const shown: Array<{ page: BookPage | null; idx: number }> = isMobile
    ? [{ page: pages[idx] ?? null, idx }]
    : [
        { page: pages[2 * spreadK] ?? null, idx: 2 * spreadK },
        { page: pages[2 * spreadK + 1] ?? null, idx: 2 * spreadK + 1 },
      ];
  const activePage =
    shown.find((s) => s.page && s.page.id === activeId)?.page ??
    shown.find((s) => s.page && s.page.layout !== "title")?.page ??
    shown.find((s) => s.page)?.page ??
    null;

  /* ── undo history over the book slice ───────────────────────── */
  const hist = useRef<{ past: ops.BookSlice[]; future: ops.BookSlice[] }>({ past: [], future: [] });
  const [, bump] = useState(0);
  const slice = () => ops.sliceOf(stateRef.current);
  const commit = useCallback(
    (fn: (b: ops.BookSlice) => ops.BookSlice) => {
      const before = ops.sliceOf(stateRef.current);
      const after = fn(before);
      if (after === before) return;
      hist.current.past.push(before);
      if (hist.current.past.length > 80) hist.current.past.shift();
      hist.current.future = [];
      set(after);
      bump((x) => x + 1);
    },
    [set],
  );
  /** gestures: one undo step at the start, then live writes */
  const snapshot = () => {
    hist.current.past.push(slice());
    hist.current.future = [];
    bump((x) => x + 1);
  };
  const liveSet = (fn: (b: ops.BookSlice) => ops.BookSlice) => set(fn(slice()));
  const undo = () => {
    const h = hist.current;
    const prev = h.past.pop();
    if (!prev) return;
    h.future.push(slice());
    set(prev);
    setSel(null);
    setCrop(false);
    bump((x) => x + 1);
  };
  const redo = () => {
    const h = hist.current;
    const next = h.future.pop();
    if (!next) return;
    h.past.push(slice());
    set(next);
    bump((x) => x + 1);
  };

  /* ── navigation ─────────────────────────────────────────────── */
  const go = (d: number) => {
    const n = isMobile ? clamp(idx + d, 0, last) : clamp(2 * (spreadK + d), 0, last);
    if ((isMobile && n === idx) || (!isMobile && Math.floor(n / 2) === spreadK)) return;
    setDir(d);
    setCur(n);
    setSel(null);
    setCrop(false);
    setActiveId(null);
  };
  const jumpTo = (i: number) => {
    setDir(i >= idx ? 1 : -1);
    setCur(i);
    setSel(null);
    setCrop(false);
    setActiveId(pages[i]?.id ?? null);
  };

  /* ── selection helpers ──────────────────────────────────────── */
  const selPage = sel ? pages.find((p) => p.id === sel.pageId) ?? null : null;
  const selSlot = selPage && sel ? selPage.slots[sel.slot] ?? null : null;
  const selPhoto = selSlot ? photos.find((p) => p.id === selSlot.photoId) : undefined;
  const usage = useMemo(() => ops.photoUsage(pages), [pages]);
  const spreadPageIds = shown.map((s) => s.page?.id).filter(Boolean) as string[];
  const spreadBg = shown.find((s) => s.page?.bg)?.page?.bg ?? null;

  /* ── actions ────────────────────────────────────────────────── */
  const A = {
    tapSlot: (pageId: string, slot: number) => {
      setActiveId(pageId);
      if (sel && sel.pageId === pageId && sel.slot === slot) {
        if (!crop) setCrop(true);
        return;
      }
      setSel({ pageId, slot });
      setCrop(false);
    },
    enterCrop: (pageId: string, slot: number) => {
      setActiveId(pageId);
      setSel({ pageId, slot });
      setCrop(true);
    },
    frame: (pageId: string, slot: number, patch: Partial<Placement>) => liveSet((b) => ops.setFrame(b, pageId, slot, patch)),
    rotate: () => sel && commit((b) => ops.rotateSlot(b, sel.pageId, sel.slot, photos)),
    reset: () => sel && commit((b) => ops.resetFrame(b, sel.pageId, sel.slot)),
    remove: () => {
      if (!sel) return;
      const r = ops.removeSlot(slice(), sel.pageId, sel.slot);
      commit(() => r.book);
      if (r.pageRemoved) say("Page removed", true);
      setSel(null);
      setCrop(false);
    },
    pickPhoto: (photoId: string) => {
      if (sel) {
        commit((b) => ops.replacePhoto(b, sel.pageId, sel.slot, photoId));
        if (isMobile) setTool(null);
        say("Photo swapped", true);
        return;
      }
      if (!activePage || activePage.layout === "title") return say("Go to a photo page first");
      const next = ops.addPhotoToPage(slice(), activePage.id, photoId);
      if (!next) return say("This page is full — select a photo on it to swap instead");
      commit(() => next);
      say("Added to this page", true);
    },
    dropPhoto: (pageId: string, slot: number, photoId: string) => {
      commit((b) => ops.replacePhoto(b, pageId, slot, photoId));
      setSel({ pageId, slot });
      setActiveId(pageId);
    },
    layout: (l: BookPage["layout"]) => {
      if (!activePage) return;
      commit((b) => ops.changeLayout(b, activePage.id, l, photos));
      setSel(null);
      setCrop(false);
    },
    mirror: () => activePage && commit((b) => ({ ...b, pages: b.pages.map((p) => (p.id === activePage.id ? { ...p, mirror: !p.mirror } : p)) })),
    reflow: (d: BuilderState["density"]) => {
      commit((b) => ops.reflow(b, d, photos));
      jumpTo(1);
      say("Re-arranged the whole book", true);
    },
    movePage: (from: number, to: number) => {
      commit((b) => ops.movePage(b, from, to));
      setSel(null);
    },
    deletePage: (i: number) => {
      commit((b) => ops.deletePage(b, i));
      say("Page deleted", true);
    },
    addPage: () => {
      const r = ops.addPage(slice(), isMobile ? idx : 2 * spreadK + 1, photos);
      if (!r) return say("Add some photos first");
      commit(() => r.book);
      jumpTo(r.index);
      say("Page added", true);
    },
    look: (t: string) => commit((b) => ops.applyLook(b, t)),
    colour: (c: string | null, scope: "book" | "spread") => commit((b) => ops.setPageColour(b, c, scope === "spread" ? spreadPageIds : undefined)),
    font: (f: FontId) => commit((b) => ops.setFont(b, f)),
    edge: (e: EdgeId) => commit((b) => ops.setEdge(b, e)),
    title: (v: string) => set({ title: v }),
    subtitle: (v: string) => set({ subtitle: v }),
    caption: (id: string, v: string) => liveSet((b) => ops.setCaption(b, id, v)),
    captions: (hidden: boolean) => commit((b) => ({ ...b, captionsHidden: hidden })),
  };

  /* ── adding photos from the Photos panel ────────────────────── */
  const addFiles = async (files: FileList) => {
    const images = Array.from(files).filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name));
    if (!images.length) return;
    setUploading(true);
    try {
      let projectId = stateRef.current.projectId;
      if (!projectId) {
        const res = await apiRequest("POST", "/api/projects", { name: stateRef.current.title || occ.suggestedTitle, status: "draft" });
        projectId = ((await res.json()) as { id: string }).id;
        set({ projectId });
      }
      const added: BuilderPhoto[] = [];
      let n = stateRef.current.photos.length;
      for (const file of images) {
        try {
          const up = await uploadPhotoFile(file, projectId);
          const size = up.width && up.height ? { w: up.width, h: up.height } : await readImageSize(file);
          added.push({
            id: up.id,
            label: occ.photoLabels[n % occ.photoLabels.length] || file.name.replace(/\.[^.]+$/, ""),
            shade: n % 3,
            url: up.url,
            w: size?.w,
            h: size?.h,
          });
          n++;
        } catch {
          /* one bad file shouldn't stop the rest */
        }
      }
      if (added.length) {
        set({ photos: [...stateRef.current.photos, ...added] });
        say(`${added.length} photo${added.length > 1 ? "s" : ""} added — tap one to place it`);
      } else say("Couldn't upload those photos. Please try again.");
    } catch {
      say("You seem to be offline — try again in a moment.");
    } finally {
      setUploading(false);
    }
  };

  /* ── keyboard ───────────────────────────────────────────────── */
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(t.tagName)) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
        return;
      }
      if (e.key === "Escape") {
        if (menu) setMenu(false);
        else if (crop) setCrop(false);
        else if (sel) setSel(null);
        else if (arrange) setArrange(false);
        return;
      }
      if (arrange) return;
      if (crop && sel && selSlot && e.key.startsWith("Arrow")) {
        e.preventDefault();
        const d = 0.03;
        const dx = e.key === "ArrowLeft" ? -d : e.key === "ArrowRight" ? d : 0;
        const dy = e.key === "ArrowUp" ? -d : e.key === "ArrowDown" ? d : 0;
        A.frame(sel.pageId, sel.slot, { fx: clamp(selSlot.fx - dx, 0, 1), fy: clamp(selSlot.fy - dy, 0, 1) });
        return;
      }
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
      if ((e.key === "Delete" || e.key === "Backspace") && sel) A.remove();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  /* ── swipe on the stage to turn ─────────────────────────────── */
  const swipe = useRef<{ x: number; y: number; id: number } | null>(null);
  const swiped = useRef(false);
  /**
   * Fingers currently on the stage, counted in the CAPTURE phase so the
   * count is right even when a photo stops the event from bubbling. A
   * gesture that ever had two fingers is a pinch, never a page swipe —
   * without this, the first finger of a pinch sliding sideways turned
   * the page out from under the photo being zoomed.
   */
  const fingers = useRef(0);
  const stageDownCapture = () => {
    fingers.current++;
    if (fingers.current > 1) swipe.current = null;
  };
  const stageUpCapture = () => {
    fingers.current = Math.max(0, fingers.current - 1);
  };
  const stageDown = (e: React.PointerEvent) => {
    swiped.current = false;
    if (crop || !e.isPrimary || fingers.current > 1) return;
    swipe.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
  };
  const stageUp = (e: React.PointerEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      swiped.current = true;
      go(dx < 0 ? 1 : -1);
      setTimeout(() => (swiped.current = false), 80);
    }
  };

  /* ── geometry ───────────────────────────────────────────────── */
  const sheetOpen = isMobile && tool !== null && !arrange;
  const pw = isMobile
    ? Math.max(120, Math.floor(Math.min(stage.w - 28, stage.h - (sheetOpen ? 24 : 52))))
    : Math.max(140, Math.floor(Math.min((stage.w - 176) / 2, stage.h - 96)));

  // floating action bar above the selected photo (desktop)
  const [barPos, setBarPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    if (isMobile || !sel || crop) return setBarPos(null);
    const wrap = spreadRef.current;
    const el = wrap?.querySelector<HTMLElement>(".tke-slot.is-sel");
    if (!wrap || !el) return setBarPos(null);
    const w = wrap.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    let top = r.top - w.top - 50;
    if (top < -44) top = r.top - w.top + 10;
    setBarPos({ left: r.left - w.left + r.width / 2, top });
  }, [sel, crop, isMobile, pw, pages, idx]);

  /* ── crop controls ──────────────────────────────────────────── */
  const tilt = clampTilt(selSlot?.tilt);
  const maxZ = selPage && selSlot && sel ? slotMaxZoom(selPhoto, selPage.layout, sel.slot, selSlot.turn, undefined, tilt) : 1;
  const zoomPct = selSlot ? (selSlot.zoom - 1) / Math.max(0.001, maxZ - 1) : 0;
  const quality = (() => {
    if (!selPhoto?.w || !selPhoto.h || !selPage || !selSlot || !sel) return "unknown";
    const dpi = effectiveDpi(
      { w: selPhoto.w, h: selPhoto.h },
      placedInches(selPage.layout, sel.slot, selSlot.turn),
      framedZoom({ zoom: selSlot.zoom, tilt }, selPage.layout, sel.slot),
    );
    return printQuality(dpi);
  })();
  const cropBar = sel && selSlot ? (
    <div className={"tke-cropbar" + (isMobile ? " m" : "")}>
      {isMobile ? <p className="tke-cb-tip">Pinch to zoom · drag to move</p> : null}
      <div className="tke-cb-row">
        <ZoomOut size={16} />
        <input
          type="range"
          min={1}
          max={maxZ}
          step={0.01}
          value={Math.min(maxZ, selSlot.zoom)}
          aria-label="Zoom"
          style={{ "--p": zoomPct * 100 + "%" } as CSSProperties}
          onPointerDown={snapshot}
          onChange={(e) => A.frame(sel.pageId, sel.slot, { zoom: Number(e.target.value) })}
          disabled={maxZ <= 1.001}
        />
        <ZoomIn size={16} />
      </div>
      <div className="tke-cb-row">
        <RotateCcw size={15} />
        <input
          type="range"
          min={-TILT_MAX}
          max={TILT_MAX}
          step={0.5}
          value={tilt}
          aria-label="Straighten"
          className="tilt"
          onPointerDown={snapshot}
          onChange={(e) => {
            const deg = clampTilt(Number(e.target.value));
            const lim = slotMaxZoom(selPhoto, selPage!.layout, sel.slot, selSlot.turn, undefined, deg);
            A.frame(sel.pageId, sel.slot, { tilt: deg, zoom: Math.min(selSlot.zoom, lim) });
          }}
          onDoubleClick={() => A.frame(sel.pageId, sel.slot, { tilt: 0 })}
        />
        <span className="tke-cb-val">
          {tilt > 0 ? "+" : ""}
          {tilt.toFixed(1)}°
        </span>
      </div>
      {quality !== "unknown" ? (
        <span className={"tke-q q-" + quality}>
          <i />
          {quality === "great" ? "Prints sharp" : quality === "good" ? "Good for print" : "May look soft"}
        </span>
      ) : null}
      <button className="tke-btn ghost sm" onClick={A.reset}>
        Reset
      </button>
      <button className="tke-btn sm" onClick={() => setCrop(false)}>
        Done
      </button>
    </div>
  ) : null;

  const actions = [
    { id: "adjust", label: "Adjust", Icon: Crop, on: () => setCrop(true) },
    { id: "swap", label: "Swap", Icon: RefreshCw, on: () => setTool("photos") },
    { id: "rotate", label: "Rotate", Icon: RotateCw, on: A.rotate },
    { id: "remove", label: "Remove", Icon: Trash2, on: A.remove },
  ];

  /* ── panels ─────────────────────────────────────────────────── */
  const spreadTargets = shown
    .filter((s) => s.page && s.page.layout !== "title")
    .map((s, i, arr) => ({ id: s.page!.id, label: (arr.length > 1 ? (i === 0 ? "Left" : "Right") + " · " : "") + "p." + s.idx }));
  const panel =
    tool === "layout" ? (
      <LayoutPanel
        theme={activePage?.bg ? deriveTheme(theme, activePage.bg) : theme}
        activePage={activePage}
        spreadTargets={spreadTargets}
        density={state.density}
        onPickPage={setActiveId}
        onLayout={A.layout}
        onMirror={A.mirror}
        onReflow={A.reflow}
      />
    ) : tool === "photos" ? (
      <PhotosPanel photos={photos} usage={usage} selecting={Boolean(sel)} isMobile={isMobile} uploading={uploading} onPick={A.pickPhoto} onAddFiles={addFiles} />
    ) : tool === "style" ? (
      <StylePanel book={ops.sliceOf(state)} photos={photos} spreadBg={spreadBg} onLook={A.look} onColour={A.colour} onFont={A.font} onEdge={A.edge} />
    ) : tool === "text" ? (
      <TextPanel
        book={ops.sliceOf(state)}
        subtitleDefault={occ.subtitle}
        activePage={activePage}
        onTitle={A.title}
        onSubtitle={A.subtitle}
        onCaption={A.caption}
        onCaptions={A.captions}
      />
    ) : null;
  const toolTitle = tool ? TOOLS.find((t) => t.id === tool)!.label : "";

  /* ── page rendering ─────────────────────────────────────────── */
  const editLook = useMemo(
    () => ({
      ...baseLook,
      onEditTitle: (v: string) => commit((b) => ({ ...b, title: v })),
      onEditSubtitle: (v: string) => commit((b) => ({ ...b, subtitle: v })),
      onEditCaption: (id: string, v: string) => commit((b) => ops.setCaption(b, id, v)),
    }),
    [baseLook, commit],
  );
  const ctx: ThumbCtx = { photos, theme, title: state.title, occasion: occ };

  const renderPage = (entry: { page: BookPage | null; idx: number }, side: string) => {
    const page = entry.page;
    const isActive = !isMobile && page && activePage && page.id === activePage.id && shown.filter((s) => s.page).length > 1;
    return (
      <div
        key={page?.id ?? side}
        className={"tke-pagebox" + (isActive ? " is-active" : "")}
        style={{ width: pw, height: pw, "--pw": pw + "px" } as CSSProperties}
        onClick={() => {
          if (swiped.current || !page) return;
          setActiveId(page.id);
          if (!crop) setSel(null);
        }}
      >
        {page ? (
          <PageFace
            page={page}
            photos={photos}
            theme={theme}
            title={state.title}
            occasion={occ}
            renderSlotOverlay={(slot, photo, placement, aspect) => (
              <SlotLayer
                photo={photo}
                placement={placement}
                layout={page.layout}
                slotIdx={slot}
                aspect={aspect}
                selected={sel?.pageId === page.id && sel.slot === slot}
                cropping={crop && sel?.pageId === page.id && sel.slot === slot}
                ghost
                onTap={() => !swiped.current && A.tapSlot(page.id, slot)}
                onEnterCrop={() => A.enterCrop(page.id, slot)}
                onGestureStart={snapshot}
                onFrame={(patch) => A.frame(page.id, slot, patch)}
                onDropPhoto={isMobile ? undefined : (id) => A.dropPhoto(page.id, slot, id)}
              />
            )}
          />
        ) : (
          <div className="tke-page-blank" style={{ background: theme.page }}>
            <span>{side === "left" ? "Inside cover" : "Back cover"}</span>
          </div>
        )}
      </div>
    );
  };

  const pageLabel = isMobile
    ? idx === 0
      ? `Title page · ${pages.length} pages`
      : `Page ${idx} of ${last}`
    : spreadK === 0
      ? `Title page · Page 1 of ${last}`
      : `Pages ${2 * spreadK}${pages[2 * spreadK + 1] ? "–" + (2 * spreadK + 1) : ""} of ${last}`;

  const q = quote({ binding: state.binding, qty: state.qty });

  return (
    <PageLookContext.Provider value={editLook}>
      <div
        ref={rootRef}
        className={"tke" + (isMobile ? " is-m" : " is-d") + (crop ? " is-cropping" : "")}
        onPointerDown={() => menu && setMenu(false)}
      >
        <header className="tke-top">
          <div className="tke-top-l">
            <button className="tke-iconbtn" onClick={onBack} aria-label="Back to preview">
              <ChevronLeft size={20} />
            </button>
            {!isMobile ? (
              <>
                <span className="tke-logo">
                  <TKMark size={22} />
                  <span>
                    True<em>Keep</em>
                  </span>
                </span>
                <span className="tke-top-div" />
              </>
            ) : null}
            <div className="tke-top-title">
              <b>{state.title || "Untitled book"}</b>
              <small className={saveStatus === "error" ? "err" : ""}>
                {saveStatus === "saving" ? (
                  <>
                    <Loader2 size={12} className="tke-spin" /> Saving
                  </>
                ) : saveStatus === "error" ? (
                  <>
                    <CloudOff size={12} /> Offline — kept on this device
                  </>
                ) : (
                  <>
                    <Check size={12} strokeWidth={2.5} /> Saved
                  </>
                )}
              </small>
            </div>
          </div>
          <div className="tke-top-r">
            <button className="tke-iconbtn" onClick={undo} disabled={!hist.current.past.length} aria-label="Undo" title="Undo (⌘Z)">
              <Undo2 size={18} />
            </button>
            {!isMobile ? (
              <button className="tke-iconbtn" onClick={redo} disabled={!hist.current.future.length} aria-label="Redo" title="Redo (⇧⌘Z)">
                <Redo2 size={18} />
              </button>
            ) : null}
            {!isMobile ? (
              <button className="tke-btn ghost" onClick={onPreview}>
                <BookOpen size={16} /> Preview
              </button>
            ) : null}
            <div className="tke-menu" onPointerDown={(e) => e.stopPropagation()}>
              <button className="tke-iconbtn" onClick={() => setMenu(!menu)} aria-label="More" aria-expanded={menu}>
                <MoreHorizontal size={19} />
              </button>
              {menu ? (
                <div className="tke-menu-pop" role="menu">
                  <button role="menuitem" onClick={onPreview}>
                    <BookOpen size={16} /> Preview the book
                  </button>
                  <button role="menuitem" onClick={() => { setMenu(false); setArrange(true); }}>
                    <LayoutGrid size={16} /> All pages
                  </button>
                  <button role="menuitem" onClick={onSwitchClassic}>
                    <PanelLeftClose size={16} /> Switch to classic editor
                  </button>
                </div>
              ) : null}
            </div>
            <button className="tke-btn" onClick={onOrder}>
              <span>{isMobile ? "Order" : "Order book"}</span>
              <span className="tke-price">{formatPKR(q.totalMinor)}</span>
            </button>
          </div>
        </header>

        <div className="tke-body">
          {!isMobile ? (
            <nav className="tke-rail" aria-label="Tools">
              {TOOLS.map(({ id, label, Icon }) => (
                <button key={id} className={tool === id ? "on" : ""} onClick={() => setTool(tool === id ? null : id)} aria-pressed={tool === id}>
                  <Icon size={20} />
                  <span>{label}</span>
                </button>
              ))}
              <span className="tke-rail-sp" />
              <button onClick={() => setArrange(true)}>
                <LayoutGrid size={20} />
                <span>Pages</span>
              </button>
            </nav>
          ) : null}
          {!isMobile ? (
            <aside className={"tke-drawer" + (tool ? " open" : "")} aria-hidden={!tool}>
              <div className="tke-drawer-in">
                <div className="tke-drawer-h">
                  <h3>{toolTitle}</h3>
                  <button className="tke-iconbtn sm" onClick={() => setTool(null)} aria-label="Close panel">
                    <PanelLeftClose size={17} />
                  </button>
                </div>
                <div className="tke-drawer-c">{panel}</div>
              </div>
            </aside>
          ) : null}

          <main className="tke-main">
            <div
              ref={stageRef}
              className={"tke-stage" + (sheetOpen ? " up" : "")}
              onPointerDownCapture={stageDownCapture}
              onPointerUpCapture={stageUpCapture}
              onPointerCancelCapture={stageUpCapture}
              onPointerDown={stageDown}
              onPointerUp={stageUp}
              onPointerCancel={() => (swipe.current = null)}
              onClick={(e) => {
                if (e.target === e.currentTarget && !swiped.current) {
                  setSel(null);
                  setCrop(false);
                }
              }}
            >
              {!isMobile ? (
                <button className="tke-turn l" onClick={() => go(-1)} disabled={spreadK === 0} aria-label="Previous pages">
                  <ChevronLeft size={22} />
                </button>
              ) : null}
              <div className="tke-spread-wrap" ref={spreadRef} style={{ width: isMobile ? pw : pw * 2 }}>
                <div key={isMobile ? idx : spreadK} className={"tke-spread" + (dir > 0 ? " in-r" : dir < 0 ? " in-l" : "")}>
                  {shown.map((s, i) => renderPage(s, i === 0 && !isMobile ? "left" : "right"))}
                  {!isMobile ? <span className="tke-gutter" /> : null}
                </div>
                {barPos ? (
                  <div className="tke-float" style={barPos} onPointerDown={(e) => e.stopPropagation()}>
                    {actions.map(({ id, label, Icon, on }) => (
                      <button key={id} onClick={on} className={id === "remove" ? "warn" : ""} title={label}>
                        <Icon size={16} />
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              {!isMobile ? (
                <button className="tke-turn r" onClick={() => go(1)} disabled={2 * (spreadK + 1) > last} aria-label="Next pages">
                  <ChevronRight size={22} />
                </button>
              ) : null}
              <div className="tke-meta">
                {isMobile ? (
                  <button className="tke-iconbtn sm" onClick={() => go(-1)} disabled={idx === 0} aria-label="Previous page">
                    <ChevronLeft size={18} />
                  </button>
                ) : null}
                <span>{pageLabel}</span>
                {isMobile ? (
                  <button className="tke-iconbtn sm" onClick={() => go(1)} disabled={idx >= last} aria-label="Next page">
                    <ChevronRight size={18} />
                  </button>
                ) : null}
                {!isMobile && !sel ? <em>Click a photo to adjust, swap or rotate · ← → to turn</em> : null}
              </div>
              {!isMobile && crop ? cropBar : null}
            </div>
            <Filmstrip
              pages={pages}
              ctx={ctx}
              activeIdx={idx}
              isMobile={isMobile}
              onJump={jumpTo}
              onMove={A.movePage}
              onAdd={A.addPage}
              onArrange={() => setArrange(true)}
            />
          </main>
        </div>

        {isMobile ? (
          <div className="tke-mbar">
            {crop && selSlot ? (
              cropBar
            ) : sel ? (
              <div className="tke-actions">
                {actions.map(({ id, label, Icon, on }) => (
                  <button key={id} onClick={on} className={id === "remove" ? "warn" : ""}>
                    <Icon size={20} />
                    <span>{label}</span>
                  </button>
                ))}
                <button onClick={() => { setSel(null); setTool(null); }}>
                  <X size={20} />
                  <span>Close</span>
                </button>
              </div>
            ) : (
              <nav className="tke-tabs">
                {TOOLS.map(({ id, label, Icon }) => (
                  <button key={id} className={tool === id ? "on" : ""} onClick={() => setTool(tool === id ? null : id)}>
                    <Icon size={20} />
                    <span>{label}</span>
                  </button>
                ))}
                <button onClick={() => { setTool(null); setArrange(true); }}>
                  <LayoutGrid size={20} />
                  <span>Pages</span>
                </button>
              </nav>
            )}
          </div>
        ) : null}

        {sheetOpen ? (
          <>
            <div className="tke-scrim" onClick={() => setTool(null)} />
            <div className="tke-sheet" role="dialog" aria-label={toolTitle}>
              <div className="tke-sheet-grab" />
              <div className="tke-drawer-h">
                <h3>{toolTitle}</h3>
                <button className="tke-iconbtn sm" onClick={() => setTool(null)} aria-label="Close">
                  <X size={18} />
                </button>
              </div>
              <div className="tke-sheet-c">{panel}</div>
            </div>
          </>
        ) : null}

        {arrange ? (
          <Arrange
            pages={pages}
            ctx={ctx}
            activeIdx={idx}
            isMobile={isMobile}
            onMove={A.movePage}
            onDelete={A.deletePage}
            onAdd={A.addPage}
            onJump={jumpTo}
            onClose={() => setArrange(false)}
          />
        ) : null}
        {toast ? (
          <div key={toast.k} className="tke-toast" role="status">
            {toast.msg}
            {toast.undoable ? (
              <button onClick={() => { undo(); setToast(null); }}>
                Undo
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </PageLookContext.Provider>
  );
}
