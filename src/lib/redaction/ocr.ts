// On-device text detection for annotation redaction. Runs Tesseract.js (WASM)
// in the browser — the IMAGE NEVER LEAVES THE DEVICE; only the OCR model is
// fetched. We only use the word bounding boxes (to locate burned-in text), not
// the transcribed text. Lazy-loaded so it never touches the base bundle.
//
// This is best-effort assistance only: detection is imperfect, so the editor
// always requires human review and lets the fellow add/adjust boxes manually.
// If the model can't load (blocked network, etc.), detection returns [] and the
// editor falls back to manual-only redaction.

/** A redaction rectangle in normalized image coordinates (0–1), so it maps to
 *  any display size and to the full-resolution burn-in. */
export interface RedactionBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface OcrBBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
interface OcrWord {
  text?: string;
  confidence?: number;
  bbox?: OcrBBox;
}

const CONFIDENCE_MIN = 30;
const PAD = 0.006; // normalized padding so boxes fully cover glyph edges

/** Defensively collect words from a Tesseract result across API shapes. */
function collectWords(data: unknown): OcrWord[] {
  const d = data as { words?: OcrWord[]; blocks?: unknown[] };
  if (Array.isArray(d.words) && d.words.length) return d.words;
  const words: OcrWord[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    const n = node as Record<string, unknown>;
    if (n.bbox && (n.text !== undefined || n.confidence !== undefined)) {
      words.push(n as OcrWord);
    }
    for (const key of ['blocks', 'paragraphs', 'lines', 'words']) {
      const child = n[key];
      if (Array.isArray(child)) child.forEach(walk);
    }
  };
  (d.blocks ?? []).forEach(walk);
  return words;
}

export async function detectTextBoxes(file: File): Promise<RedactionBox[]> {
  try {
    const [{ createWorker }, bitmap] = await Promise.all([
      import('tesseract.js'),
      createImageBitmap(file),
    ]);
    const W = bitmap.width;
    const H = bitmap.height;
    bitmap.close?.();

    const worker = await createWorker('eng+tha', 1);
    let boxes: RedactionBox[] = [];
    try {
      const { data } = await worker.recognize(file, {}, { blocks: true });
      boxes = collectWords(data)
        .filter(w => (w.confidence ?? 0) >= CONFIDENCE_MIN && (w.text ?? '').trim().length > 0 && w.bbox)
        .map(w => {
          const b = w.bbox as OcrBBox;
          const x = Math.max(0, b.x0 / W - PAD);
          const y = Math.max(0, b.y0 / H - PAD);
          const x1 = Math.min(1, b.x1 / W + PAD);
          const y1 = Math.min(1, b.y1 / H + PAD);
          return { x, y, w: x1 - x, h: y1 - y };
        })
        .filter(box => box.w > 0.005 && box.h > 0.003);
    } finally {
      await worker.terminate();
    }
    return boxes;
  } catch (err) {
    console.error('Text detection unavailable — manual redaction only:', err);
    return [];
  }
}
