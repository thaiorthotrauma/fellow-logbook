import { afterEach, describe, expect, it, vi } from 'vitest';

// Mocked so these tests assert how often the (slow, network-bound) clustering
// / classification calls are actually made — which is the whole point of the
// cache.
const { clusterLabels, classifyRegions } = vi.hoisted(() => ({
  clusterLabels: vi.fn(),
  classifyRegions: vi.fn(),
}));
vi.mock('./clusterLabels', () => ({ clusterLabels }));
vi.mock('./classifyRegion', () => ({ classifyRegions }));

import { clustersFor } from './clusterCache';

describe('clustersFor', () => {
  afterEach(() => {
    clusterLabels.mockReset();
    classifyRegions.mockReset();
    vi.resetModules();
  });

  it('reuses the warm promise, so an export click awaits no new network call', async () => {
    clusterLabels.mockResolvedValue(new Map());
    classifyRegions.mockResolvedValue(new Map());
    const proc = ['plate', 'plating'];
    const unclassified = ['ORIF of femur no code'];

    // The panel's useEffect prefetch, as soon as the selection is known.
    const prefetched = clustersFor(proc, unclassified);
    await prefetched;
    const callsAfterPrefetch = clusterLabels.mock.calls.length + classifyRegions.mock.calls.length;

    // The export click. This is the regression guard: if this awaited a fresh
    // round-trip it would burn the tap's user activation and iOS would refuse
    // navigator.share() — the original bug.
    const onClick = clustersFor(proc, unclassified);

    expect(onClick).toBe(prefetched);
    expect(clusterLabels.mock.calls.length + classifyRegions.mock.calls.length).toBe(callsAfterPrefetch);
  });

  it('keys on label content, not array identity, so re-renders reuse the cache', async () => {
    clusterLabels.mockResolvedValue(new Map());
    classifyRegions.mockResolvedValue(new Map());
    await clustersFor(['c'], ['a', 'b']);
    const after = clusterLabels.mock.calls.length;

    // Fresh arrays with identical contents — what a React re-render produces.
    await clustersFor(['c'], ['a', 'b']);
    expect(clusterLabels.mock.calls.length).toBe(after);
  });

  it('re-runs when the selection actually changes', async () => {
    clusterLabels.mockResolvedValue(new Map());
    classifyRegions.mockResolvedValue(new Map());
    await clustersFor(['c'], ['a', 'b']);
    const after = clusterLabels.mock.calls.length;

    await clustersFor(['c'], ['a', 'b', 'd']);
    expect(classifyRegions.mock.calls.length).toBeGreaterThan(0);
    expect(clusterLabels.mock.calls.length).toBeGreaterThan(after);
  });

  it('passes procedure labels and unclassified region texts through to their own calls', async () => {
    clusterLabels.mockResolvedValue(new Map());
    classifyRegions.mockResolvedValue(new Map());
    await clustersFor(['proc1', 'proc2'], ['text1', 'text2']);

    expect(clusterLabels).toHaveBeenCalledWith(['proc1', 'proc2']);
    expect(classifyRegions).toHaveBeenCalledWith(['text1', 'text2']);
  });

  it('degrades to empty maps rather than rejecting into the export', async () => {
    clusterLabels.mockRejectedValue(new Error('deepseek down'));
    classifyRegions.mockRejectedValue(new Error('deepseek down'));
    // Clustering/classification only refine rankings, so a failure must never
    // surface as a "Could not export" error in generate()'s catch.
    const { procClusters, regionMap } = await clustersFor(['z'], ['x']);
    expect(procClusters.size).toBe(0);
    expect(regionMap.size).toBe(0);
  });
});
