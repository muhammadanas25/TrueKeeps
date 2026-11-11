/**
 * LiveBook — a solid 3-D book the customer can turn, which fills up as their
 * photos arrive.
 *
 * This is the one authored moment of the upload. A progress bar says "wait";
 * a book that gets thicker with every photo says "this is becoming the thing
 * you came for". Thickness is real information: it grows towards the width the
 * finished book's page count will give it, so 200 photos make a chunkier book
 * than 30.
 *
 * Construction: six faces around a centre, each pushed out by half the book's
 * width or half its thickness. Thickness is a registered custom property, so a
 * change animates smoothly across all six at once.
 *
 * Turning: pointer drag with a little inertia, arrow keys, and Front/Spine/Back
 * buttons that ease to a pose. Nothing moves by itself, so there's no idle loop
 * to run down a phone battery during a long upload.
 *
 * Reduced motion: turning still works because the customer is driving it, but
 * eases are skipped and photos don't fly in. The thickness and count still
 * change, so no information is lost.
 */

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

interface Pose {
  rx: number;
  ry: number;
}

const FRONT: Pose = { rx: -8, ry: -26 };
const SPINE: Pose = { rx: -6, ry: 70 };
const BACK: Pose = { rx: -8, ry: 154 };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const prefersReduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function LiveBook({
  cover,
  back,
  spine,
  page,
  ink,
  thickness,
  label,
}: {
  cover: ReactNode;
  back: ReactNode;
  spine: string;
  /** colours of the spine and back, from the book's theme */
  page: string;
  ink: string;
  /** thickness as a fraction of the book's width */
  thickness: number;
  label: string;
}) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(300);
  const motion = useRef({ ...FRONT, vx: 0, vy: 0, dragging: false, lx: 0, ly: 0, raf: 0, target: null as Pose | null });

  const apply = useCallback(() => {
    const m = motion.current;
    bookRef.current?.style.setProperty("--rx", `${m.rx}deg`);
    bookRef.current?.style.setProperty("--ry", `${m.ry}deg`);
  }, []);

  const loop = useCallback(() => {
    const m = motion.current;
    if (m.target) {
      m.rx += (m.target.rx - m.rx) * 0.14;
      m.ry += (m.target.ry - m.ry) * 0.14;
      if (Math.abs(m.target.ry - m.ry) < 0.2 && Math.abs(m.target.rx - m.rx) < 0.2) {
        m.rx = m.target.rx;
        m.ry = m.target.ry;
        m.target = null;
      }
    } else if (!m.dragging) {
      m.ry += m.vy;
      m.rx = clamp(m.rx + m.vx, -70, 70);
      m.vy *= 0.94;
      m.vx *= 0.94;
    }
    apply();
    const moving = m.target || m.dragging || Math.abs(m.vy) > 0.05 || Math.abs(m.vx) > 0.05;
    m.raf = moving ? requestAnimationFrame(loop) : 0;
  }, [apply]);

  const kick = useCallback(() => {
    if (!motion.current.raf) motion.current.raf = requestAnimationFrame(loop);
  }, [loop]);

  /** Ease to a pose by the shortest way round, however many turns the book has done. */
  const goTo = useCallback(
    (pose: Pose) => {
      const m = motion.current;
      const turns = Math.round((m.ry - pose.ry) / 360);
      m.vx = m.vy = 0;
      if (prefersReduced()) {
        m.rx = pose.rx;
        m.ry = pose.ry + turns * 360;
        m.target = null;
        apply();
      } else {
        m.target = { rx: pose.rx, ry: pose.ry + turns * 360 };
        kick();
      }
    },
    [apply, kick],
  );

  useEffect(() => {
    apply();
    const scene = sceneRef.current;
    if (!scene) return;
    const ro = new ResizeObserver(() => setWidth(scene.clientWidth));
    ro.observe(scene);
    const raf = motion.current;
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf.raf);
    };
  }, [apply]);

  const style = { "--w": `${width}px`, "--pw": `${width}px`, "--t": `${Math.round(width * thickness)}px` } as CSSProperties;

  return (
    <div className="ck-live">
      <div
        ref={sceneRef}
        className="ck-scene"
        tabIndex={0}
        role="img"
        aria-label={label}
        onPointerDown={(e) => {
          const m = motion.current;
          m.dragging = true;
          m.target = null;
          m.lx = e.clientX;
          m.ly = e.clientY;
          m.vx = m.vy = 0;
          e.currentTarget.setPointerCapture(e.pointerId);
          kick();
        }}
        onPointerMove={(e) => {
          const m = motion.current;
          if (!m.dragging) return;
          const dx = e.clientX - m.lx;
          const dy = e.clientY - m.ly;
          m.lx = e.clientX;
          m.ly = e.clientY;
          m.vy = dx * 0.5;
          m.vx = -dy * 0.4;
          m.ry += m.vy;
          m.rx = clamp(m.rx + m.vx, -70, 70);
        }}
        onPointerUp={() => {
          const m = motion.current;
          m.dragging = false;
          if (prefersReduced()) m.vx = m.vy = 0;
          kick();
        }}
        onPointerCancel={() => {
          motion.current.dragging = false;
        }}
        onKeyDown={(e) => {
          const step = { ArrowLeft: [0, -20], ArrowRight: [0, 20], ArrowUp: [15, 0], ArrowDown: [-15, 0] }[e.key];
          if (!step) return;
          e.preventDefault();
          const m = motion.current;
          goTo({ rx: clamp(m.rx + step[0], -70, 70), ry: m.ry + step[1] });
        }}
      >
        <div ref={bookRef} className="ck-book" style={style}>
          <div className="ck-face ck-front">{cover}</div>
          <div className="ck-face ck-back" style={{ background: page, color: ink }}>
            {back}
          </div>
          <div className="ck-face ck-spine" style={{ background: page, color: ink }}>
            <span>{spine}</span>
          </div>
          <div className="ck-face ck-edge" />
          <div className="ck-face ck-top" />
          <div className="ck-face ck-bottom" />
        </div>
        <div className="ck-floor" />
      </div>
      <div className="ck-turn">
        <button type="button" onClick={() => goTo(FRONT)}>
          Front
        </button>
        <button type="button" onClick={() => goTo(SPINE)}>
          Spine
        </button>
        <button type="button" onClick={() => goTo(BACK)}>
          Back
        </button>
      </div>
    </div>
  );
}
