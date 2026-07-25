import { supabase } from './supabaseClient';
import { entryToRow, fromRow, toRow, type CaseRow } from './caseMapping';
import type { CaseEntry, FormState } from '../types';

const DRIVE_FN = 'drive-images';
const NOTIFY_FN = 'notify-case';

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
  if (error) {
    // FunctionsHttpError/FunctionsRelayError carry the real response body in
    // `context`, but `error.message` is just a generic "non-2xx status" —
    // read the body so failures are actionable instead of a dead end.
    const context = (error as { context?: Response }).context;
    let detail: string | undefined;
    if (context && typeof context.json === 'function') {
      try {
        const body = await context.clone().json();
        if (body?.error) detail = String(body.error);
      } catch {
        // response body wasn't JSON — fall through to the generic error
      }
    }
    throw new Error(detail ?? error.message);
  }
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
 *  returns their Drive file IDs, in order. If any upload fails, the images
 *  already uploaded in this call are rolled back (best-effort) before throwing,
 *  so a partially-uploaded case never leaves orphaned files in Drive.
 *
 *  `startIndex` offsets the generated filenames so images added while editing a
 *  case don't reuse the names of the ones already on it. Drive addresses files
 *  by id, not name, so this is purely for legibility in the Drive folder. */
export async function uploadCaseImages(
  caseId: string,
  files: File[],
  startIndex = 0,
): Promise<string[]> {
  if (files.length === 0) return [];
  const ids: string[] = [];
  try {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const dataBase64 = await fileToBase64(file);
      const { id } = await invokeDrive<{ id: string }>({
        action: 'upload',
        caseId,
        filename: `${caseId}-${startIndex + i + 1}.jpg`,
        contentType: imageMime(file),
        dataBase64,
      });
      ids.push(id);
    }
  } catch (err) {
    await deleteDriveImages(ids);
    throw err;
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

/** The stored columns whose old values a case edit reports, keyed as the DB
 *  names the notifier expects. Derived from the row mappers so it can't drift
 *  from the column list. */
export type PreviousValues = Record<string, unknown>;

/** Columns that differ between two versions of a case, as
 *  { column: previous value } — the shape `notify-case` renders its diff from.
 *  Compared on the DB row shape so the notifier never has to know app keys. */
export function diffCaseColumns(before: CaseEntry, after: CaseEntry): PreviousValues {
  const beforeRow = entryToRow(before);
  const afterRow = entryToRow(after);
  const previous: PreviousValues = {};
  for (const col of Object.keys(beforeRow)) {
    const a = beforeRow[col];
    const b = afterRow[col];
    const same = Array.isArray(a) && Array.isArray(b)
      ? a.length === b.length && a.every((v, i) => v === b[i])
      : a === b;
    if (!same) previous[col] = a;
  }
  return previous;
}

/** Tells the server to post a Telegram notification for a case. Best-effort and
 *  never throws: the case is already saved by the time this runs, so a Telegram
 *  problem must not surface to the fellow as a failed save. */
export async function notifyCase(
  kind: 'created' | 'updated',
  caseId: string,
  previous?: PreviousValues,
): Promise<void> {
  try {
    const body: Record<string, unknown> = { kind, caseId };
    if (previous) body.previous = previous;
    const { error } = await supabase.functions.invoke(NOTIFY_FN, { body });
    if (error) console.error('Case notification failed:', error);
  } catch (err) {
    console.error('Case notification failed:', err);
  }
}

/** Overwrites an existing case with edited values. `imagePaths` is the case's
 *  full final image set (kept existing ids + newly uploaded ones); Drive files
 *  the edit dropped are deleted separately, only once this succeeds. RLS scopes
 *  the update to the signed-in fellow's own rows. */
export async function updateCase(
  id: string,
  form: FormState,
  aoCode: string,
  aoRegionLabel: string,
  imagePaths: string[],
): Promise<CaseEntry> {
  const { data, error } = await supabase
    .from('cases')
    .update(toRow(form, aoCode, aoRegionLabel, imagePaths))
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return fromRow(data as CaseRow);
}

/** Fetches a case's Drive images back through the function as data URLs, one
 *  entry per input id and `null` where an image couldn't be loaded. Callers that
 *  index back into the id list (e.g. removing an image while editing) need this
 *  positional alignment; use `getImageUrls` when only the loadable ones matter. */
export async function getImageUrlsPositional(fileIds: string[]): Promise<(string | null)[]> {
  if (fileIds.length === 0) return [];
  return await Promise.all(
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
}

/** Fetches a case's Drive images back through the function and returns them as
 *  data URLs (usable directly in <img src> / <a href>). Files stay private to
 *  the app — they are never shared with a public link. Missing/failed images
 *  are skipped rather than failing the whole set. */
export async function getImageUrls(fileIds: string[]): Promise<string[]> {
  const results = await getImageUrlsPositional(fileIds);
  return results.filter((url): url is string => url !== null);
}

/** Best-effort removal of Drive files by id, without touching the database.
 *  Used to clean up images that were uploaded for a case whose row then failed
 *  to insert, so orphaned patient images don't linger in Drive. Never throws. */
export async function deleteDriveImages(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    await invokeDrive({ action: 'delete', ids });
  } catch (err) {
    console.error('Failed to remove orphaned images from Drive:', err);
  }
}

export async function deleteCaseById(id: string, imagePaths: string[] = []): Promise<void> {
  const { error } = await supabase.from('cases').delete().eq('id', id);
  if (error) throw error;
  // Best-effort Drive cleanup — don't fail the delete if this doesn't.
  await deleteDriveImages(imagePaths);
}
