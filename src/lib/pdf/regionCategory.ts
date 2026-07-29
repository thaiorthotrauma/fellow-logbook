import { REGIONS } from '../../data';
import { parseAoCode } from '../aoCode';
import { normalizeLabel } from './stats';
import type { RankItem } from './stats';
import type { CaseEntry } from '../../types';

// Categorizes a case into an AO/OTA region+bone(+segment) bucket for the PDF
// summary's "Top 5 Operated Regions" ranking (formerly "Top 5 Diagnoses").
//
// Resolution order per case:
//  1. Structured Q6 (aoCode) — deterministic, via the same parseAoCode used
//     to reopen the AO picker for editing. Wins whenever present.
//  2. AI classification of the leftover free text (diagnosis + Q7 + memo),
//     for every case step 1 could not resolve — see classifyRegion.ts.
//     Advisory, like the procedure clustering it sits next to.
//  3. "Unclassified", when neither resolves.
//
// The pediatric tag is orthogonal to all of that: an AO/OTA code says
// nothing about age, so a case with a perfectly-filled Q6 can still be
// pediatric. It runs the same deterministic-first shape — an explicit age
// marker (detectAge) decides outright, and only text that states no age at
// all falls through to the AI, which can read "infant"/"เด็กชาย" where a
// number-anchored regex cannot.
//
// Laterality (left/right/bilateral) carries no region information and is
// deliberately never part of the categories below — only the AI step needs
// to ignore it in free text, since the structured code never encodes side.

/** Strips a segment option's trailing "(41)" code suffix for display. */
function segmentDisplayLabel(label: string): string {
  return label.replace(/\s*\([^)]*\)\s*$/, '');
}

export interface RegionLabel {
  /** Stable grouping key — distinct buckets never collide, unlike `label`
   *  which is display text a fellow might title-case differently. */
  key: string;
  label: string;
}

/** Q6 resolution: a case's aoCode/aoRegionLabel → its region bucket. Null
 *  when Q6 was left blank, and also when a stored code parses to no region
 *  this app knows — both are cases the AI step has to fall back on. */
export function resolveStructuredRegion(c: CaseEntry): RegionLabel | null {
  if (!c.aoCode.trim()) return null;
  const ao = parseAoCode(c.aoCode, c.aoRegionLabel);
  const region = REGIONS.find(r => r.key === ao.regionKey);
  if (!region) return null;

  if (ao.boneKey) {
    const bone = region.bones?.find(b => b.key === ao.boneKey);
    if (!bone) return { key: region.key, label: region.name };
    const seg = bone.segments.find(s => s.code === ao.segmentCode);
    return seg
      ? { key: `${region.key}:${bone.key}:${seg.code}`, label: `${region.name} – ${bone.label} – ${segmentDisplayLabel(seg.label)}` }
      : { key: `${region.key}:${bone.key}`, label: `${region.name} – ${bone.label}` };
  }

  if (ao.segmentCode) {
    const seg = region.segments?.find(s => s.code === ao.segmentCode);
    if (seg) return { key: `${region.key}:${seg.code}`, label: `${region.name} – ${segmentDisplayLabel(seg.label)}` };
  }

  if (ao.subtypeCode) {
    const sub = region.subtypes?.find(s => s.code === ao.subtypeCode);
    if (sub) return { key: `${region.key}:${sub.code}`, label: `${region.name} – ${sub.label}` };
  }

  return { key: region.key, label: region.name };
}

/** Every valid region/bone/segment display label, in the same "Region –
 *  Bone – Segment" shape resolveStructuredRegion produces. This is the
 *  closed list the AI classification step must choose from — sent as the
 *  prompt's allowed answers and re-validated against on the response, so a
 *  model can never invent a category outside AO/OTA. */
