// Sends a Telegram notification when a fellow adds, edits, or deletes a case.
//
// Called by the app right after a successful insert/update — and, for a
// delete, right BEFORE the row is removed (see the 'deleted' case below for
// why). The bot token must stay server-side, so the browser can't post to
// Telegram itself.
//
// The case content is re-read from the database here rather than accepted from
// the caller, so a notification always reflects a real, stored row owned by the
// caller — the request body can't be used to push arbitrary text into the admin
// chat. The one exception is `previous` (an edit's prior values), which only the
// client knows; it is used solely to render the "was → now" diff.
//
// Actions (POST JSON):
//   { kind: 'created', caseId }
//   { kind: 'updated', caseId, previous: { <column>: <old value>, ... } }
//   { kind: 'deleted', caseId }   — call this BEFORE deleting the row
//
// Always answers 200 with { sent } — a notification failure must never surface
// as a failed save. Deployed like the other functions (JWT verified):
//   npx supabase functions deploy notify-case
//
// Required secrets: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID (see _shared/telegram.ts)
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { sendTelegram, telegramConfigured } from '../_shared/telegram.ts';
import { reportFunctionError } from '../_shared/errorReport.ts';
import {
  deletedCaseMessage,
  editedCaseMessage,
  newCaseMessage,
  type CaseRow,
} from '../_shared/caseMessage.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

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

const CASE_COLUMNS =
  'date, timing, place, staff, hn, diagnosis, ao_code, other_classification, ' +
  'approach, position, procedure, procedure_type, role, op_time, memo, image_paths';

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    // Nothing to do when Telegram isn't set up — skip before touching the DB.
    if (!telegramConfigured()) return json({ sent: false, skipped: 'not configured' });

    const authHeader = req.headers.get('Authorization') ?? '';
    const user = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await user.auth.getUser();
    if (userError || !userData.user) return json({ error: 'not authenticated' }, 401);

    const payload = await req.json();
    const { kind, caseId } = payload ?? {};
    if (typeof caseId !== 'string' || !caseId) return json({ error: 'caseId is required' }, 400);
    if (kind !== 'created' && kind !== 'updated' && kind !== 'deleted') {
      return json({ error: `unknown kind: ${kind}` }, 400);
    }

    // RLS ("auth.uid() = user_id") scopes this to the caller's own cases, so an
    // id belonging to another fellow simply matches no row.
    const { data: row, error: rowError } = await user
      .from('cases')
      .select(CASE_COLUMNS)
      .eq('id', caseId)
      .maybeSingle();
    if (rowError) throw rowError;
    if (!row) return json({ error: 'not found' }, 404);

    // Identity comes from the fellow table, not the request body.
    const { data: fellow } = await user
      .from('fellow')
      .select('full_name, institution')
      .maybeSingle();
    const fellowName = fellow?.full_name ?? '';
    const institution = fellow?.institution ?? null;

    let message: string | null;
    if (kind === 'created') {
      const { count } = await user.from('cases').select('id', { count: 'exact', head: true });
      message = newCaseMessage(row as unknown as CaseRow, fellowName, institution, count ?? 0);
    } else if (kind === 'deleted') {
      // The row still exists at this point (called before the delete), so the
      // current total still counts it — subtract one to report what the
      // roster will have once the caller goes on to actually delete it.
      const { count } = await user.from('cases').select('id', { count: 'exact', head: true });
      message = deletedCaseMessage(
        row as unknown as CaseRow,
        fellowName,
        institution,
        Math.max(0, (count ?? 1) - 1),
      );
    } else {
      const previous = payload?.previous;
      if (previous === null || typeof previous !== 'object' || Array.isArray(previous)) {
        return json({ error: 'previous must be an object' }, 400);
      }
      message = editedCaseMessage(
        row as unknown as CaseRow,
        previous as Record<string, unknown>,
        fellowName,
        institution,
      );
    }

    // An edit that changed nothing produces no message.
    if (!message) return json({ sent: false, skipped: 'no changes' });

    const result = await sendTelegram(message);
    if (!result.sent) console.error('Telegram notify failed:', result.error);
    return json({ sent: result.sent });
  } catch (err) {
    console.error(err);
    // The case notification is what failed, so it can't be the thing that
    // tells you — hence a separate report on the error path.
    reportFunctionError('notify-case', err, {
      where: 'POST notify-case',
      context: ['Responded 200 — the case itself was saved; only its notification was lost'],
    });
    // Still a 200: the case is already saved, and the app must not report a
    // failure just because the notification didn't go out.
    return json({ sent: false, error: err instanceof Error ? err.message : 'unexpected error' });
  }
});
