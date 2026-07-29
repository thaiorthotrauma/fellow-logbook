import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock the module rather than hit the real Supabase client (which throws
// without VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY set) — this also lets the
// assertions below inspect exactly what body clusterLabels sends over the
// wire, which is the whole point of this test file: proving no case data
// beyond the given label strings ever leaves the device.
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('../supabaseClient', () => ({
  supabase: { functions: { invoke } },
}));

import { clusterLabels } from './clusterLabels';

describe('clusterLabels', () => {
  afterEach(() => {
    invoke.mockReset();
  });

  it('sends the edge function a body containing only `labels` — no dates, HN, staff, or fellow name', async () => {
    invoke.mockResolvedValueOnce({ data: { groups: { ORIF: 'ORIF' } }, error: null });
    await clusterLabels(['ORIF', 'Open reduction internal fixation']);

    expect(invoke).toHaveBeenCalledTimes(1);
    const [fnName, options] = invoke.mock.calls[0];
    expect(fnName).toBe('cluster-labels');
    // The request body's only key is `labels` — asserting the exact key set
    // (not just that `labels` is present) so a future edit that starts
    // smuggling e.g. `hn` or `fellowName` into this call fails a test instead
    // of shipping quietly.
    expect(Object.keys(options.body)).toEqual(['labels']);
    expect(options.body.labels).toEqual(['ORIF', 'Open reduction internal fixation']);
  });

  it('skips the network call entirely for fewer than 2 labels', async () => {
    const map = await clusterLabels(['ORIF']);
    expect(map.size).toBe(0);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('falls back to an empty map (exact-text ranking) when the call errors', async () => {
    invoke.mockResolvedValueOnce({ data: null, error: new Error('boom') });
    const map = await clusterLabels(['a', 'b']);
    expect(map.size).toBe(0);
  });

  it('falls back to an empty map when the response has no groups', async () => {
    invoke.mockResolvedValueOnce({ data: {}, error: null });
    const map = await clusterLabels(['a', 'b']);
    expect(map.size).toBe(0);
  });

  it('falls back to an empty map when the call hangs, rather than stalling the export', async () => {
    vi.useFakeTimers();
    try {
      // Never settles — a wedged DeepSeek call. Without the timeout this would
      // hang the export click indefinitely.
      invoke.mockReturnValueOnce(new Promise(() => {}));
      const pending = clusterLabels(['a', 'b']);
      await vi.advanceTimersByTimeAsync(8_000);
      const map = await pending;
      expect(map.size).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('maps normalized keys to the canonical label from the response', async () => {
    invoke.mockResolvedValueOnce({
      data: { groups: { ORIF: 'Open reduction internal fixation', 'Open reduction internal fixation': 'Open reduction internal fixation' } },
      error: null,
    });
    const map = await clusterLabels(['ORIF', 'Open reduction internal fixation']);
    expect(map.get('orif')).toBe('Open reduction internal fixation');
  });
});
