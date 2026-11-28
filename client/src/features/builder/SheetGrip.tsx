/**
 * SheetGrip — the handle on the phone sheets of steps 5 and 6, now a real
 * control (owner, 2026-11-28, canvas board A1): tap it, or drag it, to tuck
 * the choices down so the book fills the screen, and to bring them back.
 *
 * Why only the handle listens to drags: the sheet itself scrolls when its
 * content is tall, and a swipe meant for that scroll must never tuck it.
 * `touch-action: none` on the handle alone keeps the browser from turning
 * the drag into a scroll (which would cancel the pointer).
 *
 * A drag of 24px or more decides the direction (up opens, down tucks); a tap
 * toggles. The click that follows a drag is ignored so it can't undo it.
 */

import { useRef } from "react";

const DRAG = 24;

export function SheetGrip({ tucked, onTuck, onOpen }: { tucked: boolean; onTuck: () => void; onOpen: () => void }) {
  const y0 = useRef<number | null>(null);
  const dragged = useRef(false);
  return (
    <button
      type="button"
      className="bk-grip-btn"
      aria-label={tucked ? "Show the choices" : "Make the book bigger"}
      aria-expanded={!tucked}
      onPointerDown={(e) => {
        y0.current = e.clientY;
        dragged.current = false;
        e.currentTarget.setPointerCapture?.(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (y0.current === null || dragged.current) return;
        const dy = e.clientY - y0.current;
        if (Math.abs(dy) < DRAG) return;
        dragged.current = true;
        if (dy < 0) onOpen();
        else onTuck();
      }}
      onPointerUp={() => {
        y0.current = null;
      }}
      onPointerCancel={() => {
        y0.current = null;
      }}
      onClick={() => {
        if (dragged.current) {
          dragged.current = false;
          return;
        }
        if (tucked) onOpen();
        else onTuck();
      }}
    >
      <span className="bk-grip" aria-hidden="true" />
    </button>
  );
}
