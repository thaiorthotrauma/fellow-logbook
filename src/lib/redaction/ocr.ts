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
// A real text annotation is a small region. Anything larger than this fraction
// of the image is a false positive (e.g. Tesseract wrapping the whole X-ray in
// one block) — burning it in would black out the picture, so we drop it.
const MAX_BOX_AREA = 0.25;
const MAX_BOX_DIM = 0.9;

/** Collect only leaf WORD nodes from a Tesseract result. Block/paragraph/line
 *  nodes also carry a `bbox`, but theirs spans large regions (up to the whole
 *  image), so collecting them would produce giant redaction boxes — we descend
 *  through them and only gather the words they contain. */
function collectWords(data: unknown): OcrWord[] {
  const d = data as { words?: OcrWord[]; blocks?: unknown[] };
  if (Array.isArray(d.words) && d.words.length) return d.words;
  const words: OcrWord[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    const n = node as Record<string, unknown>;
    if (Array.isArray(n.words)) {
      for (const w of n.words) {
        if (w && typeof w === 'object' && (w as OcrWord).bbox) words.push(w as OcrWord);
      }
    }
    for (const key of ['blocks', 'paragraphs', 'lines']) {
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
        .filter(box => box.w > 0.005 && box.h > 0.003)
        // Drop implausibly large detections so a false positive can never black
        // out the whole image; genuine annotations are small.
        .filter(box => box.w * box.h <= MAX_BOX_AREA && box.w <= MAX_BOX_DIM && box.h <= MAX_BOX_DIM);
    } finally {
      await worker.terminate();
    }
    return boxes;
  } catch (err) {
    console.error('Text detection unavailable — manual redaction only:', err);
    return [];
  }
}
