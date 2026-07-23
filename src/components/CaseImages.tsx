import { useEffect, useState } from 'react';
import { getImageUrls } from '../lib/casesApi';

/** Renders a case's saved images as thumbnail links. Images live in the app's
 *  private Google Drive, so they're fetched back through the drive-images
 *  function on mount (i.e. when the card expands) and shown as data URLs. */
export default function CaseImages({ paths }: { paths: string[] }) {
  const [urls, setUrls] = useState<string[] | null>(null);
  const [failed, setFailed] = useState(false);

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
    <div className="full">
      <span className="k">Images: </span>
      {failed ? (
        <span>Could not load images.</span>
      ) : !urls ? (
        <span>Loading…</span>
      ) : (
        <div className="case-images">
          {urls.map((url, i) => (
            <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="case-image-link">
              <img src={url} alt={`Case image ${i + 1}`} className="case-image-thumb" loading="lazy" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
