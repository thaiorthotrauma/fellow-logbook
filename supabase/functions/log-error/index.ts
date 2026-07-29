// Receives error reports from the browser and forwards them to the admin
// Telegram chat.
//
// Deployed WITHOUT JWT verification, on purpose:
//
//   npx supabase functions deploy log-error --no-verify-jwt
//
// Plenty of the failures worth knowing about happen before there is a session
// at all — LIFF init, the whitelist check, the OTP round trip. A reporter that
// only works once you're logged in would miss precisely the errors that stop
// people logging in. When an Authorization header IS present it is used to
// name who hit the error; when it isn't, the report is marked unverified and
// capped at one full send per hour per fingerprint, since this is the only
// unauthenticated path into the chat.
//
// Nothing in the request body is trusted as identity, and none of it is echoed
// as HTML: the message is assembled server-side by _shared/errorMessage.ts and
// every interpolated value is escaped there.
//
// Required secrets: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, and a service-role
// key for the flood-control counters (see _shared/errorReport.ts).
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { reportError, type ContextLine, type Severity } from '../_shared/errorReport.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** Every field is bounded before it reaches the message builder. The builder
 *  truncates too, but an unauthenticated endpoint shouldn't be handed
 *  megabytes to redact in the first place. */
const MAX_FIELD = 500;
const MAX_DETAIL = 4000;
const MAX_CONTEXT_LINES = 6;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function text(value: unknown, max = MAX_FIELD): string {
  return typeof value === 'string' ? value.slice(0, max).trim() : '';
}

/** The browser may only pick from the two tiers that describe its own
 *  failures. 'rejected' and the notifier's own tiers are server business. */
function severityOf(value: unknown): Severity {
  return value === 'degraded' ? 'degraded' : 'error';
}

/** Reads the fellow or staff behind the request's session, if there is one.
 *  Identity is never taken from the body — the report says who the session
 *  belongs to, or says it doesn't know. */
async function identify(authHeader: string): Promise<string | null> {
  if (!authHeader) return null;
  try {
    const user = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await user.auth.getUser();
    if (!userData.user) return null;

    const { data: fellow } = await user
      .from('fellow')
      .select('full_name, institution')
      .maybeSingle();
    if (fellow?.full_name) {
      return fellow.institution ? `${fellow.full_name} · ${fellow.institution}` : fellow.full_name;
    }

    // Returns a set, not a row — read the first, the way staffApi.ts does.
    const { data: staff } = await user.rpc('my_staff_profile');
    const staffRow = (staff as Array<{ full_name?: string; institution?: string }> | null)?.[0];
    if (staffRow?.full_name) {
      return staffRow.institution
        ? `${staffRow.full_name} · ${staffRow.institution} (staff)`
        : `${staffRow.full_name} (staff)`;
    }
    return null;
  } catch {
    // A failed lookup must not cost us the report — the error is the point.
    return null;
  }
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    const payload = await req.json();
    const message = text(payload?.message);
    if (!message) return json({ error: 'message is required' }, 400);

    const authHeader = req.headers.get('Authorization') ?? '';
    const who = await identify(authHeader);
    const verified = who !== null;

    const context: ContextLine[] = Array.isArray(payload?.context)
      ? payload.context
          .slice(0, MAX_CONTEXT_LINES)
          .map((line: unknown) => text(line))
          .filter(Boolean)
      : [];

    await reportError({
      severity: severityOf(payload?.severity),
      kind: 'App error',
      component: text(payload?.component, 80) || 'Unknown',
      // The surface is stated plainly rather than dressed up: an unverified
      // report is still worth having, but you should know what you're reading.
      origin: verified ? 'Frontend' : 'Frontend (unverified)',
      error: message,
      who,
      where: text(payload?.where) || null,
      context,
      detail: text(payload?.detail, MAX_DETAIL) || null,
      fullSends: verified ? 3 : 1,
    });

    // Always 200: the browser is already handling a failure, and a failed
    // report about a failure helps nobody.
    return json({ received: true });
  } catch (err) {
    console.error(err);
    return json({ received: false });
  }
});
