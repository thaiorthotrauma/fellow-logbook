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

/** The distinct normalized source texts of cases Q6 could not resolve — the
 *  small set actually worth sending to the AI classification call, instead
 *  of one entry per case (mirrors uniqueLabels in stats.ts).
 *
 *  The predicate is resolveStructuredRegion, not "aoCode is blank": a case
 *  can carry an aoCode that parses to no known region (a legacy or
 *  hand-edited code, or a region whose stored label no longer matches).
 *  regionBucketLabel falls through to the AI map for exactly those cases, so
 *  keying off aoCode here would leave their text unsent and strand them in
 *  "Unclassified" no matter what the model would have said. */
export function uniqueUnclassifiedTexts(cases: CaseEntry[]): string[] {
  const seen = new Map<string, string>();
  for (const c of cases) {
    if (resolveStructuredRegion(c)) continue;
    const raw = regionSourceText(c);
    if (!raw.trim()) continue;
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

/** Whether an explicit age marker in the text names a pediatric patient:
 *  under 16 years, or an age stated in months ("8 mo", "18 months old").
 *  Scans diagnosis/Q7/memo text — pass regionSourceText(c) in. */
export function isPediatric(text: string): boolean {
  if (!text.trim()) return false;
  for (const _ of text.matchAll(AGE_MONTHS_RE)) return true;
  for (const m of text.matchAll(AGE_YEARS_RE)) {
    const raw = m[1] ?? m[2] ?? m[3] ?? m[4];
    const n = raw ? Number(raw) : NaN;
    if (!Number.isNaN(n) && n < PEDIATRIC_AGE_THRESHOLD) return true;
  }
  return false;
}

const UNCLASSIFIED = 'Unclassified';

/** Resolves a case's display bucket: structured Q6 first, else the AI
 *  region map (keyed by normalizeLabel(regionSourceText(c)).key, as produced
 *  by classifyRegions), else "Unclassified" — always suffixed with
 *  " (pediatric)" when an explicit pediatric age marker is present, so a
 *  fellow's adult and pediatric case mix in the same region ranks as two
 *  distinct rows rather than one merged, misleading count. */
export function regionBucketLabel(c: CaseEntry, aiMap?: ReadonlyMap<string, string>): string {
  const structured = resolveStructuredRegion(c);
  const sourceText = regionSourceText(c);
  let label: string;
  if (structured) {
    label = structured.label;
  } else if (sourceText.trim()) {
    label = aiMap?.get(normalizeLabel(sourceText).key) ?? UNCLASSIFIED;
  } else {
    label = UNCLASSIFIED;
  }
  return isPediatric(sourceText) ? `${label} (pediatric)` : label;
}

/** Top `n` most frequent AO/OTA region buckets across `cases` — the
 *  "Top 5 Operated Regions" ranking. Ties break alphabetically for a
 *  deterministic order, same convention as topN in stats.ts. */
export function topRegions(cases: CaseEntry[], n: number, aiMap?: ReadonlyMap<string, string>): RankItem[] {
  const map = new Map<string, RankItem>();
  for (const c of cases) {
    const label = regionBucketLabel(c, aiMap);
    const groupKey = label.toLowerCase();
    const existing = map.get(groupKey);
    if (existing) existing.count += 1;
    else map.set(groupKey, { label, count: 1 });
  }
  return [...map.values()]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, n);
}
