import { classifyRegions } from './classifyRegion';

export interface ExportAiResults {
  regionMap: Map<string, string>;
  pediatricMap: Map<string, boolean>;
}

const cache = new Map<string, Promise<ExportAiResults>>();

/** Classification is a DeepSeek round-trip. Awaiting it inside the export
 *  click consumes the browser's transient user activation, after which iOS
 *  refuses navigator.share() — which is what silently broke the staff export
 *  (many distinct texts => a slow call) while the fellow export, with few
 *  enough to skip the network entirely, kept working.
 *
 *  So the result is prefetched as soon as the selection is known and memoized
 *  per input set: by click time the promise is normally already resolved, and
 *  the share call happens while the tap still counts as user activation. */
export function clustersFor(aiTexts: string[]): Promise<ExportAiResults> {
  const key = JSON.stringify(aiTexts);
  let pending = cache.get(key);
  if (!pending) {
    pending = classifyRegions(aiTexts)
      // Advisory: it only refines the summary's region/pediatric buckets.
      // Never let a failure here reject into the export and surface as a
      // "Could not export" error — degrade to whatever the deterministic
      // passes in regionCategory.ts already decided.
      .catch(() => ({ regionMap: new Map<string, string>(), pediatricMap: new Map<string, boolean>() }));
    cache.set(key, pending);
  }
  return pending;
}
