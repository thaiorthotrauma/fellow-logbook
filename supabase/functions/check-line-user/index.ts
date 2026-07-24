// Called on every app launch inside LIFF, before any UI is shown.
// Input:  { id_token: string }               (from liff.getIDToken())
// Output: { status: 'verified', email, redeem_token } — client redeems
//           redeem_token into a real session (see AuthGate.tsx for how and
//           why). No email is ever sent for this path.
//         { status: 'unlinked' } — this LINE user has never completed the
//           whitelist + OTP verification. Client shows the email entry screen.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { verifyLineIdToken } from '../_shared/line.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
// After a project migrates to JWT Signing Keys (ES256), the auto-injected
// SUPABASE_SERVICE_ROLE_KEY (a legacy JWT) can stop verifying (bad_jwt /
// "unrecognized kid ES256"), breaking admin calls like generateLink. Prefer an
// explicitly-set key — a new `sb_secret_...` API key set as SB_SECRET_KEY — and
// fall back to the injected service_role key when it isn't set.
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

    // Supabase's admin API only exposes this capability under the parameter
    // name `type: 'magiclink'` — that's their label, not a description of
    // what happens here. generateLink does NOT send any email; it purely
    // produces a token our client redeems server-side (see AuthGate.tsx) to
    // restore a session for a physician we've already verified owns this
    // LINE identity.
    const { data: redeemable, error: redeemableError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: physician.email,
    });
    if (redeemableError) throw redeemableError;

    const redeemToken = redeemable.properties?.hashed_token;
    if (!redeemToken) throw new Error('generateLink did not return a redeemable token');

    return json({ status: 'verified', email: physician.email, redeem_token: redeemToken });
  } catch (err) {
    console.error(err);
    return json({ error: err instanceof Error ? err.message : 'unexpected error' }, 400);
  }
});
