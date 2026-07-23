import type { Quad } from './types';

// Suggests a keep-frame by finding the anatomy and snapping the quad to its
// bounding box. Runs entirely on-device on a downscaled copy — the image never
// leaves the phone. This is only a SUGGESTION: the fellow always confirms and
// adjusts the corners, so an imperfect fit is never a privacy risk, just a
// convenience. Returns null (→ keep the manual default) when it can't find a
// confident region.
//
// Method: threshold to bright pixels (Otsu), then take the *largest connected
// bright region*. The anatomy is one big contiguous blob; burned-in text, ruler
// ticks and markers are small separate blobs, so the largest component is the
// anatomy and its bounding box excludes the margin text. (A plain brightness
// bounding box fails because the white text is bright too.)

const SAMPLE_MAX = 200; // longest edge of the analysis copy, in px

function otsu(hist: number[], total: number): number {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let maxVar = -1;
  let threshold = 0;
  for (let i = 0; i < 256; i++) {
    wB += hist[i];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += i * hist[i];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > maxVar) {
      maxVar = between;
      threshold = i;
    }
  }
  return threshold;
}

export async function detectContentQuad(file: File): Promise<Quad | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, SAMPLE_MAX / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const { data } = ctx.getImageData(0, 0, w, h);

    const n = w * h;
    const lum = new Uint8Array(n);
    const hist = new Array(256).fill(0);
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      const l = ((data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000) | 0;
      lum[p] = l;
      hist[l]++;
    }
    const t = otsu(hist, n);

    // Largest connected component of bright pixels (8-connectivity, flood fill).
    const seen = new Uint8Array(n);
    const stack: number[] = [];
    let bestSize = 0;
    let bb: { minx: number; maxx: number; miny: number; maxy: number } | null = null;
    for (let s = 0; s < n; s++) {
      if (lum[s] <= t || seen[s]) continue;
      seen[s] = 1;
      stack.push(s);
      let size = 0;
      let minx = w;
      let maxx = 0;
      let miny = h;
      let maxy = 0;
      while (stack.length) {
        const q = stack.pop() as number;
        const x = q % w;
        const y = (q / w) | 0;
        size++;
        if (x < minx) minx = x;
        if (x > maxx) maxx = x;
        if (y < miny) miny = y;
        if (y > maxy) maxy = y;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const ni = ny * w + nx;
            if (lum[ni] > t && !seen[ni]) {
              seen[ni] = 1;
              stack.push(ni);
            }
          }
        }
      }
      if (size > bestSize) {
        bestSize = size;
        bb = { minx, maxx, miny, maxy };
      }
    }
    if (!bb) return null;

    const x0 = bb.minx / w;
    const x1 = (bb.maxx + 1) / w;
    const y0 = bb.miny / h;
    const y1 = (bb.maxy + 1) / h;
    // Reject a suspiciously tiny blob (nothing found) or a near-full box. The
    // latter happens when the photo is of a whole monitor in a room: the entire
    // bright screen is one connected region, so the box would "keep everything"
    // and remove no annotations — a misleading suggestion. Falling back to null
    // gives the fellow the manual inset default to crop from instead.
    if (bestSize / n < 0.03) return null;
    if (x1 - x0 < 0.2 || y1 - y0 < 0.2 || (x1 - x0) * (y1 - y0) > 0.7) return null;

    return [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 },
    ];
  } catch (err) {
    console.error('Auto-fit failed:', err);
    return null;
  }
}
