import { supabase } from './supabaseClient';
import type { CaseEntry, FormState } from '../types';

interface CaseRow {
  id: string;
  date: string;
  timing: string;
  diagnosis: string;
  ao_code: string;
  ao_region_label: string;
  other_classification: string;
  approach: string;
  position: string;
  procedure: string;
  procedure_type: string;
  role: string;
  op_time: string;
  place: string;
}

function fromRow(row: CaseRow): CaseEntry {
  return {
    id: row.id,
    date: row.date,
    timing: row.timing,
    diagnosis: row.diagnosis,
    aoCode: row.ao_code,
    aoRegionLabel: row.ao_region_label,
    otherClassification: row.other_classification,
    approach: row.approach,
    position: row.position,
    procedure: row.procedure,
    procedureType: row.procedure_type,
    role: row.role,
    opTime: row.op_time,
    place: row.place,
  };
}

function toRow(form: FormState, aoCode: string, aoRegionLabel: string) {
  return {
    date: form.date,
    timing: form.timing,
    diagnosis: form.diagnosis,
    ao_code: aoCode,
    ao_region_label: aoRegionLabel,
    other_classification: form.otherClassification,
    approach: form.approach,
    position: form.position,
    procedure: form.procedure,
    procedure_type: form.procedureType,
    role: form.role,
    op_time: form.opTime,
    place: form.place,
  };
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
