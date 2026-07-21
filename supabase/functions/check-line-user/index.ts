// Called on every app launch inside LIFF, before any UI is shown.
// Input:  { id_token: string }               (from liff.getIDToken())
// Output: { status: 'verified', session: { access_token, refresh_token, expires_in } }
//           — client should call supabase.auth.setSession(session) to obtain
//           a real session, then proceed straight into the app. No email is
//           ever sent for this path.
//         { status: 'unlinked' } — this LINE user has never completed the
//           whitelist + OTP verification. Client shows the email entry screen.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { SignJWT } from 'npm:jose@5';
import { verifyLineIdToken } from '../_shared/line.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const LINE_CHANNEL_ID = Deno.env.get('LINE_CHANNEL_ID')!;
const JWT_SECRET = Deno.env.get('SUPABASE_JWT_SECRET')!;

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

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

// Hand-signs a Supabase-compatible session access token (HS256, matching the
// project's JWT secret) for a physician we've already independently verified
// owns this LINE identity. This is what lets a returning user skip straight
// back into the app without a fresh email/OTP round trip — no Supabase
// "magic link" mechanism is involved anywhere in this path.
async function mintSession(userId: string, email: string) {
  const now = Math.floor(Date.now() / 1000);
  const secretKey = new TextEncoder().encode(JWT_SECRET);

  const accessToken = await new SignJWT({
    aud: 'authenticated',
    role: 'authenticated',
    email,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt(now)
    .setExpirationTime(now + SESSION_TTL_SECONDS)
    .sign(secretKey);

  // No real GoTrue refresh token exists for this session — supabase-js only
  // needs a string here. When the access token's own expiry is reached, the
  // client's refresh attempt will fail, the session clears, and the app
  // re-runs this same check-line-user flow to mint a fresh one.
  return {
    access_token: accessToken,
    refresh_token: crypto.randomUUID(),
    expires_in: SESSION_TTL_SECONDS,
  };
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    const { id_token } = await req.json();
    if (!id_token || typeof id_token !== 'string') {
      return json({ error: 'id_token is required' }, 400);
    }

    const lineUserId = await verifyLineIdToken(id_token, LINE_CHANNEL_ID);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: physician, error } = await admin
      .from('physicians')
      .select('user_id, email, verified')
      .eq('line_user_id', lineUserId)
      .eq('verified', true)
      .maybeSingle();

    if (error) throw error;
    if (!physician || !physician.user_id) return json({ status: 'unlinked' });

    const session = await mintSession(physician.user_id, physician.email);
    return json({ status: 'verified', session });
  } catch (err) {
    console.error(err);
    return json({ error: err instanceof Error ? err.message : 'unexpected error' }, 400);
  }
});
