import { useEffect, useMemo, useRef, useState } from 'react';
import { getImageUrlsPositional, isAllowedImage, MAX_IMAGES_TOTAL_BYTES } from '../lib/casesApi';
import { convertHeicFiles } from '../lib/heic';
import { resizeImages } from '../lib/imageResize';
import { reportError } from '../lib/errorReport';

interface ImageUploadProps {
  images: File[];
  onAdd: (files: File[]) => void;
  onRemove: (index: number) => void;
  /** Drive file IDs of images already saved on the case being edited. Absent
   *  when logging a new case. */
  existing?: string[];
  onRemoveExisting?: (index: number) => void;
}

/** True for a path that's already a usable image URL rather than a Drive file
 *  id — demo mode's cases hold local `blob:` URLs (there's no Drive behind
 *  it), so those can be shown directly instead of fetched. */
function isResolvedUrl(path: string): boolean {
  return path.startsWith('blob:') || path.startsWith('data:');
}

/** Thumbnails of a case's already-saved images, each removable. Loaded
 *  positionally so a failed image still occupies its slot and the remove
 *  buttons stay aligned with the caller's id list. */
function SavedImages({ paths, onRemove }: { paths: string[]; onRemove: (index: number) => void }) {
  const [urls, setUrls] = useState<(string | null)[] | null>(null);

  useEffect(() => {
    if (paths.every(isResolvedUrl)) {
      setUrls(paths);
      return;
    }
    let cancelled = false;
    getImageUrlsPositional(paths)
      .then(u => !cancelled && setUrls(u))
      .catch(err => {
        console.error(err);
        reportError(err, {
          component: 'Load case images',
          where: 'getImageUrlsPositional → drive-images (get)',
          context: [`${paths.length} images · New Entry`],
        });
        if (!cancelled) setUrls(paths.map(() => null));
      });
    return () => {
      cancelled = true;
    };
  }, [paths]);

  if (paths.length === 0) return null;

  return (
    <>
      <div className="upload-meta">
        {paths.length} image{paths.length === 1 ? '' : 's'} already saved
      </div>
      <div className="upload-tiles">
        {paths.map((id, i) => (
          <div className="upload-tile" key={id}>
            {urls === null ? (
              <div className="upload-chip">Loading…</div>
            ) : urls[i] ? (
              <img className="upload-thumb" src={urls[i] as string} alt={`Saved image ${i + 1}`} />
            ) : (
              <div className="upload-chip">
                <span className="upload-chip-name">Image {i + 1}</span>
                <span className="upload-chip-size">preview unavailable</span>
              </div>
            )}
            <button
              type="button"
              className="upload-remove"
              aria-label={`Remove saved image ${i + 1}`}
              onClick={() => onRemove(i)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

function formatMB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

function isThumbnailable(file: File): boolean {
  const type = file.type.toLowerCase();
  return type === 'image/jpeg' || type === 'image/png';
}

export default function ImageUpload({ images, onAdd, onRemove, existing, onRemoveExisting }: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rejected, setRejected] = useState(false);
  const [converting, setConverting] = useState(false);

  const totalBytes = useMemo(() => images.reduce((sum, f) => sum + f.size, 0), [images]);
  const overLimit = totalBytes > MAX_IMAGES_TOTAL_BYTES;

  // Object URLs for JPG/PNG thumbnails; revoked when the file set changes.
  const previews = useMemo(
    () => images.map(f => (isThumbnailable(f) ? URL.createObjectURL(f) : null)),
    [images],
  );
  useEffect(() => {
    return () => previews.forEach(url => url && URL.revokeObjectURL(url));
  }, [previews]);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    const allowed = picked.filter(isAllowedImage);
    setRejected(allowed.length < picked.length);
    // Reset now so picking the same file again re-fires change.
    if (inputRef.current) inputRef.current.value = '';
    if (!allowed.length) return;
    // All on-device, before handing files up: convert HEIC → JPEG (so previews
    // work and JPEG is stored), then downscale/re-encode to shrink storage.
    // Nothing leaves the browser.
    setConverting(true);
    try {
      const converted = await convertHeicFiles(allowed);
      const resized = await resizeImages(converted);
      onAdd(resized);
    } finally {
      setConverting(false);
    }
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,.heic,.heif,image/heic,image/heif"
        multiple
        onChange={handleChange}
        style={{ display: 'none' }}
      />

      {existing && onRemoveExisting && <SavedImages paths={existing} onRemove={onRemoveExisting} />}

      <button
        type="button"
        className="upload-btn"
        onClick={() => inputRef.current?.click()}
        disabled={converting}
      >
        + Add images
      </button>

      <div className={`upload-meta ${overLimit ? 'over' : ''}`}>
        {converting
          ? 'Processing images…'
          : images.length > 0
            ? `${images.length} new file${images.length === 1 ? '' : 's'} · ${formatMB(totalBytes)} / 10 MB`
            : 'JPG, PNG, or HEIC · up to 10 MB total'}
      </div>

      {overLimit && (
        <div className="upload-error">Total image size exceeds 10 MB. Remove some images to save.</div>
      )}
      {rejected && (
        <div className="upload-error">Some files were skipped — only JPG, PNG, and HEIC are allowed.</div>
      )}

      {images.length > 0 && (
        <div className="upload-tiles">
          {images.map((file, i) => (
            <div className="upload-tile" key={`${file.name}-${file.size}-${i}`}>
              {previews[i] ? (
                <img className="upload-thumb" src={previews[i] as string} alt={file.name} />
              ) : (
                <div className="upload-chip" title={file.name}>
                  <span className="upload-chip-name">{file.name}</span>
                  <span className="upload-chip-size">{formatMB(file.size)} MB</span>
                </div>
              )}
              <button
                type="button"
                className="upload-remove"
                aria-label={`Remove ${file.name}`}
                onClick={() => onRemove(i)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
