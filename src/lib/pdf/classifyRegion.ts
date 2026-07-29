import { supabase } from '../supabaseClient';
import { normalizeLabel } from './stats';
import { allRegionLabelOptions } from './regionCategory';

const CLASSIFY_FN = 'classify-region';

/** Classifies free-text diagnosis/Q7/memo entries into an AO/OTA region
 *  bucket via a server-side DeepSeek call, for cases whose Q6 (aoCode) was
 *  left blank — resolveStructuredRegion (regionCategory.ts) always wins
 *  over this when a case does have a structured code.
 *
 *  Only the distinct combined-text entries are sent — no dates, hospital
 *  numbers, or fellow names ever leave the device for this call.
 *
 *  Best-effort like clusterLabels: any failure (offline, quota, malformed
 *  response, or a returned label outside the allowed set) resolves to an
 *  empty map, which makes topRegions bucket those cases as "Unclassified" —
 *  a slow or broken AI call must never block a PDF export. */
const CLASSIFY_TIMEOUT_MS = 8_000;

export async function classifyRegions(texts: string[]): Promise<Map<string, string>> {
  if (texts.length === 0) return new Map();
  const validLabels = new Set(allRegionLabelOptions());
  try {
    const invocation = supabase.functions.invoke<{ assignments?: Record<string, string> }>(CLASSIFY_FN, {
      body: { texts, regions: [...validLabels] },
    });
    const { data, error } = await Promise.race([
      invocation,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Region classification timed out after ${CLASSIFY_TIMEOUT_MS}ms`)), CLASSIFY_TIMEOUT_MS),
      ),
    ]);
    if (error || !data?.assignments) {
      if (error) console.error('Region classification failed:', error);
      return new Map();
    }
    const map = new Map<string, string>();
    for (const [raw, region] of Object.entries(data.assignments)) {
      if (typeof region === 'string' && validLabels.has(region)) {
        map.set(normalizeLabel(raw).key, region);
      }
    }
    return map;
  } catch (err) {
    console.error('Region classification failed:', err);
    return new Map();
  }
}
