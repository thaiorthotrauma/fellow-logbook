import { FULL_QUAD, type Quad, type RedactionBox } from './types';

const EPS = 0.001;

/** True when the keep-quad actually crops something (isn't the full image). */
function cropsAnything(keep: Quad): boolean {
  return keep.some((p, i) => Math.abs(p.x - FULL_QUAD[i].x) > EPS || Math.abs(p.y - FULL_QUAD[i].y) > EPS);
}

/** Flattens redaction into a new JPEG File:
 *   1. everything OUTSIDE the keep-quad is filled solid black (removes the
 *      black-margin annotations — patient name, ID, dates, hospital/system
 *      text — which is where burned-in PHI lives on an X-ray). The quad can be
 *      skewed, so this works even when the photo was taken at an angle, then
 *   2. each manual box is filled solid black (for anything inside the quad).
 *  Destructive by design — for de-identification we want a guarantee of
 *  removal (a black box can't leave a ghost), not reconstruction. Returns the
 *  original file unchanged when there is nothing to redact. */
export async function applyRedaction(
  file: File,
  boxes: RedactionBox[],
  keep: Quad,
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

    // 1. Black out everything outside the keep-quad. The full-canvas rect plus
    //    the (inner) quad, filled with the even-odd rule, paints the region
    //    between them — i.e. everything outside the quad.
    if (cropsAnything(keep)) {
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      ctx.moveTo(keep[0].x * W, keep[0].y * H);
      ctx.lineTo(keep[1].x * W, keep[1].y * H);
      ctx.lineTo(keep[2].x * W, keep[2].y * H);
      ctx.lineTo(keep[3].x * W, keep[3].y * H);
      ctx.closePath();
      ctx.fill('evenodd');
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
