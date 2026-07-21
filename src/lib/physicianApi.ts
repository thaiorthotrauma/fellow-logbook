import { supabase } from './supabaseClient';

export interface Physician {
  fullName: string;
  institution: string | null;
}

/** Loads the signed-in fellow's own physician row. RLS ("physicians can read
 *  own row") restricts the result to the row where user_id = auth.uid(), so a
 *  plain select returns just their record. */
export async function fetchCurrentPhysician(): Promise<Physician | null> {
  const { data, error } = await supabase
    .from('physicians')
    .select('full_name, institution')
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { fullName: data.full_name, institution: data.institution };
}
