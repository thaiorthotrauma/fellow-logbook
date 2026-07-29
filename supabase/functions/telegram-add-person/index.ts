// Handles submissions from the "Add Person" Telegram Mini App — the same
// underlying inserts as the /addfellow and /addstaff bot commands, just fed
// structured JSON from a form instead of a "|"-delimited chat command.
//
// Unlike telegram-webhook (called by Telegram's own servers, authenticated by
// the X-Telegram-Bot-Api-Secret-Token header), this is called directly by the
// Mini App's WebView, so authenticity instead comes from Telegram's signed
// `initData` string (see _shared/telegramInitData.ts) — admin-ness is still
// the same TELEGRAM_ADMIN_IDS allowlist telegram-webhook uses.
//
// Deploy like check-line-user (default JWT verification is fine — the
// frontend calls this with only the anon key, no user session):
//   npx supabase functions deploy telegram-add-person
//
// Then point the bot's menu button at the deployed app (replace the
// placeholders — the app URL is the same Vercel deployment the rest of the
// app runs on, with ?view=addperson):
//   curl "https://api.telegram.org/bot<TOKEN>/setChatMenuButton" \
//     -d "menu_button={\"type\":\"web_app\",\"text\":\"Add Person\",\"web_app\":{\"url\":\"https://<app-domain>/?view=addperson\"}}"
//
// Always answers 200 with { ok }: a bad submission is an expected outcome
// the Mini App renders inline, not a server error.
//
// Required secrets: TELEGRAM_BOT_TOKEN, TELEGRAM_ADMIN_IDS, TELEGRAM_CHAT_ID
// (for the confirmation posted to the admin chat), SB_SECRET_KEY (or
// SUPABASE_SERVICE_ROLE_KEY)
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { verifyInitData } from '../_shared/telegramInitData.ts';
import { reportFunctionError, reportRejected } from '../_shared/errorReport.ts';
import { sendTelegram } from '../_shared/telegram.ts';
import { esc } from '../_shared/html.ts';
import { isValidEmail, escapeLikePattern, type ExistingFellow } from '../_shared/fellowCommands.ts';
import type { ExistingStaff } from '../_shared/staffCommands.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BOT_TOKEN = (Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '').trim();
const ADMIN_IDS = new Set(
  (Deno.env.get('TELEGRAM_ADMIN_IDS') ?? '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean),
);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

interface Payload {
  initData?: string;
  role?: 'fellow' | 'staff';
  firstName?: string;
  lastName?: string;
  institution?: string;
  email?: string;
  lineUserId?: string;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    if (BOT_TOKEN === '') return json({ ok: false, error: 'not-configured' });

    const payload: Payload = await req.json();
    if (!payload.initData || typeof payload.initData !== 'string') {
      return json({ ok: false, error: 'missing-initdata' });
    }

    const user = await verifyInitData(payload.initData, BOT_TOKEN);
    if (!user) {
      void reportRejected('Add Person Mini App', 'Telegram Mini App', 'initData signature did not verify', [
        'Opened outside Telegram, or the signature was tampered with',
      ]);
      return json({ ok: false, error: 'invalid-initdata' });
    }
    if (!ADMIN_IDS.has(String(user.id))) {
      void reportRejected('Add Person Mini App', 'Telegram Mini App', 'Telegram id is outside TELEGRAM_ADMIN_IDS', [
        ['Telegram id', String(user.id)],
        'The signature was valid — this is a real Telegram user, not an admin',
      ]);
      return json({ ok: false, error: 'not-admin' });
    }

    const firstName = (payload.firstName ?? '').trim();
    const lastName = (payload.lastName ?? '').trim();
    const institution = (payload.institution ?? '').trim();
    const fullName = [firstName, lastName].filter(Boolean).join(' ');
    if (!fullName || !institution) return json({ ok: false, error: 'missing-fields' });

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    if (payload.role === 'fellow') {
      const email = (payload.email ?? '').trim();
      if (!isValidEmail(email)) return json({ ok: false, error: 'invalid-email' });

      const { data: existing, error: existingError } = await admin
        .from('fellow')
        .select('full_name, institution, verified')
        .ilike('email', escapeLikePattern(email))
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing) return json({ ok: false, error: 'duplicate', existing: existing as ExistingFellow });

      const { error: insertError } = await admin.from('fellow').insert({ full_name: fullName, email, institution });
      if (insertError) throw insertError;

      const { count } = await admin.from('fellow').select('id', { count: 'exact', head: true });
      await sendTelegram(
        `✅ <b>Fellow added</b> (via Add Person)\n` +
          `<b>Name</b> ${esc(fullName)}\n` +
          `<b>Email</b> <code>${esc(email)}</code>\n` +
          `<b>Institution</b> ${esc(institution)}\n\n` +
          `Not yet verified — they become active the first time they sign in themselves.\n` +
          `Roster now has ${count ?? 0} fellow${count === 1 ? '' : 's'}.`,
      );
      return json({ ok: true });
    }

    if (payload.role === 'staff') {
      const lineUserId = (payload.lineUserId ?? '').trim();
      if (!lineUserId) return json({ ok: false, error: 'missing-fields' });

      const { data: existing, error: existingError } = await admin
        .from('staff')
        .select('full_name, institution')
        .eq('line_user_id', lineUserId)
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing) return json({ ok: false, error: 'duplicate', existing: existing as ExistingStaff });

      const { error: insertError } = await admin
        .from('staff')
        .insert({ full_name: fullName, institution, line_user_id: lineUserId });
      if (insertError) throw insertError;

      const { count } = await admin.from('staff').select('id', { count: 'exact', head: true });
      await sendTelegram(
        `✅ <b>Staff added</b> (via Add Person)\n` +
          `<b>Name</b> ${esc(fullName)}\n` +
          `<b>Institution</b> ${esc(institution)}\n\n` +
          `Active immediately — staff sign in by LINE id alone, no verification step.\n` +
          `Roster now has ${count ?? 0} staff member${count === 1 ? '' : 's'}.`,
      );
      return json({ ok: true });
    }

    return json({ ok: false, error: 'invalid-role' });
  } catch (err) {
    console.error(err);
    reportFunctionError('telegram-add-person', err, {
      where: 'POST telegram-add-person',
      context: ['The Mini App showed "unexpected" and added nobody'],
    });
    return json({ ok: false, error: 'unexpected' });
  }
});
