import { clusterLabels } from './clusterLabels';
import { classifyRegions } from './classifyRegion';

export interface ExportAiResults {
  procClusters: Map<string, string>;
  regionMap: Map<string, string>;
  pediatricMap: Map<string, boolean>;
}

const cache = new Map<string, Promise<ExportAiResults>>();

/** Clustering/classification are each a DeepSeek round-trip. Awaiting them
 *  inside the export click consumes the browser's transient user activation,
 *  after which iOS refuses navigator.share() — which is what silently broke
 *  the staff export (many distinct labels => slow calls) while the fellow
 *  export, with few enough labels to skip the network entirely, kept
 *  working.
 *
 *  So the result is prefetched as soon as the selection is known and
 *  memoized per input set: by click time the promises are normally already
 *  resolved, and the share call happens while the tap still counts as user
 *  activation. */
export function clustersFor(procLabels: string[], aiTexts: string[]): Promise<ExportAiResults> {
  const key = JSON.stringify([procLabels, aiTexts]);
  let pending = cache.get(key);
  if (!pending) {
    pending = Promise.all([clusterLabels(procLabels), classifyRegions(aiTexts)])
      .then(([procClusters, { regionMap, pediatricMap }]) => ({ procClusters, regionMap, pediatricMap }))
      // Both calls are advisory: they only refine the summary's rankings.
      // Never let a failure here reject into the export and surface as a
      // "Could not export" error — degrade to exact-text ranking and to
      // whatever the deterministic region/age passes already decided.
      .catch(() => ({
        procClusters: new Map<string, string>(),
        regionMap: new Map<string, string>(),
        pediatricMap: new Map<string, boolean>(),
      }));
    cache.set(key, pending);
  }
  return pending;
}
