/**
 * RevertSheets — the two questions about edits (owner, 2026-11-28; canvas
 * "Truekeeps: Undo edits and step 5 on phones", boards B2 and B3).
 *
 *  - RevertConfirm   "Go back to the original album?" Asked before the pages
 *                    are laid out again (editor menu, step 6 note).
 *  - LeaveEditorSheet "Keep the changes you made?" Asked when someone leaves
 *                    the editor after changing something since they opened it.
 *
 * Both appear ONLY after an edit; the normal flow never sees them (owner:
 * "this should come only after we edit, not in the original flow").
 *
 * Layout: a bottom sheet on a phone, a centred dialog on a wide screen (one
 * stylesheet, revert.css, scoped `rv-`). Escape and a tap on the veil count
 * as the safe answer: keep things as they are.
 */

import { useEffect, useRef, type ReactNode } from "react";
import { Check, RotateCcw } from "lucide-react";
import "./revert.css";

function Sheet({ labelId, onDismiss, children }: { labelId: string; onDismiss: () => void; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onDismiss();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);
  return (
    <div className="rv-veil" onClick={onDismiss}>
      <div ref={box} className="rv-sheet" role="dialog" aria-modal="true" aria-labelledby={labelId} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <span className="rv-grip" aria-hidden="true" />
        {children}
      </div>
    </div>
  );
}

/** B2: confirm going back to the original pages. */
export function RevertConfirm({ onConfirm, onCancel, canUndo }: { onConfirm: () => void; onCancel: () => void; canUndo: boolean }) {
  return (
    <Sheet labelId="rv-confirm" onDismiss={onCancel}>
      <span className="rv-icon" aria-hidden="true">
        <RotateCcw size={22} />
      </span>
      <h2 id="rv-confirm">Go back to the original album?</h2>
      <p>Your album goes back to exactly how it was before you opened the editor: its pages, photos, cover and title.</p>
      {canUndo ? (
        <div className="rv-keep">
          <span>
            <Check size={16} strokeWidth={2.6} aria-hidden="true" /> Changed your mind? Tap undo straight after.
          </span>
        </div>
      ) : null}
      <div className="rv-actions">
        <button type="button" className="bb-btn bb-btn-primary bb-btn-lg rv-btn rv-indigo" onClick={onConfirm}>
          Go back to the original
        </button>
        <button type="button" className="bb-btn bb-btn-secondary bb-btn-lg rv-btn" onClick={onCancel}>
          Keep my changes
        </button>
      </div>
    </Sheet>
  );
}

/** B3: leaving the editor after changes. `pagesChanged` 0 = only the look or words changed. */
export function LeaveEditorSheet({
  pagesChanged,
  onKeep,
  onDiscard,
  onStay,
}: {
  pagesChanged: number;
  onKeep: () => void;
  onDiscard: () => void;
  onStay: () => void;
}) {
  const what =
    pagesChanged === 0
      ? "You made changes since you opened the editor."
      : `You changed ${pagesChanged === 1 ? "1 page" : `${pagesChanged} pages`} since you opened the editor.`;
  return (
    <Sheet labelId="rv-leave" onDismiss={onStay}>
      <h2 id="rv-leave">Keep the changes you made?</h2>
      <p>{what}</p>
      <div className="rv-actions">
        <button type="button" className="bb-btn bb-btn-primary bb-btn-lg rv-btn" onClick={onKeep}>
          Keep my changes
        </button>
        <button type="button" className="bb-btn bb-btn-secondary bb-btn-lg rv-btn" onClick={onDiscard}>
          Undo these changes
        </button>
        <button type="button" className="rv-link" onClick={onStay}>
          Keep editing
        </button>
      </div>
    </Sheet>
  );
}
