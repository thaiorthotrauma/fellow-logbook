// Verifies a Telegram Mini App's `initData` string and extracts the sender's
// Telegram user id.
//
// Unlike telegram-webhook (called by Telegram's own servers, authenticated by
// the X-Telegram-Bot-Api-Secret-Token header), a Mini App page runs in a
// WebView and calls our Edge Function directly — there's no such header to
// check. Instead Telegram signs `initData` itself; this reproduces that
// signature and compares it, per
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
//
// Uses only Web Crypto (`crypto.subtle`), available in Deno, browsers, and
// Node — so unlike most of this app's Edge Function code, it can be
// unit-tested directly from the vitest suite.
import { timingSafeEqual } from './security.ts';

async function hmac(key: Uint8Array, message: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
  return new Uint8Array(sig);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export interface TelegramUser {
  id: number;
}

/** Returns the verified sender, or null if the signature is invalid,
 *  malformed, or missing a user. Never throws — a bad initData is just "not
 *  verified", not an exception to propagate. */
export async function verifyInitData(initData: string, botToken: string): Promise<TelegramUser | null> {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;
    params.delete('hash');

    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');

    const secretKey = await hmac(new TextEncoder().encode('WebAppData'), botToken);
    const computedHash = toHex(await hmac(secretKey, dataCheckString));
    if (!timingSafeEqual(computedHash, hash)) return null;

    const userJson = params.get('user');
    if (!userJson) return null;
    const user = JSON.parse(userJson) as { id?: unknown };
    if (typeof user.id !== 'number') return null;
    return { id: user.id };
  } catch {
    return null;
  }
}
