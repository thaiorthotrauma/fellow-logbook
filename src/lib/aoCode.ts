import { GROUP_OPTS, REGIONS, TYPE_OPTS } from '../data';
import { emptyAo, type AoState } from '../types';

// Reverse of logic.ts `computeAoCode`. A case row stores only the flat code
// ("33-A2") plus the region's display name, but re-opening the AO picker for an
// edit needs the structured selection back (region / bone / segment / subtype /
// type / group). Kept pure and free of React so it stays unit-testable.

/** computeAoCode appends "-<type><group?>"; no region, segment or subtype code
 *  contains a "-", so a trailing suffix is unambiguous to split off. */
const SUFFIX_RE = new RegExp(
  `^(.*)-([${TYPE_OPTS.map(t => t.code).join('')}])([${GROUP_OPTS.join('')}])?$`,
);

/** Which region (and, where applicable, bone) produced a code's base part. */
interface BaseMatch {
  regionKey: string;
  boneKey: string | null;
  segmentCode: string | null;
  subtypeCode: string | null;
}

/** Locates the base code among the regions' segments, per-bone segments and
 *  subtypes, falling back to a bare region code (i.e. the fellow picked a
 *  region but no segment). Returns null when nothing matches. */
function matchBase(base: string): BaseMatch | null {
  for (const region of REGIONS) {
    if (region.segments?.some(s => s.code === base)) {
      return { regionKey: region.key, boneKey: null, segmentCode: base, subtypeCode: null };
    }
    for (const bone of region.bones ?? []) {
      if (bone.segments.some(s => s.code === base)) {
        return { regionKey: region.key, boneKey: bone.key, segmentCode: base, subtypeCode: null };
      }
    }
    if (region.subtypes?.some(s => s.code === base)) {
      return { regionKey: region.key, boneKey: null, segmentCode: null, subtypeCode: base };
    }
  }
  const region = REGIONS.find(r => r.code === base);
  if (region) return { regionKey: region.key, boneKey: null, segmentCode: null, subtypeCode: null };
  return null;
}

/** A stored AO/OTA code + region label → the picker state that produced it.
 *  Returns an empty selection for an empty code (a case classified only via
 *  Q7). An unrecognized code keeps its text but selects nothing, so editing
 *  such a case surfaces the code rather than silently discarding it. */
export function parseAoCode(aoCode: string, aoRegionLabel: string): AoState {
  const code = aoCode.trim();
  if (!code) return emptyAo();

  const suffix = SUFFIX_RE.exec(code);
  const base = suffix ? suffix[1] : code;
  const type = suffix ? suffix[2] : null;
  const group = suffix?.[3] ?? null;

  const matched =
    matchBase(base) ??
    // Region names are stable, so fall back to the stored label when the base
    // itself is unrecognizable.
    (() => {
      const byName = REGIONS.find(r => r.name === aoRegionLabel.trim());
      return byName
        ? { regionKey: byName.key, boneKey: null, segmentCode: null, subtypeCode: null }
        : null;
    })();

  if (!matched) return { ...emptyAo(), code };
  return { ...matched, type, group, code };
}
