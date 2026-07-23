// Server-side bridge between the app and Google Drive for case images.
//
// Why this exists: Google's OAuth flow is blocked inside LINE's in-app webview
// (`disallowed_useragent`), so the browser can't talk to Drive directly. Instead
// this function holds a single Google refresh token (the program's own Drive)
// and performs uploads/reads/deletes on the fellow's behalf. Images are
// processed and redacted ON THE DEVICE first; only the finished JPEG reaches
// here, and it goes straight to Drive — nothing is stored in Supabase.
//
// The function is JWT-protected (Supabase verifies the caller's session before
// this runs); we additionally resolve the user to reject anonymous callers.
//
// Actions (POST JSON { action, ... }):
//   upload  { caseId, filename, contentType, dataBase64 } -> { id }
//   get     { id }                                         -> { contentType, dataBase64 }
//   delete  { ids: string[] }                              -> { ok: true }
//
// Required secrets (supabase secrets set ...):
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN
//   GOOGLE_DRIVE_FOLDER_ID  (optional — target folder; omit to use Drive root)
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!;
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!;
const GOOGLE_REFRESH_TOKEN = Deno.env.get('GOOGLE_REFRESH_TOKEN')!;
const GOOGLE_DRIVE_FOLDER_ID = Deno.env.get('GOOGLE_DRIVE_FOLDER_ID') ?? '';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

// --- Google access-token cache (best-effort, per warm instance) ---------------
let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`Google token refresh failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return cachedToken.value;
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function driveUpload(
  token: string,
  filename: string,
  contentType: string,
  bytes: Uint8Array,
): Promise<string> {
  const metadata: Record<string, unknown> = { name: filename };
  if (GOOGLE_DRIVE_FOLDER_ID) metadata.parents = [GOOGLE_DRIVE_FOLDER_ID];

  const boundary = `b${crypto.randomUUID()}`;
  const enc = new TextEncoder();
  const head = enc.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`,
  );
  const tail = enc.encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(head.length + bytes.length + tail.length);
  body.set(head, 0);
  body.set(bytes, head.length);
  body.set(tail, head.length + bytes.length);

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );
  if (!res.ok) throw new Error(`Drive upload failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.id as string;
}

async function driveGet(token: string, id: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`Drive get failed: ${res.status} ${await res.text()}`);
  const contentType = res.headers.get('Content-Type') ?? 'image/jpeg';
  const bytes = new Uint8Array(await res.arrayBuffer());
  return { bytes, contentType };
}

async function driveDelete(token: string, id: string): Promise<void> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  // 404 = already gone; treat as success so deletes stay idempotent.
  if (!res.ok && res.status !== 404) {
    throw new Error(`Drive delete failed: ${res.status} ${await res.text()}`);
  }
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    // Reject anyone without a valid, non-anonymous Supabase session.
    const authHeader = req.headers.get('Authorization') ?? '';
    const user = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await user.auth.getUser();
    if (userError || !userData.user) return json({ error: 'not authenticated' }, 401);

    const payload = await req.json();
    const action = payload?.action;
    const token = await getAccessToken();

    if (action === 'upload') {
      const { filename, contentType, dataBase64 } = payload;
      if (!dataBase64 || typeof dataBase64 !== 'string') {
        return json({ error: 'dataBase64 is required' }, 400);
      }
      const id = await driveUpload(
        token,
        typeof filename === 'string' && filename ? filename : `case-${crypto.randomUUID()}.jpg`,
        typeof contentType === 'string' && contentType ? contentType : 'image/jpeg',
        base64ToBytes(dataBase64),
      );
      return json({ id });
    }

    if (action === 'get') {
      const { id } = payload;
      if (!id || typeof id !== 'string') return json({ error: 'id is required' }, 400);
      const { bytes, contentType } = await driveGet(token, id);
      return json({ contentType, dataBase64: bytesToBase64(bytes) });
    }

    if (action === 'delete') {
      const ids: unknown = payload?.ids;
      if (!Array.isArray(ids)) return json({ error: 'ids[] is required' }, 400);
      await Promise.all(ids.filter((x): x is string => typeof x === 'string').map(id => driveDelete(token, id)));
      return json({ ok: true });
    }

    return json({ error: `unknown action: ${action}` }, 400);
  } catch (err) {
    console.error(err);
    return json({ error: err instanceof Error ? err.message : 'unexpected error' }, 500);
  }
});
