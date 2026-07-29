import { afterEach, describe, expect, it, vi } from 'vitest';

// Mocked so these tests assert how often the (slow, network-bound)
// classification call is actually made — which is the whole point of the
// cache.
const { classifyRegions } = vi.hoisted(() => ({ classifyRegions: vi.fn() }));
vi.mock('./classifyRegion', () => ({ classifyRegions }));

import { clustersFor } from './clusterCache';

const emptyResult = () => ({ regionMap: new Map(), pediatricMap: new Map() });

describe('clustersFor', () => {
  afterEach(() => {
    classifyRegions.mockReset();
    vi.resetModules();
  });

  it('reuses the warm promise, so an export click awaits no new network call', async () => {
    classifyRegions.mockResolvedValue(emptyResult());
    const texts = ['ORIF of femur no code', 'acetabular fracture'];

    // The panel's useEffect prefetch, as soon as the selection is known.
    const prefetched = clustersFor(texts);
    await prefetched;
    const callsAfterPrefetch = classifyRegions.mock.calls.length;

    // The export click. This is the regression guard: if this awaited a fresh
    // round-trip it would burn the tap's user activation and iOS would refuse
    // navigator.share() — the original bug.
    const onClick = clustersFor(texts);

    expect(onClick).toBe(prefetched);
    expect(classifyRegions.mock.calls.length).toBe(callsAfterPrefetch);
  });

  it('keys on text content, not array identity, so re-renders reuse the cache', async () => {
    classifyRegions.mockResolvedValue(emptyResult());
    await clustersFor(['a', 'b']);
    const after = classifyRegions.mock.calls.length;

    // Fresh arrays with identical contents — what a React re-render produces.
    await clustersFor(['a', 'b']);
    expect(classifyRegions.mock.calls.length).toBe(after);
  });

  it('re-runs when the selection actually changes', async () => {
    classifyRegions.mockResolvedValue(emptyResult());
    await clustersFor(['a', 'b']);
    const after = classifyRegions.mock.calls.length;

    await clustersFor(['a', 'b', 'd']);
    expect(classifyRegions.mock.calls.length).toBeGreaterThan(after);
  });

  it('passes the texts through unchanged', async () => {
    classifyRegions.mockResolvedValue(emptyResult());
    await clustersFor(['text1', 'text2']);
    expect(classifyRegions).toHaveBeenCalledWith(['text1', 'text2']);
  });

  it('degrades to empty maps rather than rejecting into the export', async () => {
    classifyRegions.mockRejectedValue(new Error('deepseek down'));
    // Classification only refines the summary buckets, so a failure must never
    // surface as a "Could not export" error in generate()'s catch.
    const { regionMap, pediatricMap } = await clustersFor(['x']);
    expect(regionMap.size).toBe(0);
    expect(pediatricMap.size).toBe(0);
  });
});
