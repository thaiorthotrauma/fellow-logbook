import { supabase } from './supabaseClient';
import type { OpTime, Place, ProcedureType, Role, Timing } from '../data';
import type { StaffCaseEntry } from '../types';

export interface StaffProfile {
  fullName: string;
  institution: string;
}

/** Loads the signed-in staff member's own name/institution via
 *  my_staff_profile() — the only way this data is ever read, so there's no
 *  raw select to get wrong. Null for a non-staff caller (zero rows, not an
 *  error), same shape as fetchCurrentPhysician(). */
export async function fetchStaffProfile(): Promise<StaffProfile | null> {
  const { data, error } = await supabase.rpc('my_staff_profile');
  if (error) throw error;
  const row = data?.[0];
  if (!row) return null;
  return { fullName: row.full_name, institution: row.institution };
}

/** A row from staff_institution_cases(), before mapping to StaffCaseEntry.
 *  `hn` already arrives masked — the function never returns the real value. */
export interface StaffCaseRow {
  id: string;
  date: string;
  timing: string | null;
  place: string | null;
  fellow_name: string;
  staff: string;
  hn: string;
  diagnosis: string;
  ao_code: string;
  ao_region_label: string;
  other_classification: string;
  approach: string;
  position: string;
  procedure: string;
  procedure_type: string | null;
  role: string | null;
  op_time: string | null;
  memo: string;
  image_paths: string[] | null;
}

export function fromStaffRow(row: StaffCaseRow): StaffCaseEntry {
  return {
    id: row.id,
    date: row.date,
    timing: row.timing as Timing | null,
    place: row.place as Place | null,
    fellowName: row.fellow_name,
    staff: row.staff,
    hn: row.hn,
    diagnosis: row.diagnosis,
    otherClassification: row.other_classification,
    approach: row.approach,
    position: row.position,
    procedure: row.procedure,
    procedureType: row.procedure_type as ProcedureType | null,
    role: row.role as Role | null,
    opTime: row.op_time as OpTime | null,
    memo: row.memo,
    aoCode: row.ao_code,
    aoRegionLabel: row.ao_region_label,
    imagePaths: row.image_paths ?? [],
  };
}

/** Every case logged by any fellow in the caller's own institution, newest
 *  first, HN pre-masked by the database. Empty array for a non-staff caller. */
export async function fetchStaffCases(): Promise<StaffCaseEntry[]> {
  const { data, error } = await supabase.rpc('staff_institution_cases');
  if (error) throw error;
  return ((data ?? []) as StaffCaseRow[]).map(fromStaffRow);
}
