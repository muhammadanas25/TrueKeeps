import { useRef } from "react";
import { Upload, ChevronLeft, ChevronRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { WizardState, CoverStyle as CoverStyleType } from "@/lib/wizard-types";
import type { Theme } from "@shared/schema";
import { cn } from "@/lib/utils";

interface Props {
  state: WizardState;
  onChange: (updates: Partial<Pick<WizardState, "coverStyle" | "frontCoverPhotoIndex" | "backCoverPhotoIndex" | "bookTitle" | "themeId" | "themeName" | "themeImageUrl">>) => void;
  onContinue: () => void;
  onPrintNow: () => void;
}

const COVER_STYLES: { key: CoverStyleType; label: string; description: string }[] = [
  { key: "full_bleed",  label: "Full Bleed",  description: "Photo fills cover edge-to-edge" },
  { key: "framed",      label: "Framed",      description: "Photo with border + title" },
  { key: "minimal",     label: "Minimal",     description: "Title only, colour background" },
  { key: "split",       label: "Split",       description: "Half photo, half colour" },
];

function CoverPreview({
  style,
  photoUrl,
  title,
  themeColor,
  side,
}: {
  style: CoverStyleType;
  photoUrl?: string;
  title: string;
  themeColor: string;
  side: "front" | "back";
}) {
  const hasPhoto = !!photoUrl;

  const base = (
    <div
      className="w-full h-full rounded-lg overflow-hidden relative"
      style={{ background: themeColor }}
    >
      {style === "full_bleed" && hasPhoto && (
        <img src={photoUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
      )}
      {style === "framed" && (
        <>
          {hasPhoto && (
            <img src={photoUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
          )}
          <div
            className="absolute inset-3 rounded border-4 border-white/80 flex items-end justify-center pb-4"
          />
          <div className="absolute bottom-5 left-0 right-0 text-center">
            <span className="text-white text-xs font-bold drop-shadow">{title || "Your Title"}</span>
          </div>
        </>
      )}
      {style === "minimal" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
          <p className="text-white font-bold text-sm text-center" style={{ fontFamily: "var(--font-display)" }}>
            {title || "Your Title"}
          </p>
        </div>
      )}
      {style === "split" && (
        <>
          {hasPhoto && (
            <div className="absolute inset-0 w-1/2">
              <img src={photoUrl} alt="" className="w-full h-full object-cover" />
            </div>
          )}
          <div className="absolute inset-0 left-1/2 flex items-center justify-center px-2">
            <p className="text-white font-bold text-xs text-center" style={{ fontFamily: "var(--font-display)" }}>
              {title || "Your Title"}
            </p>
          </div>
        </>
      )}
      {/* Side label */}
      <div
        className="absolute top-2 left-2 text-xs font-semibold px-2 py-0.5 rounded-full"
        style={{ background: "rgba(0,0,0,0.45)", color: "#fff" }}
      >
        {side === "front" ? "Front" : "Back"}
      </div>
    </div>
  );
  return base;
}

export function CoverStyle({ state, onChange, onContinue, onPrintNow }: Props) {
  const frontInputRef = useRef<HTMLInputElement>(null);
  const backInputRef  = useRef<HTMLInputElement>(null);
  const photos        = state.photos;

  const { data: themes = [] } = useQuery<Theme[]>({
    queryKey: ["/api/themes"],
    queryFn: async () => { const r = await fetch("/api/themes"); return r.json(); },
  });

  const themeColor = "#1D4BA6";
  const frontPhoto = photos[state.frontCoverPhotoIndex]?.dataUrl;
  const backPhoto  = state.backCoverPhotoIndex >= 0 ? photos[state.backCoverPhotoIndex]?.dataUrl : undefined;

  const loadCoverFromFile = (file: File, side: "front" | "back") => {
    const reader = new FileReader();
    reader.onload = () => {
      // Find or create a new photo entry
      const dataUrl = reader.result as string;
      const existing = photos.findIndex(p => p.dataUrl === dataUrl);
      const idx = existing >= 0 ? existing : photos.length;
      if (existing < 0) {
        // We won't re-upload; just store locally for preview
      }
      if (side === "front") onChange({ frontCoverPhotoIndex: idx });
      else onChange({ backCoverPhotoIndex: idx });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="max-w-4xl mx-auto w-full">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold mb-2" style={{ fontFamily: "var(--font-display)", color: "#3C3C3B" }}>
          Choose Your Cover Style
        </h2>
        <p className="text-sm" style={{ color: "#6b6b69" }}>
          Pick a style for your front and back cover.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-8">

        {/* ── Left: style selector ── */}
        <div className="space-y-2">
          {COVER_STYLES.map(cs => (
            <button
              key={cs.key}
              type="button"
              onClick={() => onChange({ coverStyle: cs.key })}
              className="w-full text-left rounded-xl px-4 py-3 border transition-all"
              style={
                state.coverStyle === cs.key
                  ? { borderColor: "#1D4BA6", background: "rgba(29,75,166,0.07)", color: "#1D4BA6" }
                  : { borderColor: "#e5e5e0", background: "#fff", color: "#3C3C3B" }
              }
            >
              <p className="text-sm font-semibold">{cs.label}</p>
              <p className="text-xs mt-0.5" style={{ color: "#9b9b97" }}>{cs.description}</p>
            </button>
          ))}
        </div>

        {/* ── Right: book preview ── */}
        <div className="space-y-5">
          {/* Book title input */}
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: "#3C3C3B" }}>
              Book Title
            </label>
            <input
              className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2"
              style={{ borderColor: "#d8d5c5", background: "#fff" }}
              placeholder="e.g. Summer in Santorini"
              value={state.bookTitle}
              onChange={e => onChange({ bookTitle: e.target.value })}
            />
          </div>

          {/* Front + Back preview */}
          <div className="flex gap-4">
            <div className="flex-1 space-y-2">
              <div
                className="relative rounded-xl overflow-hidden cursor-pointer group"
                style={{ aspectRatio: "3/4", background: "#f4f2e8" }}
                onClick={() => frontInputRef.current?.click()}
              >
                <CoverPreview
                  style={state.coverStyle}
                  photoUrl={frontPhoto}
                  title={state.bookTitle}
                  themeColor={themeColor}
                  side="front"
                />
                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Upload className="w-7 h-7 text-white" />
                </div>
              </div>
              <p className="text-xs text-center font-medium" style={{ color: "#6b6b69" }}>Front Cover</p>
              <input
                ref={frontInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => e.target.files?.[0] && loadCoverFromFile(e.target.files[0], "front")}
              />
            </div>

            <div className="w-1/3 space-y-2">
              <div
                className="relative rounded-xl overflow-hidden cursor-pointer group"
                style={{ aspectRatio: "3/4", background: "#f4f2e8" }}
                onClick={() => backInputRef.current?.click()}
              >
                <CoverPreview
                  style={state.coverStyle}
                  photoUrl={backPhoto}
                  title=""
                  themeColor={themeColor}
                  side="back"
                />
                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Upload className="w-5 h-5 text-white" />
                </div>
              </div>
              <p className="text-xs text-center font-medium" style={{ color: "#6b6b69" }}>Back Cover</p>
              <input
                ref={backInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => e.target.files?.[0] && loadCoverFromFile(e.target.files[0], "back")}
              />
            </div>
          </div>

          {/* Upload hint */}
          <p className="text-xs text-center" style={{ color: "#9b9b97" }}>
            Click either cover to upload a custom photo — or we'll use your first uploaded photo.
          </p>

          {/* Cover photo picker — use uploaded photos */}
          {photos.length > 0 && (
            <div>
              <p className="text-xs font-semibold mb-2" style={{ color: "#3C3C3B" }}>
                Pick from your uploaded photos
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {photos.slice(0, 10).map((p, i) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onChange({ frontCoverPhotoIndex: i })}
                    className="shrink-0 rounded-lg overflow-hidden transition-all"
                    style={{
                      width: 56, height: 56,
                      border: state.frontCoverPhotoIndex === i ? "2.5px solid #1D4BA6" : "2px solid #e5e5e0",
                    }}
                  >
                    <img src={p.dataUrl} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Theme carousel */}
      {themes.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold" style={{ color: "#3C3C3B" }}>Select Your Theme</p>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {themes.slice(0, 8).map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => onChange({ themeId: t.id, themeName: t.name, themeImageUrl: t.imageUrl ?? "" })}
                className="shrink-0 rounded-xl overflow-hidden transition-all"
                style={{
                  width: 80,
                  border: state.themeId === t.id ? "2.5px solid #1D4BA6" : "2px solid #e5e5e0",
                }}
              >
                <div className="aspect-[3/4]">
                  <img src={t.imageUrl ?? ""} alt={t.name} className="w-full h-full object-cover" />
                </div>
                <p
                  className="text-xs px-1 py-1 text-center truncate"
                  style={{ color: state.themeId === t.id ? "#1D4BA6" : "#6b6b69", fontWeight: 500 }}
                >
                  {t.name}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
