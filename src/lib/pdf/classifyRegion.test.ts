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
    invoke.mockResolvedValueOnce({ data: { assignments: {} }, error: null });
    await classifyRegions(['distal radius fracture']);

    expect(invoke).toHaveBeenCalledTimes(1);
    const [fnName, options] = invoke.mock.calls[0];
    expect(fnName).toBe('classify-region');
    expect(Object.keys(options.body).sort()).toEqual(['regions', 'texts']);
    expect(options.body.texts).toEqual(['distal radius fracture']);
    expect(options.body.regions).toEqual(expect.arrayContaining(allRegionLabelOptions()));
  });

  it('skips the network call entirely for an empty input', async () => {
    const map = await classifyRegions([]);
    expect(map.size).toBe(0);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('falls back to an empty map when the call errors', async () => {
    invoke.mockResolvedValueOnce({ data: null, error: new Error('boom') });
    const map = await classifyRegions(['a']);
    expect(map.size).toBe(0);
  });

  it('falls back to an empty map when the response has no assignments', async () => {
    invoke.mockResolvedValueOnce({ data: {}, error: null });
    const map = await classifyRegions(['a']);
    expect(map.size).toBe(0);
  });

  it('discards an assignment outside the closed region list', async () => {
    invoke.mockResolvedValueOnce({
      data: { assignments: { 'weird entry': 'Not A Real Region' } },
      error: null,
    });
    const map = await classifyRegions(['weird entry']);
    expect(map.size).toBe(0);
  });

  it('falls back to an empty map when the call hangs, rather than stalling the export', async () => {
    vi.useFakeTimers();
    try {
      invoke.mockReturnValueOnce(new Promise(() => {}));
      const pending = classifyRegions(['a']);
      await vi.advanceTimersByTimeAsync(8_000);
      const map = await pending;
      expect(map.size).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('maps normalized keys to the assigned region from the response', async () => {
    invoke.mockResolvedValueOnce({
      data: { assignments: { 'Tibial plateau fracture': 'Tibia / Fibula (Leg) – Tibia – Proximal' } },
      error: null,
    });
    const map = await classifyRegions(['Tibial plateau fracture']);
    expect(map.get('tibial plateau fracture')).toBe('Tibia / Fibula (Leg) – Tibia – Proximal');
  });
});
