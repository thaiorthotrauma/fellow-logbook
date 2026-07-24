import type { CaseEntry, FormState } from '../types';

// Pure mapping between the app's camelCase case shape and the DB's snake_case
// columns. Deliberately free of any Supabase import so it stays unit-testable
// without a configured client / environment.

// Single source of truth: [camelCase app key, snake_case DB column]. Both row
// mappers below are generated from this list, so adding a field means editing
// exactly one line here (plus the TS type and the SQL column — the two places
// that are genuinely different languages).
const FIELD_MAP: readonly (readonly [keyof CaseEntry, string])[] = [
  ['id', 'id'],
  ['date', 'date'],
  ['timing', 'timing'],
  ['diagnosis', 'diagnosis'],
  ['aoCode', 'ao_code'],
  ['aoRegionLabel', 'ao_region_label'],
  ['otherClassification', 'other_classification'],
  ['approach', 'approach'],
  ['position', 'position'],
  ['procedure', 'procedure'],
  ['procedureType', 'procedure_type'],
  ['role', 'role'],
  ['opTime', 'op_time'],
  ['place', 'place'],
  ['imagePaths', 'image_paths'],
];

export type CaseRow = Record<string, unknown>;

/** DB row (snake_case) → app entry (camelCase). Constrained columns are
 *  trusted to hold valid values because of the CHECK constraints in the DB. */
export function fromRow(row: CaseRow): CaseEntry {
  const entry: Record<string, unknown> = {};
  for (const [key, col] of FIELD_MAP) entry[key] = row[col];
  // Guard against a missing/null image_paths column so the Case Log never
  // crashes on `.length` — old rows or an un-migrated table yield undefined.
  if (!Array.isArray(entry.imagePaths)) entry.imagePaths = [];
  return entry as unknown as CaseEntry;
}

/** Form values + computed AO fields + uploaded image references → DB row
 *  (snake_case). `id` is omitted so the caller supplies it (needed because the
 *  images are uploaded to Drive, under a per-case name, before the row is
 *  inserted). */
export function toRow(
  form: FormState,
  aoCode: string,
  aoRegionLabel: string,
  imagePaths: string[],
): CaseRow {
  const source: Record<string, unknown> = { ...form, aoCode, aoRegionLabel, imagePaths };
  const row: CaseRow = {};
  for (const [key, col] of FIELD_MAP) {
    if (key === 'id') continue;
    row[col] = source[key];
  }
  return row;
}
