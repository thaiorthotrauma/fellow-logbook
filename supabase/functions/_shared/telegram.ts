// Sends messages via the Telegram Bot API — admin notifications to a fixed
// chat, and replies to whoever messaged the bot (the roster commands below).
//
// The bot token is a secret, so every send happens server-side — the browser
// never holds it and never talks to Telegram directly.
//
// Required secrets (supabase secrets set ...):
//   TELEGRAM_BOT_TOKEN  — from @BotFather
//   TELEGRAM_CHAT_ID    — the chat to notify (your own user id, or a group id;
//                         group ids are negative, e.g. -1001234567890)
//
// Notifications are advisory: when the secrets are absent, sends are skipped
// rather than failing, so the app keeps working with Telegram unconfigured.

import { deliveryGapMessage } from './errorMessage.ts';

/** Read per call rather than once at module load: a warm isolate would
 *  otherwise keep serving the values captured at cold start, so correcting a
 *  secret would appear to have no effect until the function was redeployed.
 *  Trimmed because a value pasted with a trailing space or newline is
 *  indistinguishable from a wrong one in Telegram's errors — a padded chat id
 *  fails as "chat not found". */
function config(): { token: string; chatId: string } {
  return {
    token: (Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '').trim(),
    chatId: (Deno.env.get('TELEGRAM_CHAT_ID') ?? '').trim(),
  };
}

/** False when the Telegram secrets aren't set, in which case sends no-op. */
export function telegramConfigured(): boolean {
  const { token, chatId } = config();
  return token !== '' && chatId !== '';
}

export interface SendResult {
  sent: boolean;
  error?: string;
}

/** Telegram failing is the one fault that cannot be reported through the
 *  channel it is about. Until now every caller logged it to a console nobody
 *  reads, so a rate-limited or misconfigured bot looked exactly like a quiet
 *  week. Failed sends leave their headline here, and the next send that
 *  SUCCEEDS leads with a summary of the gap.
 *
 *  Deliberately not a retry queue: nothing is stored and nothing is replayed.
 *  The alert is that a gap happened, not what was in it. An isolate recycled
 *  before it recovers loses the buffer, and a total Telegram outage is
 *  invisible by construction — both accepted, because these are advisory
 *  notifications and every one of them is also a console.error, which leaves
 *  Supabase's function logs as the system of record. */
interface Gap {
  headlines: string[];
  from: Date;
  to: Date;
  lastError: string;
}
let gap: Gap | null = null;

/** Guards against the obvious recursion: a failed gap report must never
 *  itself be buffered and reported. */
let reportingGap = false;

const MAX_GAP_HEADLINES = 5;

/** The first line of a message with its tags stripped — "🔴 Function error ·
 *  drive-images". Derived rather than passed in so every existing caller
 *  keeps working unchanged. */
function headlineOf(html: string): string {
  const firstLine = html.split('\n', 1)[0] ?? '';
  return firstLine
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
}

function recordGap(html: string, error: string): void {
  if (reportingGap) return;
  const now = new Date();
  if (gap === null) {
    gap = { headlines: [], from: now, to: now, lastError: error };
  }
  gap.to = now;
  gap.lastError = error;
  // Keep the first few: which failure started the gap is more useful than
  // which one happened to be last, and the count is reported in full anyway.
  if (gap.headlines.length < MAX_GAP_HEADLINES) gap.headlines.push(headlineOf(html));
  else gap.headlines.length = MAX_GAP_HEADLINES;
}

/** Emits the gap summary, if one is pending, before the message that proved
 *  sending works again. Failures here are dropped rather than re-buffered —
 *  the caller's own message is what matters. */
async function flushGap(token: string, chatId: string): Promise<void> {
  const pending = gap;
  if (pending === null) return;
  gap = null;
  reportingGap = true;
  try {
    await postMessage(
      token,
      chatId,
      deliveryGapMessage(pending.lastError, pending.headlines, pending.from, pending.to),
    );
  } catch (err) {
    console.error('Telegram gap report failed:', err);
  } finally {
    reportingGap = false;
  }
}

async function postMessage(token: string, chatId: string, html: string): Promise<SendResult> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: html,
        parse_mode: 'HTML',
        // These are internal notes, not link previews.
        link_preview_options: { is_disabled: true },
      }),
    });
    if (!res.ok) {
      const error = `telegram ${res.status}: ${await res.text()}`;
      recordGap(html, error);
      return { sent: false, error };
    }
    return { sent: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'send failed';
    recordGap(html, error);
    return { sent: false, error };
  }
}

/** Posts an HTML message to the fixed notification chat (TELEGRAM_CHAT_ID).
 *  Never throws: a Telegram outage must not turn into a failed case save, so
 *  the outcome is returned for the caller to log. */
export async function sendTelegram(html: string): Promise<SendResult> {
  const { token, chatId } = config();
  if (token === '' || chatId === '') {
    // Not a delivery gap: nothing is broken, Telegram simply isn't set up.
    return { sent: false, error: 'telegram not configured' };
  }
  await flushGap(token, chatId);
  return postMessage(token, chatId, html);
}

/** Posts an HTML message to a specific chat — used to reply to whoever sent a
 *  command, which may not be TELEGRAM_CHAT_ID. Only needs the bot token, since
 *  the destination is given explicitly rather than read from config. */
export async function sendTelegramTo(chatId: string, html: string): Promise<SendResult> {
  const { token } = config();
  if (token === '') return { sent: false, error: 'telegram not configured' };
  return postMessage(token, chatId, html);
}
