// Called right after the client creates an anonymous Supabase session
// (supabase.auth.signInAnonymously()) for a LINE account that isn't a known
// fellow. Verifies the LINE identity server-side and, if it's a recognized
// staff member, links this device's session to their staff row.
//
// Unlike link-line-user, there is no email/OTP step before this — staff are
// trusted by LINE ID alone (a deliberate choice, seeded directly). And unlike
// fellows (one user_id per person, since email anchors identity across
// devices), this upserts into staff_devices — one row per device — because an
// anonymous session has no identity to share across a phone and a tablet.
//
// Requires the caller's Supabase access token in the Authorization header
// (supabase.functions.invoke sends this automatically) and:
//   { id_token: string }   (from liff.getIDToken())
//
// Returns { status: 'ok', full_name, institution } on success, or
// { status: 'not-staff' } (200, not an error) when the LINE id_token verifies
// fine but doesn't match anyone in staff — this is an expected outcome the
// client checks, not a failure.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { verifyLineIdToken } from '../_shared/line.ts';
import { reportFunctionError } from '../_shared/errorReport.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
// See check-line-user: prefer an explicitly-set SB_SECRET_KEY over the
// auto-injected service_role JWT, which can fail to verify after a JWT
// Signing Keys migration.
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

    // Client scoped to the caller's own (anonymous) session, purely to
    // identify who they are. No .email check here, unlike link-line-user —
    // an anonymous session never has one.
    const callerClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await callerClient.auth.getUser();
    if (userError || !user) return json({ error: 'not authenticated' }, 401);

    // Never trust a client-supplied LINE id — always re-verify the token
    // itself with LINE's own endpoint.
    const lineUserId = await verifyLineIdToken(id_token, LINE_CHANNEL_ID);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: staff, error: staffError } = await admin
      .from('staff')
      .select('id, full_name, institution')
      .eq('line_user_id', lineUserId)
      .maybeSingle();
    if (staffError) throw staffError;
    if (!staff) return json({ status: 'not-staff' });

    // One row per device: insert this session as a new device, or (rare —
    // the same device signing in again after losing local storage) update
    // which staff member it belongs to if it already has a row.
    const { error: upsertError } = await admin
      .from('staff_devices')
      .upsert({ staff_id: staff.id, user_id: user.id }, { onConflict: 'user_id' });
    if (upsertError) throw upsertError;

    return json({ status: 'ok', full_name: staff.full_name, institution: staff.institution });
  } catch (err) {
    console.error(err);
    reportFunctionError('link-line-staff', err, {
      where: 'POST link-line-staff',
      context: ['Responded 400 — this device was not linked to the staff member'],
    });
    return json({ error: err instanceof Error ? err.message : 'unexpected error' }, 400);
  }
});
