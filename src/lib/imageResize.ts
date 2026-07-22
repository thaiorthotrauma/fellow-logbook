// Client-side downscale + re-encode of images before upload, to save storage.
// Runs entirely on-device (canvas); nothing leaves the browser. Re-encoding
// also strips EXIF metadata (camera GPS/timestamp) and bakes in the correct
// orientation — a small privacy bonus.

const MAX_EDGE = 2048; // longest side, in px; images larger than this are shrunk
const JPEG_QUALITY = 0.92;

/** Downscales an image so its longest edge is at most MAX_EDGE (never upscales)
 *  and re-encodes it to JPEG. Best-effort: if the browser can't decode the file
 *  (e.g. a HEIC whose conversion failed), the original is returned unchanged. */
export async function resizeImage(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(1, MAX_EDGE / longest);
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    );
    if (!blob) return file;

    const name = file.name.replace(/\.[^./\\]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg', lastModified: file.lastModified });
  } catch (err) {
    console.error('Image resize failed, keeping original:', err);
    return file;
  }
}

export function resizeImages(files: File[]): Promise<File[]> {
  return Promise.all(files.map(resizeImage));
}
