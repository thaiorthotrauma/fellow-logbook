// Called on every app launch inside LIFF, before any UI is shown.
// Input:  { id_token: string }               (from liff.getIDToken())
// Output: { status: 'verified', email, token_hash } — client should call
//           supabase.auth.verifyOtp({ email, token: token_hash, type: 'magiclink' })
//           to obtain a real session, then proceed straight into the app.
//         { status: 'unlinked' } — this LINE user has never completed the
//           whitelist + OTP verification. Client shows the email entry screen.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { verifyLineIdToken } from '../_shared/line.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const LINE_CHANNEL_ID = Deno.env.get('LINE_CHANNEL_ID')!;

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
      .select('email, verified')
      .eq('line_user_id', lineUserId)
      .eq('verified', true)
      .maybeSingle();

    if (error) throw error;
    if (!physician) return json({ status: 'unlinked' });

    const { data: link, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: physician.email,
    });
    if (linkError) throw linkError;

    const tokenHash = link.properties?.hashed_token;
    if (!tokenHash) throw new Error('generateLink did not return a hashed_token');

    return json({ status: 'verified', email: physician.email, token_hash: tokenHash });
  } catch (err) {
    console.error(err);
    return json({ error: err instanceof Error ? err.message : 'unexpected error' }, 400);
  }
});
