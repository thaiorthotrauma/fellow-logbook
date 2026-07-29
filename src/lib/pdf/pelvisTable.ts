import { ROLES, type Role } from '../../data';
import { regionSourceText, resolveStructuredRegion } from './regionCategory';
import { normalizeLabel } from './stats';
import type { CaseEntry } from '../../types';

// Backs the summary page's "Experiences on Pelvis & Acetabulum Cases" table:
// how many pelvic-ring and acetabular cases the fellow logged, broken down by
// the role they held in each.
//
// Pelvis and acetabulum are the marquee cases of an orthopaedic trauma
// fellowship, and the role matters as much as the count — being primary
// surgeon on an acetabulum is a different training experience from observing
// one. So the table reports the two regions separately, per role, rather than
// as one pooled number.
//
// Region detection reuses the AO/OTA categorization the summary page already
// computes (regionCategory.ts) — Q6's structured code when it parses, else
// the AI classification of the free text. Nothing extra is fetched for this
// table.

/** The two AO/OTA regions this table covers, by their REGIONS key, mapped to
 *  the display label resolveStructuredRegion/the AI classifier produce for
 *  them. Both are bare region names with no bone or segment breakdown, so the
 *  label is an exact match either way. */
export const PELVIS_REGIONS = {
  pelvicring: 'Pelvic ring',
  acetabulum: 'Acetabulum',
} as const;

export type PelvisRegionKey = keyof typeof PELVIS_REGIONS;

/** Table-column labels, deliberately shorter than the full option labels in
 *  data.ts: "Observer (not scrub in)" does not fit a ~100pt cell, and the
 *  parenthetical adds nothing once the column header says "role". */
export const SHORT_ROLE_LABEL: Record<Role, string> = {
  primary_surgeon: 'Primary surgeon',
  primary_assistant: 'Primary assist',
  secondary_assistant: 'Secondary assist',
  observer: 'Observer',
  uncertain: 'Uncertain',
};

/** Which of the two regions a case belongs to, or null for everything else.
 *  Q6 wins when its code parses; otherwise the AI region map is consulted
 *  under the same key regionBucketLabel uses, so a pelvis case logged without
 *  a structured code still counts. */
export function pelvisRegionOf(c: CaseEntry, regionMap?: ReadonlyMap<string, string>): PelvisRegionKey | null {
  const structured = resolveStructuredRegion(c);
  if (structured) {
    return structured.key in PELVIS_REGIONS ? (structured.key as PelvisRegionKey) : null;
  }
  const text = regionSourceText(c);
  if (!text.trim()) return null;
  const label = regionMap?.get(normalizeLabel(text).key);
  if (!label) return null;
  for (const [key, regionLabel] of Object.entries(PELVIS_REGIONS)) {
    if (label === regionLabel) return key as PelvisRegionKey;
  }
  return null;
}

export interface PelvisRoleRow {
  role: Role;
  label: string;
  pelvicring: number;
  acetabulum: number;
  total: number;
}

export interface PelvisExperience {
  /** One row per role, in the canonical ROLES order, always all of them —
   *  including roles with no cases. Unlike the top-5 rankings, a zero here is
   *  the finding: "0 pelvic-ring cases as primary surgeon" is exactly what a
   *  reader of a training record is looking for, so the row must not vanish. */
  rows: PelvisRoleRow[];
  totals: { pelvicring: number; acetabulum: number; total: number };
}

/** Counts each pelvis/acetabulum case exactly once, under the role it was
 *  logged with, so the totals equal the real number of such cases. Cases with
 *  no role recorded are skipped rather than invented into a bucket. */
export function pelvisExperience(cases: CaseEntry[], regionMap?: ReadonlyMap<string, string>): PelvisExperience {
  const rows: PelvisRoleRow[] = ROLES.map(r => ({
    role: r.value,
    label: SHORT_ROLE_LABEL[r.value],
    pelvicring: 0,
    acetabulum: 0,
    total: 0,
  }));
  const byRole = new Map(rows.map(r => [r.role, r]));

  for (const c of cases) {
    const region = pelvisRegionOf(c, regionMap);
    if (!region) continue;
    if (!c.role) continue;
    const row = byRole.get(c.role);
    if (!row) continue;
    row[region] += 1;
    row.total += 1;
  }

  const totals = rows.reduce(
    (acc, r) => ({
      pelvicring: acc.pelvicring + r.pelvicring,
      acetabulum: acc.acetabulum + r.acetabulum,
      total: acc.total + r.total,
    }),
    { pelvicring: 0, acetabulum: 0, total: 0 },
  );

  return { rows, totals };
}
