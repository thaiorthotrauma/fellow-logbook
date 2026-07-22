import type { RedactionBox } from './ocr';

/** Burns solid black rectangles over the given normalized boxes and returns a
 *  new JPEG File. Destructive by design — for de-identification we want a
 *  guarantee of removal (a black box can't leave a ghost), not reconstruction.
 *  Returns the original file unchanged when there is nothing to redact. */
export async function applyRedaction(file: File, boxes: RedactionBox[]): Promise<File> {
  if (boxes.length === 0) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close?.();

    ctx.fillStyle = '#000000';
    for (const b of boxes) {
      ctx.fillRect(
        Math.round(b.x * canvas.width),
        Math.round(b.y * canvas.height),
        Math.round(b.w * canvas.width),
        Math.round(b.h * canvas.height),
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
