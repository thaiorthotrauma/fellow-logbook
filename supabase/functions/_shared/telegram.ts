// Sends admin notifications to a Telegram chat via the Bot API.
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

/** Posts an HTML message. Never throws: a Telegram outage must not turn into a
 *  failed case save, so the outcome is returned for the caller to log. */
export async function sendTelegram(html: string): Promise<SendResult> {
  const { token, chatId } = config();
  if (token === '' || chatId === '') {
    return { sent: false, error: 'telegram not configured' };
  }
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
      return { sent: false, error: `telegram ${res.status}: ${await res.text()}` };
    }
    return { sent: true };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : 'send failed' };
  }
}
