import { useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { RedactionBox } from '../lib/redaction/types';

interface RedactionCanvasProps {
  imageUrl: string;
  boxes: RedactionBox[];
  onBoxes: (boxes: RedactionBox[]) => void;
  keep: RedactionBox;
  onKeep: (keep: RedactionBox) => void;
  mode: 'crop' | 'box';
  onDrawEnd: () => void;
}

type Corner = 'nw' | 'ne' | 'sw' | 'se';

type Gesture =
  | { kind: 'keep-move'; startNX: number; startNY: number; start: RedactionBox }
  | { kind: 'keep-corner'; corner: Corner; start: RedactionBox }
  | { kind: 'box-move'; index: number; startNX: number; startNY: number; start: RedactionBox }
  | { kind: 'box-resize'; index: number }
  | { kind: 'box-draw'; index: number; anchorX: number; anchorY: number };

const MIN_KEEP = 0.1;
const MIN_BOX = 0.012;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

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

  // ── Keep-frame gestures ──────────────────────────────────────────────────
  function startKeepMove(e: ReactPointerEvent) {
    e.stopPropagation();
    capture(e);
    const { nx, ny } = normPoint(e);
    gestureRef.current = { kind: 'keep-move', startNX: nx, startNY: ny, start: keep };
  }

  function startKeepCorner(e: ReactPointerEvent, corner: Corner) {
    e.stopPropagation();
    capture(e);
    gestureRef.current = { kind: 'keep-corner', corner, start: keep };
  }

  // ── Box gestures ─────────────────────────────────────────────────────────
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
    if (mode !== 'box') return;
    capture(e);
    const { nx, ny } = normPoint(e);
    const next = [...boxes, { x: nx, y: ny, w: 0, h: 0 }];
    gestureRef.current = { kind: 'box-draw', index: next.length - 1, anchorX: nx, anchorY: ny };
    onBoxes(next);
  }

  function handleMove(e: ReactPointerEvent) {
    const g = gestureRef.current;
    if (!g) return;
    const { nx, ny } = normPoint(e);

    if (g.kind === 'keep-move') {
      const x = Math.min(1 - g.start.w, Math.max(0, g.start.x + (nx - g.startNX)));
      const y = Math.min(1 - g.start.h, Math.max(0, g.start.y + (ny - g.startNY)));
      onKeep({ ...g.start, x, y });
      return;
    }
    if (g.kind === 'keep-corner') {
      let left = g.start.x;
      let top = g.start.y;
      let right = g.start.x + g.start.w;
      let bottom = g.start.y + g.start.h;
      if (g.corner === 'nw' || g.corner === 'sw') left = Math.min(nx, right - MIN_KEEP);
      if (g.corner === 'ne' || g.corner === 'se') right = Math.max(nx, left + MIN_KEEP);
      if (g.corner === 'nw' || g.corner === 'ne') top = Math.min(ny, bottom - MIN_KEEP);
      if (g.corner === 'sw' || g.corner === 'se') bottom = Math.max(ny, top + MIN_KEEP);
      onKeep({ x: left, y: top, w: right - left, h: bottom - top });
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
  const outside = { left: pct(keep.x), top: pct(keep.y), width: pct(keep.w), height: pct(keep.h) };

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

      {/* Dark bands over everything that will be blacked out (outside keep). */}
      <div className="redact-mask top" style={{ height: pct(keep.y) }} />
      <div className="redact-mask bottom" style={{ top: pct(keep.y + keep.h) }} />
      <div className="redact-mask left" style={{ top: pct(keep.y), height: pct(keep.h), width: pct(keep.x) }} />
      <div className="redact-mask right" style={{ top: pct(keep.y), height: pct(keep.h), left: pct(keep.x + keep.w) }} />

      {/* Keep-frame — draggable body + corner handles (crop mode only). */}
      <div
        className={`redact-keep ${mode === 'crop' ? 'active' : ''}`}
        style={outside}
        onPointerDown={mode === 'crop' ? startKeepMove : undefined}
      >
        {mode === 'crop' && (['nw', 'ne', 'sw', 'se'] as Corner[]).map(c => (
          <span key={c} className={`redact-keep-handle ${c}`} onPointerDown={e => startKeepCorner(e, c)} />
        ))}
      </div>

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
