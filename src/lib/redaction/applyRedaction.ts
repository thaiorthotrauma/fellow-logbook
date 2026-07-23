import type { RedactionBox } from './types';

const EPS = 0.001;

/** True when the keep-frame actually crops something (isn't the full image). */
function cropsAnything(keep: RedactionBox): boolean {
  return keep.x > EPS || keep.y > EPS || keep.w < 1 - EPS || keep.h < 1 - EPS;
}

/** Flattens redaction into a new JPEG File:
 *   1. everything OUTSIDE the keep-frame is filled solid black (removes the
 *      black-margin annotations — patient name, ID, dates, hospital/system
 *      text — which is where burned-in PHI lives on an X-ray), then
 *   2. each manual box is filled solid black (for anything inside the frame).
 *  Destructive by design — for de-identification we want a guarantee of
 *  removal (a black box can't leave a ghost), not reconstruction. Returns the
 *  original file unchanged when there is nothing to redact. */
export async function applyRedaction(
  file: File,
  boxes: RedactionBox[],
  keep: RedactionBox,
): Promise<File> {
  if (boxes.length === 0 && !cropsAnything(keep)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const W = bitmap.width;
    const H = bitmap.height;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close?.();

    ctx.fillStyle = '#000000';

    // 1. Black out everything outside the keep-frame (four margin bands).
    if (cropsAnything(keep)) {
      const kx = Math.round(keep.x * W);
      const ky = Math.round(keep.y * H);
      const kw = Math.round(keep.w * W);
      const kh = Math.round(keep.h * H);
      ctx.fillRect(0, 0, W, ky); // top
      ctx.fillRect(0, ky + kh, W, H - (ky + kh)); // bottom
      ctx.fillRect(0, ky, kx, kh); // left
      ctx.fillRect(kx + kw, ky, W - (kx + kw), kh); // right
    }

    // 2. Black out each manual box.
    for (const b of boxes) {
      ctx.fillRect(
        Math.round(b.x * W),
        Math.round(b.y * H),
        Math.round(b.w * W),
        Math.round(b.h * H),
      );
    }

    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, 'image/jpeg', 0.92),
    );
    if (!blob) return file;
    const name = file.name.replace(/\.[^./\\]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg', lastModified: file.lastModified });
  } catch (err) {
    console.error('Redaction burn-in failed:', err);
    return file;
  }
}
