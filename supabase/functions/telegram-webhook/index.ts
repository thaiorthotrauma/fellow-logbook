// Receives Telegram Bot API webhook updates and handles the roster admin
// commands: /add, /remove, /list.
//
// Unlike the app's other functions this one is called by Telegram, not the
// browser, so there is no Supabase session to verify. It MUST be deployed with
// JWT verification off, or Telegram's requests are rejected before reaching
// here:
//
//   npx supabase functions deploy telegram-webhook --no-verify-jwt
//
// Two independent gates before anything is written, since the physicians
// table is the access whitelist for an app holding patient data:
//   1. X-Telegram-Bot-Api-Secret-Token header == TELEGRAM_WEBHOOK_SECRET
//      Proves the request really came from Telegram (registered via
//      setWebhook's secret_token param — see the deploy notes below).
//   2. The sender's numeric Telegram user id is in TELEGRAM_ADMIN_IDS.
//      Gate 1 only proves Telegram delivered it; anyone who finds the bot can
//      message it, so a second check establishes it's actually an admin.
// A message that fails either gets no reply at all (not "not authorised",
// which would confirm to a stranger that they'd found an admin tool) — logged
// server-side instead.
//
// After deploying, register the webhook once (replace the placeholders):
//   curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
//     -d "url=https://<project-ref>.supabase.co/functions/v1/telegram-webhook" \
//     -d "secret_token=<the same value as TELEGRAM_WEBHOOK_SECRET>"
//
// Required secrets:
//   TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, TELEGRAM_ADMIN_IDS (comma-
//   separated Telegram user ids), SB_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY)
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { timingSafeEqual } from '../_shared/security.ts';
import { sendTelegramTo } from '../_shared/telegram.ts';
import {
  addUsageMessage,
  addedMessage,
  alreadyExistsMessage,
  cannotRemoveMessage,
  escapeLikePattern,
  invalidEmailMessage,
  listMessage,
  notFoundMessage,
  parseAddArgs,
  parseCommand,
  removeUsageMessage,
  removedMessage,
  unknownCommandMessage,
  type ExistingPhysician,
  type RosterRow,
} from '../_shared/physicianCommands.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const WEBHOOK_SECRET = (Deno.env.get('TELEGRAM_WEBHOOK_SECRET') ?? '').trim();
const ADMIN_IDS = new Set(
  (Deno.env.get('TELEGRAM_ADMIN_IDS') ?? '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean),
);

interface TelegramUpdate {
  message?: {
    text?: string;
    from?: { id?: number };
    chat?: { id?: number };
  };
}

Deno.serve(async req => {
  // Telegram retries a webhook that doesn't answer 200, so every reachable
  // path below returns 200 except a failed secret-token check.
  try {
    const provided = (req.headers.get('x-telegram-bot-api-secret-token') ?? '').trim();
    if (WEBHOOK_SECRET === '' || !timingSafeEqual(provided, WEBHOOK_SECRET)) {
      console.error('Rejected webhook call with an invalid secret token');
      return new Response('invalid secret token', { status: 401 });
    }

    const update: TelegramUpdate = await req.json();
    const message = update.message;
    const chatId = message?.chat?.id;
    const senderId = message?.from?.id;
    const text = message?.text;
    if (!chatId || !senderId || !text) return new Response('ok');

    // Gate 2. Silence, not a rejection message — see the file header.
    if (!ADMIN_IDS.has(String(senderId))) {
      console.error(`Ignored command from non-admin Telegram id ${senderId}`);
      return new Response('ok');
    }

    const command = parseCommand(text);
    if (!command) return new Response('ok'); // not a slash command — ignore

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const reply = (html: string) => sendTelegramTo(String(chatId), html);

    if (command.name === 'add') {
      const parsed = parseAddArgs(command.args);
      if (!parsed.ok) {
        await reply(parsed.error === 'usage' ? addUsageMessage() : invalidEmailMessage(parsed.email ?? ''));
        return new Response('ok');
      }

      const { data: existing, error: existingError } = await admin
        .from('physicians')
        .select('full_name, institution, verified')
        .ilike('email', escapeLikePattern(parsed.value.email))
        .maybeSingle();
      if (existingError) throw existingError;

      if (existing) {
        await reply(alreadyExistsMessage(parsed.value.email, existing as ExistingPhysician));
        return new Response('ok');
      }

      const { error: insertError } = await admin.from('physicians').insert({
        full_name: parsed.value.fullName,
        email: parsed.value.email,
        institution: parsed.value.institution,
      });
      if (insertError) throw insertError;

      const { count } = await admin.from('physicians').select('id', { count: 'exact', head: true });
      await reply(addedMessage(parsed.value, count ?? 0));
      return new Response('ok');
    }

    if (command.name === 'remove') {
      const email = command.args.trim();
      if (!email) {
        await reply(removeUsageMessage());
        return new Response('ok');
      }

      const { data: row, error: rowError } = await admin
        .from('physicians')
        .select('id, full_name, verified, user_id, line_user_id')
        .ilike('email', escapeLikePattern(email))
        .maybeSingle();
      if (rowError) throw rowError;

      if (!row) {
        await reply(notFoundMessage(email));
        return new Response('ok');
      }

      // Restricted to a row that has never been signed into: this makes
      // /remove a typo eraser that cannot affect a real, active fellow or
      // anything they've logged.
      if (row.verified || row.user_id || row.line_user_id) {
        await reply(cannotRemoveMessage(row.full_name as string));
        return new Response('ok');
      }

      const { error: deleteError } = await admin.from('physicians').delete().eq('id', row.id);
      if (deleteError) throw deleteError;

      await reply(removedMessage(email));
      return new Response('ok');
    }

    if (command.name === 'list') {
      const { data: rows, error: listError } = await admin
        .from('physicians')
        .select('full_name, verified')
        .order('full_name');
      if (listError) throw listError;

      await reply(listMessage((rows ?? []) as RosterRow[]));
      return new Response('ok');
    }

    await reply(unknownCommandMessage(command.text));
    return new Response('ok');
  } catch (err) {
    console.error(err);
    // Still 200: an error here shouldn't make Telegram retry the same update.
    return new Response('ok');
  }
});
