import { useEffect, useState } from 'react';
import { getImageUrls } from '../lib/casesApi';

/** Renders a case's saved images as thumbnails. Images live in the app's
 *  private Google Drive, so they're fetched back through the drive-images
 *  function on mount (i.e. when the card expands) and shown as data URLs.
 *  Tapping a thumbnail opens a full-screen lightbox — a new browser tab is
 *  unreliable inside LINE's in-app webview, so the viewer stays in-app. */
export default function CaseImages({ paths }: { paths: string[] }) {
  const [urls, setUrls] = useState<string[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [viewIndex, setViewIndex] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    getImageUrls(paths)
      .then(u => !cancelled && setUrls(u))
      .catch(err => {
        console.error(err);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [paths]);

  if (paths.length === 0) return null;

  return (
    <div className="case-images-block">
      <span className="case-images-label">Images</span>
      {failed ? (
        <span>Could not load images.</span>
      ) : !urls ? (
        <span>Loading…</span>
      ) : (
        <div className="case-images">
          {urls.map((url, i) => (
            <button key={i} type="button" className="case-image-link" onClick={() => setViewIndex(i)}>
              <img src={url} alt={`Case image ${i + 1}`} className="case-image-thumb" loading="lazy" />
            </button>
          ))}
        </div>
      )}

      {urls && viewIndex !== null && (
        <Lightbox urls={urls} index={viewIndex} onIndex={setViewIndex} onClose={() => setViewIndex(null)} />
      )}
    </div>
  );
}

interface LightboxProps {
  urls: string[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}

function Lightbox({ urls, index, onIndex, onClose }: LightboxProps) {
  const hasPrev = index > 0;
  const hasNext = index < urls.length - 1;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
      else if (e.key === 'ArrowRight' && index < urls.length - 1) onIndex(index + 1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, urls.length, onIndex, onClose]);

  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label="Image viewer" onClick={onClose}>
      <button type="button" className="lightbox-close" aria-label="Close" onClick={onClose}>
        ×
      </button>

      {hasPrev && (
        <button
          type="button"
          className="lightbox-nav prev"
          aria-label="Previous image"
          onClick={e => { e.stopPropagation(); onIndex(index - 1); }}
        >
          ‹
        </button>
      )}

      <img
        src={urls[index]}
        alt={`Case image ${index + 1}`}
        className="lightbox-image"
        onClick={e => e.stopPropagation()}
      />

      {hasNext && (
        <button
          type="button"
          className="lightbox-nav next"
          aria-label="Next image"
          onClick={e => { e.stopPropagation(); onIndex(index + 1); }}
        >
          ›
        </button>
      )}

      {urls.length > 1 && (
        <div className="lightbox-count">
          {index + 1} / {urls.length}
        </div>
      )}
    </div>
  );
}
