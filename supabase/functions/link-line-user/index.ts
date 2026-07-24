// Called once, right after a first-time user completes email + OTP
// verification (supabase.auth.verifyOtp succeeded, so the client now holds a
// real session). Links the verified LINE identity to that physician's row.
//
// Requires the caller's Supabase access token in the Authorization header
// (supabase.functions.invoke sends this automatically) and:
//   { id_token: string }   (from liff.getIDToken())
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { verifyLineIdToken } from '../_shared/line.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
// See check-line-user: prefer an explicitly-set SB_SECRET_KEY (a new
// `sb_secret_...` API key) over the auto-injected service_role JWT, which can
// fail to verify after a JWT Signing Keys migration.
const SERVICE_ROLE_KEY = Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
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
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'missing Authorization header' }, 401);

    const { id_token } = await req.json();
    if (!id_token || typeof id_token !== 'string') {
      return json({ error: 'id_token is required' }, 400);
    }

    // Client scoped to the caller's own session, purely to identify who they are.
    const callerClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await callerClient.auth.getUser();
    if (userError || !user || !user.email) return json({ error: 'not authenticated' }, 401);

    const lineUserId = await verifyLineIdToken(id_token, LINE_CHANNEL_ID);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Refuse to steal a LINE identity that's already linked to someone else.
    const { data: existing, error: existingError } = await admin
      .from('physicians')
      .select('user_id')
      .eq('line_user_id', lineUserId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing && existing.user_id && existing.user_id !== user.id) {
      return json({ error: 'this LINE account is already linked to a different physician' }, 409);
    }

    // Match on user_id, not email. claim_physician_row() runs immediately
    // before this (case-insensitively linking user_id to the whitelist row),
    // so user_id is the reliable key here. Matching on email would need to be
    // case-insensitive — the roster has mixed-case addresses while Supabase
    // lowercases auth emails — and doing that with ilike risks treating `%`
    // or `_` in an address as wildcards.
    const { data: updated, error: updateError } = await admin
      .from('physicians')
      .update({ line_user_id: lineUserId, verified: true })
      .eq('user_id', user.id)
      .select('id');
    if (updateError) throw updateError;
    if (!updated || updated.length === 0) {
      return json({ error: 'no physician row linked to this account' }, 409);
    }

    return json({ status: 'ok' });
  } catch (err) {
    console.error(err);
    return json({ error: err instanceof Error ? err.message : 'unexpected error' }, 400);
  }
});
