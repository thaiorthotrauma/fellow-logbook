import { supabase } from './supabaseClient';
import { fromRow, toRow, type CaseRow } from './caseMapping';
import type { CaseEntry, FormState } from '../types';

const BUCKET = 'case-images';
const SIGNED_URL_TTL = 60 * 60; // 1 hour

export const MAX_IMAGES_TOTAL_BYTES = 10 * 1024 * 1024; // 10 MB across all images
export const ALLOWED_IMAGE_EXT = ['jpg', 'jpeg', 'png', 'heic', 'heif'] as const;

/** True if a file is an allowed image, judged by MIME type when available and
 *  otherwise by extension — HEIC files often arrive with an empty `type`. */
export function isAllowedImage(file: File): boolean {
  const type = file.type.toLowerCase();
  if (type === 'image/jpeg' || type === 'image/png' || type === 'image/heic' || type === 'image/heif') {
    return true;
  }
  return /\.(jpe?g|png|heic|heif)$/i.test(file.name);
}

function imageMime(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'heic') return 'image/heic';
  if (ext === 'heif') return 'image/heif';
  return 'image/jpeg';
}

function fileExt(file: File): string {
  const fromName = file.name.split('.').pop()?.toLowerCase();
  if (fromName && (ALLOWED_IMAGE_EXT as readonly string[]).includes(fromName)) return fromName;
  const type = file.type.toLowerCase();
  if (type === 'image/png') return 'png';
  if (type === 'image/heic') return 'heic';
  if (type === 'image/heif') return 'heif';
  return 'jpg';
}

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('not authenticated');
  return data.user.id;
}

export async function fetchCases(): Promise<CaseEntry[]> {
  const { data, error } = await supabase.from('cases').select('*').order('created_at', { ascending: true });
  if (error) throw error;
  return (data as CaseRow[]).map(fromRow);
}

/** Uploads the given files to case-images under {uid}/{caseId}/ and returns
 *  their storage paths. Throws on the first failed upload so the caller can
 *  abort before inserting the case row (avoiding an image-less orphan). */
export async function uploadCaseImages(caseId: string, files: File[]): Promise<string[]> {
  if (files.length === 0) return [];
  const uid = await currentUserId();
  const paths: string[] = [];
  for (const file of files) {
    const path = `${uid}/${caseId}/${crypto.randomUUID()}.${fileExt(file)}`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: imageMime(file), upsert: false });
    if (error) throw error;
    paths.push(path);
  }
  return paths;
}

export async function insertCase(
  caseId: string,
  form: FormState,
  aoCode: string,
  aoRegionLabel: string,
  imagePaths: string[],
): Promise<CaseEntry> {
  const { data, error } = await supabase
    .from('cases')
    .insert({ id: caseId, ...toRow(form, aoCode, aoRegionLabel, imagePaths) })
    .select()
    .single();
  if (error) throw error;
  return fromRow(data as CaseRow);
}

/** Mints short-lived signed URLs for a case's private image paths, in order. */
export async function getImageUrls(paths: string[]): Promise<string[]> {
  if (paths.length === 0) return [];
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, SIGNED_URL_TTL);
  if (error) throw error;
  return (data ?? [])
    .map(d => d.signedUrl)
    .filter((url): url is string => typeof url === 'string' && url.length > 0);
}

export async function deleteCaseById(id: string, imagePaths: string[] = []): Promise<void> {
  const { error } = await supabase.from('cases').delete().eq('id', id);
  if (error) throw error;
  // Best-effort storage cleanup — don't fail the delete if this doesn't.
  if (imagePaths.length > 0) {
    const { error: rmError } = await supabase.storage.from(BUCKET).remove(imagePaths);
    if (rmError) console.error('Failed to remove case images from storage:', rmError);
  }
}
