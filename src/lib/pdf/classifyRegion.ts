import { supabase } from '../supabaseClient';
import { reportDegraded } from '../errorReport';
import { normalizeLabel } from './stats';
import { allRegionLabelOptions } from './regionCategory';

const CLASSIFY_FN = 'classify-region';

export interface RegionClassification {
  /** normalized text key → AO/OTA region label. */
  regionMap: Map<string, string>;
  /** normalized text key → whether the text describes a pediatric patient. */
  pediatricMap: Map<string, boolean>;
}

const empty = (): RegionClassification => ({ regionMap: new Map(), pediatricMap: new Map() });

/** Reads free-text diagnosis/Q7/memo entries via a server-side DeepSeek call,
 *  answering the two questions the deterministic passes in regionCategory.ts
 *  left open for a given text:
 *
 *   - which AO/OTA region it describes, for cases whose Q6 (aoCode) resolved
 *     to nothing — resolveStructuredRegion always wins over this.
 *   - whether the patient is pediatric, for text stating no explicit age —
 *     detectAge always wins over this. This is the half a regex cannot do:
 *     "infant", "toddler", "เด็กชาย" name a child without naming a number.
 *
 *  Only the distinct combined-text entries are sent — no dates, hospital
 *  numbers, or fellow names ever leave the device for this call.
 *
 *  Best-effort: any failure (offline, quota, malformed
 *  response, or a region outside the allowed set) resolves to empty maps,
 *  which leaves every case exactly where the deterministic passes put it —
 *  a slow or broken AI call must never block a PDF export. */
const CLASSIFY_TIMEOUT_MS = 8_000;

export async function classifyRegions(texts: string[]): Promise<RegionClassification> {
  if (texts.length === 0) return empty();
  const validLabels = new Set(allRegionLabelOptions());
  try {
    const invocation = supabase.functions.invoke<{
      assignments?: Record<string, string>;
      pediatric?: Record<string, boolean>;
    }>(CLASSIFY_FN, {
      body: { texts, regions: [...validLabels] },
    });
    const { data, error } = await Promise.race([
      invocation,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Region classification timed out after ${CLASSIFY_TIMEOUT_MS}ms`)), CLASSIFY_TIMEOUT_MS),
      ),
    ]);
    if (error || !data) {
      if (error) {
        console.error('Region classification failed:', error);
        reportDegraded(error, {
          component: 'Region classification',
          where: 'classifyRegions → classify-region',
          context: [`${texts.length} labels · export fell back to deterministic labels`],
        });
      }
      return empty();
    }

    const out = empty();
    for (const [raw, region] of Object.entries(data.assignments ?? {})) {
      if (typeof region === 'string' && validLabels.has(region)) {
        out.regionMap.set(normalizeLabel(raw).key, region);
      }
    }
    for (const [raw, pediatric] of Object.entries(data.pediatric ?? {})) {
      if (typeof pediatric === 'boolean') out.pediatricMap.set(normalizeLabel(raw).key, pediatric);
    }
    return out;
  } catch (err) {
    console.error('Region classification failed:', err);
    reportDegraded(err, {
      component: 'Region classification',
      where: 'classifyRegions → classify-region',
      context: [`${texts.length} labels · export fell back to deterministic labels`],
    });
    return empty();
  }
}