export function allRegionLabelOptions(): string[] {
  const out: string[] = [];
  for (const region of REGIONS) {
    // The bare region name is always an option, including for the two
    // bone-split regions: a fellow can pick Forearm or Tibia/Fibula without
    // narrowing to a bone, which resolveStructuredRegion renders as the
    // region name alone. Leaving it out would make that a bucket the AI
    // could never assign to but Q6 could still produce.
    out.push(region.name);
    for (const bone of region.bones ?? []) {
      out.push(`${region.name} – ${bone.label}`);
      for (const seg of bone.segments) out.push(`${region.name} – ${bone.label} – ${segmentDisplayLabel(seg.label)}`);
    }
    for (const seg of region.segments ?? []) out.push(`${region.name} – ${segmentDisplayLabel(seg.label)}`);
    for (const sub of region.subtypes ?? []) out.push(`${region.name} – ${sub.label}`);
  }
  return out;
}

/** The free text worth classifying for a case: diagnosis, Q7 (other
 *  classification), and memo combined — everything a fellow might have
 *  named a bone or joint in, besides the structured Q6 code. */
export function regionSourceText(c: CaseEntry): string {
  return [c.diagnosis, c.otherClassification, c.memo].filter(Boolean).join(' ');
}

/** The distinct normalized source texts worth sending to the AI call — one
 *  entry per underlying wording rather than per case (mirrors uniqueLabels
 *  in stats.ts). A text is worth sending when the deterministic passes left
 *  either question open:
 *
 *   - region, when resolveStructuredRegion returned null. Note the predicate
 *     is that call, not "aoCode is blank": a case can carry a code that
 *     parses to no known region (legacy, hand-edited, or a stored region
 *     label that no longer matches), and regionBucketLabel falls through to
 *     the AI map for exactly those — keying off aoCode would leave their
 *     text unsent and strand them in "Unclassified".
 *   - age, when detectAge returned 'unknown'. A text stating an explicit age
 *     either way ("12 YO", "65 YO") is already settled and is not sent. */
export function uniqueAiTexts(cases: CaseEntry[]): string[] {
  const seen = new Map<string, string>();
  for (const c of cases) {
    const raw = regionSourceText(c);
    if (!raw.trim()) continue;
    const needsRegion = resolveStructuredRegion(c) === null;
    const needsAge = detectAge(raw) === 'unknown';
    if (!needsRegion && !needsAge) continue;
    const { key, label } = normalizeLabel(raw);
    if (!seen.has(key)) seen.set(key, label);
  }
  return [...seen.values()];
}

const PEDIATRIC_AGE_THRESHOLD = 16;

// Explicit age-in-months markers are always pediatric, no threshold needed:
// "8 mo", "8 months old".
//
// "N months" on its own is deliberately NOT a match: in an operative memo a
// bare month count is far more often a duration ("ORIF 12 months post-op",
// "6 เดือน post op") than an age, and mislabelling an adult case pediatric is
// worse than missing a genuinely pediatric one. Thai ages in months are still
// caught, via the "อายุ N" particle in AGE_YEARS_RE below.
const AGE_MONTHS_RE = /\b(\d{1,3})\s*(?:mo\.?\b|months?\s*old\b)/gi;
// Explicit age-in-years markers, compared against the threshold: "12 yo",
// "12 y/o", "12 yrs", "12 years old", "aged 12", "อายุ 12", "12 ปี". Deliberately
// anchored to these age-marker words/particles so a bare number — "3.5 mm
// plate", "12 hole LCP", "33-A2" — is never mistaken for an age.
const AGE_YEARS_RE =
  /\b(\d{1,3})\s*(?:y\.?\/?o\.?\b|yo\b|yrs?\b|years?\s*old\b)|\baged\s*(\d{1,3})\b|อายุ\s*(\d{1,3})|(\d{1,3})\s*ปี/gi;

/** 'pediatric' / 'adult' when the text states an age outright, 'unknown'
 *  when it says nothing this pass can anchor to. */
export type AgeVerdict = 'pediatric' | 'adult' | 'unknown';

