/** True for HEIC/HEIF files — checked by MIME when present, else by extension
 *  (HEIC files often arrive with an empty `type`). */
export function isHeic(file: File): boolean {
  const type = file.type.toLowerCase();
  return type === 'image/heic' || type === 'image/heif' || /\.(heic|heif)$/i.test(file.name);
}

/** Converts a single HEIC/HEIF file to a JPEG File, entirely in the browser.
 *  The heic2any library (libheif compiled to WASM, ~1.5 MB) is dynamically
 *  imported so it only loads when a HEIC file is actually selected. On any
 *  failure the original file is returned unchanged (storage still accepts HEIC),
 *  so conversion is best-effort, never blocking. No data leaves the device. */
export async function heicToJpeg(file: File): Promise<File> {
  if (!isHeic(file)) return file;
  try {
    const { default: heic2any } = await import('heic2any');
    const result = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.85 });
    const blob = Array.isArray(result) ? result[0] : result;
    const name = file.name.replace(/\.(heic|heif)$/i, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg', lastModified: file.lastModified });
  } catch (err) {
    console.error('HEIC → JPEG conversion failed, keeping original:', err);
    return file;
  }
}

/** Converts any HEIC/HEIF files in the list to JPEG, leaving others untouched. */
export function convertHeicFiles(files: File[]): Promise<File[]> {
  return Promise.all(files.map(heicToJpeg));
}
