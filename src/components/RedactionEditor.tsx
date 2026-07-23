import { useEffect, useMemo, useState } from 'react';
import { applyRedaction } from '../lib/redaction/applyRedaction';
import { detectContentQuad } from '../lib/redaction/autofit';
import { FULL_QUAD, type Quad, type RedactionBox } from '../lib/redaction/types';
import RedactionCanvas from './RedactionCanvas';

interface RedactionEditorProps {
  files: File[];
  onComplete: (redacted: File[]) => void;
  onCancel: () => void;
}

type Mode = 'crop' | 'box';

// The keep-frame starts slightly inset so the removable margins are visible
// immediately (the dark mask signals "this gets blacked out"); the fellow drags
// each corner onto the edges of the actual X-ray — a free quad so it can follow
// the perspective tilt of a photo taken at an angle.
const DEFAULT_KEEP: Quad = [
  { x: 0.08, y: 0.06 },
  { x: 0.92, y: 0.06 },
  { x: 0.92, y: 0.94 },
  { x: 0.08, y: 0.94 },
];

/** Full-screen review step run entirely on-device (the un-redacted image never
 *  leaves the phone). The fellow fits a "keep" quad to the X-ray so the black
 *  margins — where burned-in name / ID / dates / hospital text live — are
 *  blacked out, then covers anything left inside with manual boxes. Everything
 *  is deterministic: what you see masked is exactly what gets burned in. */
export default function RedactionEditor({ files, onComplete, onCancel }: RedactionEditorProps) {
  const [index, setIndex] = useState(0);
  const [boxesByFile, setBoxesByFile] = useState<Record<number, RedactionBox[]>>({});
  const [keepByFile, setKeepByFile] = useState<Record<number, Quad>>({});
  const [fittedFor, setFittedFor] = useState<Record<number, boolean>>({});
  const [fitting, setFitting] = useState(false);
  const [mode, setMode] = useState<Mode>('crop');
  const [finishing, setFinishing] = useState(false);

  const urls = useMemo(() => files.map(f => URL.createObjectURL(f)), [files]);
  useEffect(() => () => urls.forEach(URL.revokeObjectURL), [urls]);

  const boxes = boxesByFile[index] ?? [];
  const keep = keepByFile[index] ?? DEFAULT_KEEP;
  const setBoxes = (next: RedactionBox[]) => setBoxesByFile(prev => ({ ...prev, [index]: next }));
  const setKeep = (next: Quad) => setKeepByFile(prev => ({ ...prev, [index]: next }));
  const isLast = index === files.length - 1;

  // Auto-fit the frame the first time each image is shown — a suggestion the
  // fellow then confirms. Never overrides a frame they've already adjusted.
  useEffect(() => {
    if (fittedFor[index]) return;
    let cancelled = false;
    setFitting(true);
    detectContentQuad(files[index])
      .then(quad => {
        if (cancelled) return;
        if (quad) setKeepByFile(prev => (prev[index] ? prev : { ...prev, [index]: quad }));
        setFittedFor(prev => ({ ...prev, [index]: true }));
      })
      .finally(() => !cancelled && setFitting(false));
    return () => {
      cancelled = true;
    };
  }, [index, files, fittedFor]);

  async function autoFit() {
    setFitting(true);
    try {
      const quad = await detectContentQuad(files[index]);
      if (quad) setKeep(quad);
    } finally {
      setFitting(false);
    }
  }

  async function finish() {
    setFinishing(true);
    try {
      const redacted = await Promise.all(
        files.map((f, i) => applyRedaction(f, boxesByFile[i] ?? [], keepByFile[i] ?? DEFAULT_KEEP)),
      );
      onComplete(redacted);
    } finally {
      setFinishing(false);
    }
  }

  return (
    <div className="redact-overlay" role="dialog" aria-modal="true" aria-label="Hide patient information">
      <div className="redact-header">
        <div className="redact-title">Hide patient information</div>
        <div className="redact-sub">
          Fit the frame to the X-ray so the margins (name, ID/HN, dates, hospital text) are removed, then cover
          anything left. This can't be undone after upload.
        </div>
      </div>

      <div className="redact-body">
        <RedactionCanvas
          imageUrl={urls[index]}
          boxes={boxes}
          onBoxes={setBoxes}
          keep={keep}
          onKeep={setKeep}
          mode={mode}
          onDrawEnd={() => { /* stay in box mode so several boxes can be drawn */ }}
        />
        <div className="redact-status">
          {mode === 'crop'
            ? fitting
              ? 'Finding the X-ray…'
              : 'Drag each corner onto the edges of the X-ray — everything outside is blacked out.'
            : boxes.length > 0
              ? `Drag across any remaining text to cover it. ${boxes.length} area${boxes.length === 1 ? '' : 's'} marked.`
              : 'Drag across any remaining text to cover it.'}
        </div>
      </div>

      <div className="redact-toolbar">
        <div className="redact-modes">
          <button type="button" className={`redact-mode ${mode === 'crop' ? 'active' : ''}`} onClick={() => setMode('crop')}>
            Crop margins
          </button>
          <button type="button" className={`redact-mode ${mode === 'box' ? 'active' : ''}`} onClick={() => setMode('box')}>
            Cover text
          </button>
        </div>
        {mode === 'crop' && (
          <>
            <button type="button" className="redact-tool" onClick={autoFit} disabled={fitting}>
              Auto-fit
            </button>
            <button type="button" className="redact-tool" onClick={() => setKeep(FULL_QUAD)}>
              Whole image
            </button>
          </>
        )}
        {mode === 'box' && boxes.length > 0 && (
          <button type="button" className="redact-tool" onClick={() => setBoxes([])}>
            Clear boxes
          </button>
        )}
        <span className="redact-count">
          {index + 1} / {files.length}
        </span>
      </div>

      <div className="redact-actions">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={finishing}>
          Cancel
        </button>
        {index > 0 && (
          <button type="button" className="btn-secondary" onClick={() => setIndex(i => i - 1)} disabled={finishing}>
            Back
          </button>
        )}
        {isLast ? (
          <button type="button" className="btn-primary" onClick={finish} disabled={finishing}>
            {finishing ? 'Applying…' : 'Apply & add'}
          </button>
        ) : (
          <button type="button" className="btn-primary" onClick={() => setIndex(i => i + 1)}>
            Next
          </button>
        )}
      </div>
    </div>
  );
}