/** The deterministic age pass over diagnosis/Q7/memo text — pass
 *  regionSourceText(c) in. Decides only on an explicit marker: under 16
 *  years or an age in months is 'pediatric', a stated age at or above the
 *  threshold is 'adult', and anything else is 'unknown'.
 *
 *  'unknown' is the interesting case, and the reason this is tri-state
 *  rather than a boolean: every pattern here is anchored to a number, so
 *  text naming a child in words alone ("infant", "toddler", "เด็กชาย") reads
 *  as 'unknown', not 'adult'. Those texts are the ones handed to the AI pass
 *  (see uniqueAiTexts / classifyRegions), which can read the language a
 *  regex structurally cannot. A verdict of 'pediatric' or 'adult' here is
 *  final and never overridden — an explicit age is precise by construction,
 *  and keeping it deterministic is what stops a model from re-labelling a
 *  stated 65-year-old between two exports of the same range. */
export function detectAge(text: string): AgeVerdict {
  if (!text.trim()) return 'unknown';
  for (const _ of text.matchAll(AGE_MONTHS_RE)) return 'pediatric';
  let sawAge = false;
  for (const m of text.matchAll(AGE_YEARS_RE)) {
    const raw = m[1] ?? m[2] ?? m[3] ?? m[4];
    const n = raw ? Number(raw) : NaN;
    if (Number.isNaN(n)) continue;
    sawAge = true;
    if (n < PEDIATRIC_AGE_THRESHOLD) return 'pediatric';
  }
  return sawAge ? 'adult' : 'unknown';
}

/** Whether the deterministic pass alone calls this text pediatric. The AI
 *  fallback for 'unknown' text lives in regionBucketLabel. */
export function isPediatric(text: string): boolean {
  return detectAge(text) === 'pediatric';
}

const UNCLASSIFIED = 'Unclassified';

/** Resolves a case's display bucket. Both halves are deterministic-first,
 *  AI-second, and both AI maps are keyed by
 *  normalizeLabel(regionSourceText(c)).key, as produced by classifyRegions:
 *
 *   - region: structured Q6, else `aiMap`, else "Unclassified".
 *   - pediatric: detectAge when it reached a verdict, else `pediatricMap`,
 *     else no tag.
 *
 *  A pediatric case is suffixed " (pediatric)" so a fellow's adult and
 *  pediatric case mix in the same region ranks as two distinct rows rather
 *  than one merged, misleading count. */
export function regionBucketLabel(
  c: CaseEntry,
  aiMap?: ReadonlyMap<string, string>,
  pediatricMap?: ReadonlyMap<string, boolean>,
): string {
  const structured = resolveStructuredRegion(c);
  const sourceText = regionSourceText(c);
  const textKey = sourceText.trim() ? normalizeLabel(sourceText).key : '';

  let label: string;
  if (structured) label = structured.label;
  else if (textKey) label = aiMap?.get(textKey) ?? UNCLASSIFIED;
  else label = UNCLASSIFIED;

  const verdict = detectAge(sourceText);
  const pediatric =
    verdict === 'unknown' ? (textKey ? (pediatricMap?.get(textKey) ?? false) : false) : verdict === 'pediatric';

  return pediatric ? `${label} (pediatric)` : label;
}

/** Top `n` most frequent AO/OTA region buckets across `cases` — the
 *  "Top 5 Operated Regions" ranking. Ties break alphabetically for a
 *  deterministic order, same convention as topN in stats.ts. */
export function topRegions(
  cases: CaseEntry[],
  n: number,
  aiMap?: ReadonlyMap<string, string>,
  pediatricMap?: ReadonlyMap<string, boolean>,
): RankItem[] {
  const map = new Map<string, RankItem>();
  for (const c of cases) {
    const label = regionBucketLabel(c, aiMap, pediatricMap);
    const groupKey = label.toLowerCase();
    const existing = map.get(groupKey);
    if (existing) existing.count += 1;
    else map.set(groupKey, { label, count: 1 });
  }
  return [...map.values()]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, n);
}
