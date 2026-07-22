import { useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { RedactionBox } from '../lib/redaction/ocr';

interface RedactionCanvasProps {
  imageUrl: string;
  boxes: RedactionBox[];
  onChange: (boxes: RedactionBox[]) => void;
  addMode: boolean;
  onAddModeEnd: () => void;
}

type Gesture =
  | { mode: 'move'; index: number; startNX: number; startNY: number; startBox: RedactionBox }
  | { mode: 'resize'; index: number; startBox: RedactionBox }
  | { mode: 'draw'; index: number; anchorX: number; anchorY: number };

const MIN_SIZE = 0.012;

export default function RedactionCanvas({ imageUrl, boxes, onChange, addMode, onAddModeEnd }: RedactionCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<Gesture | null>(null);

  function normPoint(e: ReactPointerEvent): { nx: number; ny: number } {
    const rect = containerRef.current!.getBoundingClientRect();
    const nx = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const ny = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    return { nx, ny };
  }

  function startMove(e: ReactPointerEvent, index: number) {
    e.stopPropagation();
    containerRef.current?.setPointerCapture(e.pointerId);
    const { nx, ny } = normPoint(e);
    gestureRef.current = { mode: 'move', index, startNX: nx, startNY: ny, startBox: boxes[index] };
  }

  function startResize(e: ReactPointerEvent, index: number) {
    e.stopPropagation();
    containerRef.current?.setPointerCapture(e.pointerId);
    gestureRef.current = { mode: 'resize', index, startBox: boxes[index] };
  }

  function handleBackgroundDown(e: ReactPointerEvent) {
    if (!addMode) return;
    containerRef.current?.setPointerCapture(e.pointerId);
    const { nx, ny } = normPoint(e);
    const next = [...boxes, { x: nx, y: ny, w: 0, h: 0 }];
    gestureRef.current = { mode: 'draw', index: next.length - 1, anchorX: nx, anchorY: ny };
    onChange(next);
  }

  function handleMove(e: ReactPointerEvent) {
    const g = gestureRef.current;
    if (!g) return;
    const { nx, ny } = normPoint(e);
    const next = [...boxes];
    if (g.mode === 'move') {
      const dx = nx - g.startNX;
      const dy = ny - g.startNY;
      const x = Math.min(1 - g.startBox.w, Math.max(0, g.startBox.x + dx));
      const y = Math.min(1 - g.startBox.h, Math.max(0, g.startBox.y + dy));
      next[g.index] = { ...g.startBox, x, y };
    } else if (g.mode === 'resize') {
      const w = Math.min(1 - g.startBox.x, Math.max(MIN_SIZE, nx - g.startBox.x));
      const h = Math.min(1 - g.startBox.y, Math.max(MIN_SIZE, ny - g.startBox.y));
      next[g.index] = { ...g.startBox, w, h };
    } else {
      const x = Math.min(g.anchorX, nx);
      const y = Math.min(g.anchorY, ny);
      next[g.index] = { x, y, w: Math.abs(nx - g.anchorX), h: Math.abs(ny - g.anchorY) };
    }
    onChange(next);
  }

  function handleUp() {
    const g = gestureRef.current;
    gestureRef.current = null;
    if (g?.mode === 'draw') {
      const box = boxes[g.index];
      if (!box || box.w < MIN_SIZE || box.h < MIN_SIZE) {
        onChange(boxes.filter((_, i) => i !== g.index));
      }
      onAddModeEnd();
    }
  }

  function removeBox(e: ReactPointerEvent, index: number) {
    e.stopPropagation();
    onChange(boxes.filter((_, i) => i !== index));
  }

  return (
    <div
      ref={containerRef}
      className={`redact-canvas ${addMode ? 'add-mode' : ''}`}
      onPointerDown={handleBackgroundDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerCancel={handleUp}
    >
      <img src={imageUrl} alt="Redaction preview" className="redact-image" draggable={false} />
      {boxes.map((b, i) => (
        <div
          key={i}
          className="redact-box"
          style={{
            left: `${b.x * 100}%`,
            top: `${b.y * 100}%`,
            width: `${b.w * 100}%`,
            height: `${b.h * 100}%`,
          }}
          onPointerDown={e => startMove(e, i)}
        >
          <button
            type="button"
            className="redact-box-remove"
            aria-label="Remove redaction"
            onPointerDown={e => removeBox(e, i)}
          >
            ×
          </button>
          <span className="redact-box-handle" onPointerDown={e => startResize(e, i)} />
        </div>
      ))}
    </div>
  );
}
