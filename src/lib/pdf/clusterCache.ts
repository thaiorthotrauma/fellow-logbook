import { clusterLabels } from './clusterLabels';

export type ClusterPair = [Map<string, string>, Map<string, string>];

const cache = new Map<string, Promise<ClusterPair>>();

/** Clustering is two DeepSeek round-trips. Awaiting them inside the export
 *  click consumes the browser's transient user activation, after which iOS
 *  refuses navigator.share() — which is what silently broke the staff export
 *  (many distinct labels => slow call) while the fellow export, with few
 *  enough labels to skip the network entirely, kept working.
 *
 *  So the result is prefetched as soon as the selection is known and memoized
 *  per label set: by click time the promise is normally already resolved, and
 *  the share call happens while the tap still counts as user activation. */
export function clustersFor(dxLabels: string[], procLabels: string[]): Promise<ClusterPair> {
  const key = JSON.stringify([dxLabels, procLabels]);
  let pending = cache.get(key);
  if (!pending) {
    pending = Promise.all([clusterLabels(dxLabels), clusterLabels(procLabels)]) as Promise<ClusterPair>;
    // A rejection here would be unhandled until the export awaits it; the
    // underlying calls already degrade to empty maps, so this is belt-and-braces.
    pending.catch(() => {});
    cache.set(key, pending);
  }
  return pending;
}
