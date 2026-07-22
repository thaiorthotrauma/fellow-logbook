import { useEffect, useMemo, useRef, useState } from 'react';
import { isAllowedImage, MAX_IMAGES_TOTAL_BYTES } from '../lib/casesApi';
import { convertHeicFiles } from '../lib/heic';

interface ImageUploadProps {
  images: File[];
  onAdd: (files: File[]) => void;
  onRemove: (index: number) => void;
}

function formatMB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

function isThumbnailable(file: File): boolean {
  const type = file.type.toLowerCase();
  return type === 'image/jpeg' || type === 'image/png';
}

export default function ImageUpload({ images, onAdd, onRemove }: ImageUploadProps) {
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
    // Convert any HEIC to JPEG in-browser before handing files up, so previews
    // work and JPEG is what gets stored. Nothing leaves the device.
    setConverting(true);
    try {
      const converted = await convertHeicFiles(allowed);
      onAdd(converted);
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
          ? 'Converting images…'
          : images.length > 0
            ? `${images.length} file${images.length === 1 ? '' : 's'} · ${formatMB(totalBytes)} / 10 MB`
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
