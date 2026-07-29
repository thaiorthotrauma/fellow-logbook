import { afterEach, describe, expect, it, vi } from 'vitest';

// Mocked so these tests assert how often the (slow, network-bound) clustering
// call is actually made — which is the whole point of the cache.
const { clusterLabels } = vi.hoisted(() => ({ clusterLabels: vi.fn() }));
vi.mock('./clusterLabels', () => ({ clusterLabels }));

import { clustersFor } from './clusterCache';

describe('clustersFor', () => {
  afterEach(() => {
    clusterLabels.mockReset();
    vi.resetModules();
  });

  it('reuses the warm promise, so an export click awaits no new network call', async () => {
    clusterLabels.mockResolvedValue(new Map());
    const dx = ['ORIF', 'ORIF of femur'];
    const proc = ['plate', 'plating'];

    // The panel's useEffect prefetch, as soon as the selection is known.
    const prefetched = clustersFor(dx, proc);
    await prefetched;
    const callsAfterPrefetch = clusterLabels.mock.calls.length;

    // The export click. This is the regression guard: if this awaited a fresh
    // round-trip it would burn the tap's user activation and iOS would refuse
    // navigator.share() — the original bug.
    const onClick = clustersFor(dx, proc);

    expect(onClick).toBe(prefetched);
    expect(clusterLabels.mock.calls.length).toBe(callsAfterPrefetch);
  });

  it('keys on label content, not array identity, so re-renders reuse the cache', async () => {
    clusterLabels.mockResolvedValue(new Map());
    await clustersFor(['a', 'b'], ['c']);
    const after = clusterLabels.mock.calls.length;

    // Fresh arrays with identical contents — what a React re-render produces.
    await clustersFor(['a', 'b'], ['c']);
    expect(clusterLabels.mock.calls.length).toBe(after);
  });

  it('re-clusters when the selection actually changes', async () => {
    clusterLabels.mockResolvedValue(new Map());
    await clustersFor(['a', 'b'], ['c']);
    const after = clusterLabels.mock.calls.length;

    await clustersFor(['a', 'b', 'd'], ['c']);
    expect(clusterLabels.mock.calls.length).toBeGreaterThan(after);
  });

  it('passes diagnosis and procedure labels through as their own groupings', async () => {
    clusterLabels.mockResolvedValue(new Map());
    await clustersFor(['dx1', 'dx2'], ['proc1', 'proc2']);

    expect(clusterLabels).toHaveBeenCalledWith(['dx1', 'dx2']);
    expect(clusterLabels).toHaveBeenCalledWith(['proc1', 'proc2']);
  });

  it('degrades to empty maps rather than rejecting into the export', async () => {
    clusterLabels.mockRejectedValue(new Error('deepseek down'));
    // Clustering only refines a ranking, so a failure must never surface as a
    // "Could not export" error in generate()'s catch.
    const [dx, proc] = await clustersFor(['x', 'y'], ['z']);
    expect(dx.size).toBe(0);
    expect(proc.size).toBe(0);
  });
});
