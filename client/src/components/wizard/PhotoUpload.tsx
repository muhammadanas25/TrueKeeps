import { useCallback, useRef } from "react";
import { Upload, X, AlertTriangle, CheckCircle2, Loader2, ImageOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WizardState, UploadedPhotoLocal } from "@/lib/wizard-types";
import { apiRequest } from "@/lib/queryClient";

interface Props {
  state: WizardState;
  onPhotosChange: (photos: UploadedPhotoLocal[]) => void;
  onProjectCreated: (id: string) => void;
}

function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.src = URL.createObjectURL(file);
  });
}

function getWarning(w: number, h: number): UploadedPhotoLocal["warning"] | undefined {
  const min = Math.min(w, h);
  if (min < 640)  return "very_low_res";
  if (min < 1200) return "low_res";
  return undefined;
}

export function PhotoUpload({ state, onPhotosChange, onProjectCreated }: Props) {
  const inputRef   = useRef<HTMLInputElement>(null);
  const dragRef    = useRef(false);
  const photos     = state.photos;
  const pageCount  = state.bookSettings.pageCount;
  const uploadedOk = photos.filter(p => p.status === "done").length;
  const ratio      = pageCount > 0 ? (uploadedOk / pageCount).toFixed(1) : "0";

  const processFiles = useCallback(async (files: File[]) => {
    const imageFiles = files.filter(f => f.type.startsWith("image/"));
    if (!imageFiles.length) return;

    // Build local photo objects first (for instant UI)
    const newPhotos: UploadedPhotoLocal[] = await Promise.all(
      imageFiles.map(async file => {
        const dataUrl = await new Promise<string>(res => {
          const reader = new FileReader();
          reader.onload = () => res(reader.result as string);
          reader.readAsDataURL(file);
        });
        const { width, height } = await getImageDimensions(file);
        return {
          id: `local-${Date.now()}-${Math.random()}`,
          file,
          dataUrl,
          filename: file.name,
          width,
          height,
          status: "pending" as const,
          progress: 0,
          warning: getWarning(width, height),
        };
      })
    );

    onPhotosChange([...photos, ...newPhotos]);

    // Ensure project exists
    let projectId = state.projectId;
    if (!projectId) {
      try {
        const res  = await apiRequest("POST", "/api/projects", {
          name:    state.bookSettings.name || "My Photo Book",
          themeId: state.themeId || undefined,
        });
        const proj = await res.json();
        projectId  = proj.id;
        onProjectCreated(proj.id);
      } catch {
        // continue — will retry later
      }
    }

    // Upload each photo — keep a mutable working copy so we can update and push
    let working = [...photos, ...newPhotos];

    const updatePhoto = (id: string, patch: Partial<UploadedPhotoLocal>) => {
      working = working.map(p => p.id === id ? { ...p, ...patch } : p);
      onPhotosChange([...working]);
    };

    for (const photo of newPhotos) {
      updatePhoto(photo.id, { status: "uploading", progress: 10 });

      try {
        const body: Record<string, string | null> = {
          url:              photo.dataUrl,
          originalFilename: photo.filename,
          projectId:        projectId ?? null,
        };
        const res    = await apiRequest("POST", "/api/uploads", body);
        const server = await res.json();
        updatePhoto(photo.id, { status: "done", progress: 100, serverId: server.id, serverUrl: server.url });
      } catch {
        updatePhoto(photo.id, { status: "error", progress: 0 });
      }
    }
  }, [photos, state, onPhotosChange, onProjectCreated]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragRef.current = false;
    processFiles(Array.from(e.dataTransfer.files));
  }, [processFiles]);

  const handleRemove = (id: string) => {
    onPhotosChange(photos.filter(p => p.id !== id));
  };

  const hasWarning    = photos.some(p => p.warning);
  const hasVeryLow    = photos.some(p => p.warning === "very_low_res");
  const uploading     = photos.some(p => p.status === "uploading");

  return (
    <div className="max-w-2xl mx-auto w-full space-y-6">
      <div className="text-center">
        <h2 className="text-3xl font-bold mb-2" style={{ fontFamily: "var(--font-display)", color: "#3C3C3B" }}>
          Upload Your Photos
        </h2>
        <p className="text-sm" style={{ color: "#6b6b69" }}>
          JPG, PNG or HEIC — we accept it all.
        </p>
      </div>

      {/* Drop zone */}
      <div
        className="upload-zone rounded-3xl p-12 text-center cursor-pointer transition-all"
        onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add("active"); }}
        onDragLeave={e => e.currentTarget.classList.remove("active")}
        onDrop={e => { e.currentTarget.classList.remove("active"); handleDrop(e); }}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="w-10 h-10 mx-auto mb-3" style={{ color: "#1D4BA6" }} />
        <p className="text-base font-semibold mb-1" style={{ color: "#3C3C3B" }}>
          Drop photos here or <span style={{ color: "#1D4BA6" }}>browse files</span>
        </p>
        <p className="text-xs" style={{ color: "#9b9b97" }}>Accepts JPG, PNG, HEIC · Max 15 MB per file</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={e => processFiles(Array.from(e.target.files ?? []))}
        />
      </div>

      {/* Summary bar */}
      {photos.length > 0 && (
        <div
          className="flex items-center justify-between rounded-2xl px-5 py-3 text-sm"
          style={{ background: "rgba(29,75,166,0.06)", border: "1px solid rgba(29,75,166,0.12)" }}
        >
          <span style={{ color: "#3C3C3B" }}>
            <strong>{uploadedOk}</strong> of <strong>{photos.length}</strong> uploaded
            &nbsp;·&nbsp;
            <strong>{pageCount}</strong> pages
          </span>
          <span
            className="font-medium"
            style={{ color: Number(ratio) >= 1 ? "#1D4BA6" : "#D85365" }}
          >
            {ratio} photos / page
          </span>
        </div>
      )}

      {/* Warnings */}
      {hasVeryLow && (
        <div
          className="flex items-start gap-3 rounded-2xl px-5 py-3 text-sm"
          style={{ background: "rgba(216,83,101,0.07)", border: "1px solid rgba(216,83,101,0.2)" }}
        >
          <ImageOff className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#D85365" }} />
          <p style={{ color: "#D85365" }}>
            <strong>Some photos may appear pixelated in print</strong> (under 640 px). Consider replacing them.
          </p>
        </div>
      )}
      {!hasVeryLow && hasWarning && (
        <div
          className="flex items-start gap-3 rounded-2xl px-5 py-3 text-sm"
          style={{ background: "rgba(216,83,101,0.05)", border: "1px solid rgba(216,83,101,0.15)" }}
        >
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#D85365" }} />
          <p style={{ color: "#D85365" }}>
            A few photos have lower resolution — they'll still look fine but may not be razor-sharp.
          </p>
        </div>
      )}
      {photos.length > 0 && photos.length < pageCount / 2 && (
        <div
          className="flex items-start gap-3 rounded-2xl px-5 py-3 text-sm"
          style={{ background: "rgba(29,75,166,0.05)", border: "1px solid rgba(29,75,166,0.15)" }}
        >
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#1D4BA6" }} />
          <p style={{ color: "#1D4BA6" }}>
            You have {photos.length} photos for {pageCount} pages. We recommend at least {Math.ceil(pageCount / 2)} photos.
          </p>
        </div>
      )}

      {/* Photo grid */}
      {photos.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {photos.map(photo => (
            <div key={photo.id} className="relative group rounded-xl overflow-hidden aspect-square bg-muted">
              <img
                src={photo.dataUrl}
                alt={photo.filename}
                className="w-full h-full object-cover"
              />

              {/* Uploading overlay */}
              {photo.status === "uploading" && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <Loader2 className="w-5 h-5 text-white animate-spin" />
                </div>
              )}

              {/* Done tick */}
              {photo.status === "done" && (
                <div className="absolute top-1.5 left-1.5">
                  <CheckCircle2 className="w-4 h-4" style={{ color: "#1D4BA6", filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.4))" }} />
                </div>
              )}

              {/* Warning badge */}
              {photo.warning && (
                <div
                  className="absolute bottom-1 left-1 text-xs px-1.5 py-0.5 rounded-full font-medium"
                  style={{ background: photo.warning === "very_low_res" ? "#D85365" : "#f59e0b", color: "#fff" }}
                >
                  {photo.warning === "very_low_res" ? "Very low res" : "Low res"}
                </div>
              )}

              {/* Remove button */}
              <button
                className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6 rounded-full flex items-center justify-center"
                style={{ background: "rgba(0,0,0,0.6)" }}
                onClick={() => handleRemove(photo.id)}
              >
                <X className="w-3 h-3 text-white" />
              </button>
            </div>
          ))}

          {/* Add more tile */}
          <button
            className="rounded-xl aspect-square flex flex-col items-center justify-center gap-1 border-2 border-dashed transition-colors"
            style={{ borderColor: "#d8d5c5", color: "#9b9b97" }}
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="w-5 h-5" />
            <span className="text-xs">Add more</span>
          </button>
        </div>
      )}
    </div>
  );
}
