import { useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { Point, Quad, RedactionBox } from '../lib/redaction/types';

interface RedactionCanvasProps {
  imageUrl: string;
  boxes: RedactionBox[];
  onBoxes: (boxes: RedactionBox[]) => void;
  keep: Quad;
  onKeep: (keep: Quad) => void;
  mode: 'crop' | 'box';
  onDrawEnd: () => void;
}

type Gesture =
  | { kind: 'quad-move'; startNX: number; startNY: number; start: Quad }
  | { kind: 'quad-corner'; index: number }
  | { kind: 'box-move'; index: number; startNX: number; startNY: number; start: RedactionBox }
  | { kind: 'box-resize'; index: number }
  | { kind: 'box-draw'; index: number; anchorX: number; anchorY: number };

const MIN_BOX = 0.012;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Even-odd winding: a point is inside the quad iff a ray crosses its edges an
 *  odd number of times. Used so a drag inside the frame moves the whole frame. */
function pointInQuad(q: Quad, x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = 3; i < 4; j = i++) {
    const a = q[i];
    const b = q[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export default function RedactionCanvas({ imageUrl, boxes, onBoxes, keep, onKeep, mode, onDrawEnd }: RedactionCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<Gesture | null>(null);

  function normPoint(e: ReactPointerEvent): { nx: number; ny: number } {
    const rect = containerRef.current!.getBoundingClientRect();
    return {
      nx: clamp01((e.clientX - rect.left) / rect.width),
      ny: clamp01((e.clientY - rect.top) / rect.height),
    };
  }

  function capture(e: ReactPointerEvent) {
    containerRef.current?.setPointerCapture(e.pointerId);
  }

  function startCorner(e: ReactPointerEvent, index: number) {
    e.stopPropagation();
    capture(e);
    gestureRef.current = { kind: 'quad-corner', index };
  }

  function startBoxMove(e: ReactPointerEvent, index: number) {
    if (mode !== 'box') return;
    e.stopPropagation();
    capture(e);
    const { nx, ny } = normPoint(e);
    gestureRef.current = { kind: 'box-move', index, startNX: nx, startNY: ny, start: boxes[index] };
  }

  function startBoxResize(e: ReactPointerEvent, index: number) {
    e.stopPropagation();
    capture(e);
    gestureRef.current = { kind: 'box-resize', index };
  }

  function removeBox(e: ReactPointerEvent, index: number) {
    e.stopPropagation();
    onBoxes(boxes.filter((_, i) => i !== index));
  }

  function handleBackgroundDown(e: ReactPointerEvent) {
    const { nx, ny } = normPoint(e);
    if (mode === 'box') {
      capture(e);
      const next = [...boxes, { x: nx, y: ny, w: 0, h: 0 }];
      gestureRef.current = { kind: 'box-draw', index: next.length - 1, anchorX: nx, anchorY: ny };
      onBoxes(next);
      return;
    }
    // Crop mode: dragging inside the frame moves the whole frame.
    if (pointInQuad(keep, nx, ny)) {
      capture(e);
      gestureRef.current = { kind: 'quad-move', startNX: nx, startNY: ny, start: keep };
    }
  }

  function handleMove(e: ReactPointerEvent) {
    const g = gestureRef.current;
    if (!g) return;
    const { nx, ny } = normPoint(e);

    if (g.kind === 'quad-corner') {
      const next = keep.map((p, i) => (i === g.index ? { x: nx, y: ny } : p)) as Quad;
      onKeep(next);
      return;
    }
    if (g.kind === 'quad-move') {
      const xs = g.start.map(p => p.x);
      const ys = g.start.map(p => p.y);
      const dx = Math.min(1 - Math.max(...xs), Math.max(-Math.min(...xs), nx - g.startNX));
      const dy = Math.min(1 - Math.max(...ys), Math.max(-Math.min(...ys), ny - g.startNY));
      onKeep(g.start.map(p => ({ x: p.x + dx, y: p.y + dy })) as Quad);
      return;
    }

    const next = [...boxes];
    if (g.kind === 'box-move') {
      const x = Math.min(1 - g.start.w, Math.max(0, g.start.x + (nx - g.startNX)));
      const y = Math.min(1 - g.start.h, Math.max(0, g.start.y + (ny - g.startNY)));
      next[g.index] = { ...g.start, x, y };
    } else if (g.kind === 'box-resize') {
      const b = boxes[g.index];
      next[g.index] = {
        ...b,
        w: Math.min(1 - b.x, Math.max(MIN_BOX, nx - b.x)),
        h: Math.min(1 - b.y, Math.max(MIN_BOX, ny - b.y)),
      };
    } else {
      next[g.index] = {
        x: Math.min(g.anchorX, nx),
        y: Math.min(g.anchorY, ny),
        w: Math.abs(nx - g.anchorX),
        h: Math.abs(ny - g.anchorY),
      };
    }
    onBoxes(next);
  }

  function handleUp() {
    const g = gestureRef.current;
    gestureRef.current = null;
    if (g?.kind === 'box-draw') {
      const box = boxes[g.index];
      if (!box || box.w < MIN_BOX || box.h < MIN_BOX) {
        onBoxes(boxes.filter((_, i) => i !== g.index));
      }
      onDrawEnd();
    }
  }

  const pct = (v: number) => `${v * 100}%`;
  const polyPoints = keep.map(p => `${p.x} ${p.y}`).join(', ');
  // Full-canvas rect + inner quad, even-odd filled → mask over everything outside the quad.
  const maskPath =
    `M0 0 H1 V1 H0 Z ` +
    `M${keep[0].x} ${keep[0].y} L${keep[1].x} ${keep[1].y} L${keep[2].x} ${keep[2].y} L${keep[3].x} ${keep[3].y} Z`;

  return (
    <div
      ref={containerRef}
      className={`redact-canvas ${mode === 'box' ? 'box-mode' : ''}`}
      onPointerDown={handleBackgroundDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerCancel={handleUp}
    >
      <img src={imageUrl} alt="Redaction preview" className="redact-image" draggable={false} />

      <svg className="redact-svg" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
        <path className="redact-mask-path" d={maskPath} fillRule="evenodd" />
        <polygon className="redact-keep-poly" points={polyPoints} vectorEffect="non-scaling-stroke" />
      </svg>

      {/* Corner handles (crop mode) — each corner drags independently to follow tilt. */}
      {mode === 'crop' && keep.map((p: Point, i) => (
        <span
          key={i}
          className="redact-corner"
          style={{ left: pct(p.x), top: pct(p.y) }}
          onPointerDown={e => startCorner(e, i)}
        />
      ))}

      {/* Manual black boxes. */}
      {boxes.map((b, i) => (
        <div
          key={i}
          className={`redact-box ${mode === 'box' ? 'active' : ''}`}
          style={{ left: pct(b.x), top: pct(b.y), width: pct(b.w), height: pct(b.h) }}
          onPointerDown={e => startBoxMove(e, i)}
        >
          {mode === 'box' && (
            <>
              <button
                type="button"
                className="redact-box-remove"
                aria-label="Remove redaction"
                onPointerDown={e => removeBox(e, i)}
              >
                ×
              </button>
              <span className="redact-box-handle" onPointerDown={e => startBoxResize(e, i)} />
            </>
          )}
        </div>
      ))}
    </div>
  );
}
