import { useEffect, useMemo, useState } from 'react';
import { detectTextBoxes, type RedactionBox } from '../lib/redaction/ocr';
import { applyRedaction } from '../lib/redaction/applyRedaction';
import RedactionCanvas from './RedactionCanvas';

interface RedactionEditorProps {
  files: File[];
  onComplete: (redacted: File[]) => void;
  onCancel: () => void;
}

/** Full-screen review step: for each image, auto-detected text boxes are shown
 *  (best-effort) and the fellow covers any patient name / ID / date before the
 *  flattened image is accepted for upload. Runs entirely on-device. */
export default function RedactionEditor({ files, onComplete, onCancel }: RedactionEditorProps) {
  const [index, setIndex] = useState(0);
  const [boxesByFile, setBoxesByFile] = useState<Record<number, RedactionBox[]>>({});
  const [detectedFor, setDetectedFor] = useState<Record<number, boolean>>({});
  const [detecting, setDetecting] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [addMode, setAddMode] = useState(false);

  const urls = useMemo(() => files.map(f => URL.createObjectURL(f)), [files]);
  useEffect(() => () => urls.forEach(URL.revokeObjectURL), [urls]);

  // Auto-detect text on the current image the first time it's shown.
  useEffect(() => {
    if (detectedFor[index]) return;
    let cancelled = false;
    setDetecting(true);
    detectTextBoxes(files[index])
      .then(boxes => {
        if (cancelled) return;
        setBoxesByFile(prev => ({ ...prev, [index]: boxes }));
        setDetectedFor(prev => ({ ...prev, [index]: true }));
      })
      .finally(() => !cancelled && setDetecting(false));
    return () => {
      cancelled = true;
    };
  }, [index, files, detectedFor]);

  const boxes = boxesByFile[index] ?? [];
  const setBoxes = (next: RedactionBox[]) => setBoxesByFile(prev => ({ ...prev, [index]: next }));
  const isLast = index === files.length - 1;

  async function finish() {
    setFinishing(true);
    try {
      const redacted = await Promise.all(files.map((f, i) => applyRedaction(f, boxesByFile[i] ?? [])));
      onComplete(redacted);
    } finally {
      setFinishing(false);
    }
  }

  return (
    <div className="redact-overlay" role="dialog" aria-modal="true" aria-label="Redact patient information">
      <div className="redact-header">
        <div className="redact-title">Cover patient information</div>
        <div className="redact-sub">
          Black out any name, ID/HN, or date burned into the image. Review carefully — this can't be undone
          after upload.
        </div>
      </div>

      <div className="redact-body">
        <RedactionCanvas
          imageUrl={urls[index]}
          boxes={boxes}
          onChange={setBoxes}
          addMode={addMode}
          onAddModeEnd={() => setAddMode(false)}
        />
        <div className="redact-status">
          {detecting
            ? 'Scanning for text…'
            : boxes.length > 0
              ? `${boxes.length} area${boxes.length === 1 ? '' : 's'} marked`
              : 'No text detected — add boxes over anything sensitive.'}
        </div>
      </div>

      <div className="redact-toolbar">
        <button
          type="button"
          className={`redact-tool ${addMode ? 'active' : ''}`}
          onClick={() => setAddMode(v => !v)}
        >
          {addMode ? 'Draw a box…' : '+ Add box'}
        </button>
        {boxes.length > 0 && (
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
          <button type="button" className="btn-primary" onClick={finish} disabled={finishing || detecting}>
            {finishing ? 'Applying…' : 'Apply & add'}
          </button>
        ) : (
          <button type="button" className="btn-primary" onClick={() => setIndex(i => i + 1)} disabled={detecting}>
            Next
          </button>
        )}
      </div>
    </div>
  );
}
