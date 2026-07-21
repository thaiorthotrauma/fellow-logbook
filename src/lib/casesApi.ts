import { supabase } from './supabaseClient';
import type { CaseEntry, FormState } from '../types';

// Single source of truth for the case field mapping: [camelCase app key,
// snake_case DB column]. Both row mappers below are generated from this list,
// so adding a field means editing exactly one line here (plus the TS type and
// the SQL column — the two places that are genuinely different languages).
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
];

export type CaseRow = Record<string, unknown>;

/** DB row (snake_case) → app entry (camelCase). Constrained columns are
 *  trusted to hold valid values because of the CHECK constraints in the DB. */
export function fromRow(row: CaseRow): CaseEntry {
  const entry: Record<string, unknown> = {};
  for (const [key, col] of FIELD_MAP) entry[key] = row[col];
  return entry as unknown as CaseEntry;
}

/** Form values + computed AO fields → DB row (snake_case). `id` is omitted so
 *  the DB assigns it; `user_id` defaults to auth.uid() server-side. */
export function toRow(form: FormState, aoCode: string, aoRegionLabel: string): CaseRow {
  const source: Record<string, unknown> = { ...form, aoCode, aoRegionLabel };
  const row: CaseRow = {};
  for (const [key, col] of FIELD_MAP) {
    if (key === 'id') continue;
    row[col] = source[key];
  }
  return row;
}

export async function fetchCases(): Promise<CaseEntry[]> {
  const { data, error } = await supabase.from('cases').select('*').order('created_at', { ascending: true });
  if (error) throw error;
  return (data as CaseRow[]).map(fromRow);
}

export async function insertCase(form: FormState, aoCode: string, aoRegionLabel: string): Promise<CaseEntry> {
  const { data, error } = await supabase
    .from('cases')
    .insert(toRow(form, aoCode, aoRegionLabel))
    .select()
    .single();
  if (error) throw error;
  return fromRow(data as CaseRow);
}

export async function deleteCaseById(id: string): Promise<void> {
  const { error } = await supabase.from('cases').delete().eq('id', id);
  if (error) throw error;
}
