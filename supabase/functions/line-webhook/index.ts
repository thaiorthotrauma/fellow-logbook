// Receives LINE Messaging API webhook events and forwards inbound chat messages
// to Telegram, so messages sent to the official account aren't missed.
//
// Unlike the app's other functions this one is called by LINE, not the browser,
// so there is no Supabase session to verify. Authenticity is established by the
// X-Line-Signature HMAC instead, which means it MUST be deployed with JWT
// verification turned off, or LINE's requests are rejected before reaching here:
//
//   npx supabase functions deploy line-webhook --no-verify-jwt
//
// Then set the webhook URL in the LINE Developers console (Messaging API
// channel → Webhook URL) to:
//   https://<project-ref>.supabase.co/functions/v1/line-webhook
//
// Required secrets:
//   LINE_MESSAGING_CHANNEL_SECRET — the *Messaging API* channel's secret. This
//     is a different channel from the LINE Login channel used by LIFF, so it is
//     NOT the same value as LINE_CHANNEL_ID.
//   SB_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) — to look up who sent the
//     message; there's no user session to borrow RLS from.
//   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { verifyLineSignature } from '../_shared/line.ts';
import { sendTelegram, telegramConfigured } from '../_shared/telegram.ts';
import { chatMessage } from '../_shared/caseMessage.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const LINE_MESSAGING_CHANNEL_SECRET = Deno.env.get('LINE_MESSAGING_CHANNEL_SECRET') ?? '';

/** Non-text messages have no body to quote, so report what arrived instead. */
const NON_TEXT_LABEL: Record<string, string> = {
  image: '[sent an image]',
  video: '[sent a video]',
  audio: '[sent an audio message]',
  file: '[sent a file]',
  sticker: '[sent a sticker]',
  location: '[sent a location]',
};

interface LineEvent {
  type: string;
  source?: { userId?: string };
  message?: { type: string; text?: string };
}

Deno.serve(async req => {
  // LINE retries — and eventually disables — a webhook that doesn't answer 200,
  // so every path below returns 200 except a failed signature check.
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-line-signature') ?? '';

    const valid = await verifyLineSignature(rawBody, signature, LINE_MESSAGING_CHANNEL_SECRET);
    if (!valid) {
      console.error('Rejected webhook call with an invalid X-Line-Signature');
      return new Response('invalid signature', { status: 401 });
    }

    // The console's "Verify" button posts a signed request with no events.
    const events: LineEvent[] = JSON.parse(rawBody || '{}')?.events ?? [];
    if (events.length === 0) return new Response('ok');

    if (!telegramConfigured()) {
      console.error('LINE message received but Telegram is not configured');
      return new Response('ok');
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    for (const event of events) {
      if (event.type !== 'message' || !event.message) continue;
      const lineUserId = event.source?.userId;
      if (!lineUserId) continue;

      const text =
        event.message.type === 'text'
          ? (event.message.text ?? '').trim()
          : (NON_TEXT_LABEL[event.message.type] ?? `[sent a ${event.message.type}]`);
      if (!text) continue;

      // Service role is required here: there is no session to scope RLS with.
      // Only this row's name/institution is read, to label the notification.
      const { data: fellow, error } = await admin
        .from('fellow')
        .select('full_name, institution')
        .eq('line_user_id', lineUserId)
        .maybeSingle();
      if (error) console.error('Fellow lookup failed:', error);

      const result = await sendTelegram(
        chatMessage(
          lineUserId,
          text,
          fellow?.full_name ?? null,
          fellow?.institution ?? null,
        ),
      );
      if (!result.sent) console.error('Telegram notify failed:', result.error);
    }

    return new Response('ok');
  } catch (err) {
    console.error(err);
    // Swallow the error: a 500 would make LINE retry the same bad event.
    return new Response('ok');
  }
});
