import { clusterLabels } from './clusterLabels';
import { classifyRegions } from './classifyRegion';

export interface ExportAiResults {
  procClusters: Map<string, string>;
  regionMap: Map<string, string>;
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
export function clustersFor(procLabels: string[], unclassifiedRegionTexts: string[]): Promise<ExportAiResults> {
  const key = JSON.stringify([procLabels, unclassifiedRegionTexts]);
  let pending = cache.get(key);
  if (!pending) {
    pending = Promise.all([clusterLabels(procLabels), classifyRegions(unclassifiedRegionTexts)])
      .then(([procClusters, regionMap]) => ({ procClusters, regionMap }))
      // Both calls are advisory: they only refine the summary's rankings.
      // Never let a failure here reject into the export and surface as a
      // "Could not export" error — degrade to exact-text ranking / an
      // "Unclassified" bucket instead.
      .catch(() => ({ procClusters: new Map<string, string>(), regionMap: new Map<string, string>() }));
    cache.set(key, pending);
  }
  return pending;
}
