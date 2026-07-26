import { supabase } from './supabaseClient';

export interface Fellow {
  fullName: string;
  institution: string | null;
}

/** Loads the signed-in fellow's own row. RLS ("fellow can read own row")
 *  restricts the result to the row where user_id = auth.uid(), so a plain
 *  select returns just their record. */
export async function fetchCurrentFellow(): Promise<Fellow | null> {
  const { data, error } = await supabase
    .from('fellow')
    .select('full_name, institution')
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { fullName: data.full_name, institution: data.institution };
}
