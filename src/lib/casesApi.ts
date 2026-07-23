import { supabase } from './supabaseClient';
import { fromRow, toRow, type CaseRow } from './caseMapping';
import type { CaseEntry, FormState } from '../types';

const DRIVE_FN = 'drive-images';

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

/** Base64-encode a File without inflating memory via a giant argument spread. */
async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function invokeDrive<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(DRIVE_FN, { body });
  if (error) throw error;
  if (data && typeof data === 'object' && 'error' in data) {
    throw new Error(String((data as { error: unknown }).error));
  }
  return data as T;
}

export async function fetchCases(): Promise<CaseEntry[]> {
  const { data, error } = await supabase.from('cases').select('*').order('created_at', { ascending: true });
  if (error) throw error;
  return (data as CaseRow[]).map(fromRow);
}

/** Uploads the given files to Google Drive (via the drive-images function) and
 *  returns their Drive file IDs, in order. Throws on the first failed upload so
 *  the caller can abort before inserting the case row (avoiding an orphan). */
export async function uploadCaseImages(caseId: string, files: File[]): Promise<string[]> {
  if (files.length === 0) return [];
  const ids: string[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const dataBase64 = await fileToBase64(file);
    const { id } = await invokeDrive<{ id: string }>({
      action: 'upload',
      caseId,
      filename: `${caseId}-${i + 1}.jpg`,
      contentType: imageMime(file),
      dataBase64,
    });
    ids.push(id);
  }
  return ids;
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

/** Fetches a case's Drive images back through the function and returns them as
 *  data URLs (usable directly in <img src> / <a href>). Files stay private to
 *  the app — they are never shared with a public link. Missing/failed images
 *  are skipped rather than failing the whole set. */
export async function getImageUrls(fileIds: string[]): Promise<string[]> {
  if (fileIds.length === 0) return [];
  const results = await Promise.all(
    fileIds.map(async id => {
      try {
        const { contentType, dataBase64 } = await invokeDrive<{ contentType: string; dataBase64: string }>({
          action: 'get',
          id,
        });
        return `data:${contentType};base64,${dataBase64}`;
      } catch (err) {
        console.error('Failed to load case image from Drive:', err);
        return null;
      }
    }),
  );
  return results.filter((url): url is string => url !== null);
}

export async function deleteCaseById(id: string, imagePaths: string[] = []): Promise<void> {
  const { error } = await supabase.from('cases').delete().eq('id', id);
  if (error) throw error;
  // Best-effort Drive cleanup — don't fail the delete if this doesn't.
  if (imagePaths.length > 0) {
    try {
      await invokeDrive({ action: 'delete', ids: imagePaths });
    } catch (err) {
      console.error('Failed to remove case images from Drive:', err);
    }
  }
}
