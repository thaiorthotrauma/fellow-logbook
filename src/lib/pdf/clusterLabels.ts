import { supabase } from '../supabaseClient';
import { normalizeLabel } from './stats';

const CLUSTER_FN = 'cluster-labels';

/** Groups synonymous free-text diagnosis/procedure labels (e.g. "ORIF" and
 *  "open reduction internal fixation", "LCP" and "locking compression
 *  plate") via a server-side DeepSeek call, so the PDF summary's top-5 ranking
 *  counts synonyms together instead of splitting them by exact wording.
 *
 *  Only the distinct label text is sent — no dates, hospital numbers, or
 *  fellow names ever leave the device for this call.
 *
 *  Best-effort like the Telegram/Drive calls elsewhere in the app: any
 *  failure (offline, quota, malformed response) resolves to an empty map,
 *  which makes topN's `clusters` argument a no-op — a slow or broken AI call
 *  must never block a PDF export. */
export async function clusterLabels(labels: string[]): Promise<Map<string, string>> {
  if (labels.length < 2) return new Map();
  try {
    const { data, error } = await supabase.functions.invoke<{ groups?: Record<string, string> }>(CLUSTER_FN, {
      body: { labels },
    });
    if (error || !data?.groups) {
      if (error) console.error('Label clustering failed:', error);
      return new Map();
    }
    const map = new Map<string, string>();
    for (const [raw, canonical] of Object.entries(data.groups)) {
      if (typeof canonical === 'string' && canonical.trim()) {
        map.set(normalizeLabel(raw).key, canonical);
      }
    }
    return map;
  } catch (err) {
    console.error('Label clustering failed:', err);
    return new Map();
  }
}
