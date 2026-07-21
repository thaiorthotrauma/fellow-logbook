import { supabase } from './supabaseClient';
import { fromRow, toRow, type CaseRow } from './caseMapping';
import type { CaseEntry, FormState } from '../types';

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
