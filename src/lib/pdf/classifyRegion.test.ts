import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock the module rather than hit the real Supabase client (which throws
// without VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY set) — this also lets the
// assertions below inspect exactly what body classifyRegions sends over the
// wire, which is the whole point of this file: proving no case data beyond
// the given text strings ever leaves the device.
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('../supabaseClient', () => ({
  supabase: { functions: { invoke } },
}));

import { classifyRegions } from './classifyRegion';
import { allRegionLabelOptions } from './regionCategory';

describe('classifyRegions', () => {
  afterEach(() => {
    invoke.mockReset();
  });

  it('sends the edge function a body containing only `texts` and the closed `regions` list', async () => {
    invoke.mockResolvedValueOnce({ data: { assignments: {}, pediatric: {} }, error: null });
    await classifyRegions(['distal radius fracture']);

    expect(invoke).toHaveBeenCalledTimes(1);
    const [fnName, options] = invoke.mock.calls[0];
    expect(fnName).toBe('classify-region');
    expect(Object.keys(options.body).sort()).toEqual(['regions', 'texts']);
    expect(options.body.texts).toEqual(['distal radius fracture']);
    expect(options.body.regions).toEqual(expect.arrayContaining(allRegionLabelOptions()));
  });

  it('skips the network call entirely for an empty input', async () => {
    const { regionMap, pediatricMap } = await classifyRegions([]);
    expect(regionMap.size).toBe(0);
    expect(pediatricMap.size).toBe(0);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('falls back to empty maps when the call errors', async () => {
    invoke.mockResolvedValueOnce({ data: null, error: new Error('boom') });
    const { regionMap, pediatricMap } = await classifyRegions(['a']);
    expect(regionMap.size).toBe(0);
    expect(pediatricMap.size).toBe(0);
  });

  it('falls back to empty maps when the response is empty', async () => {
    invoke.mockResolvedValueOnce({ data: {}, error: null });
    const { regionMap, pediatricMap } = await classifyRegions(['a']);
    expect(regionMap.size).toBe(0);
    expect(pediatricMap.size).toBe(0);
  });

  it('discards a region outside the closed list while keeping that entry\'s pediatric verdict', async () => {
    invoke.mockResolvedValueOnce({
      data: { assignments: { 'weird entry': 'Not A Real Region' }, pediatric: { 'weird entry': true } },
      error: null,
    });
    const { regionMap, pediatricMap } = await classifyRegions(['weird entry']);
    expect(regionMap.size).toBe(0);
    expect(pediatricMap.get('weird entry')).toBe(true);
  });

  it('ignores a non-boolean pediatric value', async () => {
    invoke.mockResolvedValueOnce({
      data: { assignments: {}, pediatric: { 'weird entry': 'yes' } },
      error: null,
    });
    const { pediatricMap } = await classifyRegions(['weird entry']);
    expect(pediatricMap.size).toBe(0);
  });

  it('falls back to empty maps when the call hangs, rather than stalling the export', async () => {
    vi.useFakeTimers();
    try {
      invoke.mockReturnValueOnce(new Promise(() => {}));
      const pending = classifyRegions(['a']);
      await vi.advanceTimersByTimeAsync(8_000);
      const { regionMap, pediatricMap } = await pending;
      expect(regionMap.size).toBe(0);
      expect(pediatricMap.size).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('maps normalized keys to the assigned region and pediatric verdict', async () => {
    invoke.mockResolvedValueOnce({
      data: {
        assignments: { 'Tibial plateau fracture': 'Tibia / Fibula (Leg) – Tibia – Proximal' },
        pediatric: { 'Tibial plateau fracture': true },
      },
      error: null,
    });
    const { regionMap, pediatricMap } = await classifyRegions(['Tibial plateau fracture']);
    expect(regionMap.get('tibial plateau fracture')).toBe('Tibia / Fibula (Leg) – Tibia – Proximal');
    expect(pediatricMap.get('tibial plateau fracture')).toBe(true);
  });
});
