// Verifies a LIFF ID token with LINE's own verification endpoint and returns
// the verified LINE user id (the token's `sub` claim). Never trust a
// client-supplied line user id directly — always go through this.
import { timingSafeEqual } from './security.ts';

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 300;

async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fetch(url, init);
    } catch (err) {
      lastError = err;
      console.error(`fetch attempt ${attempt}/${MAX_ATTEMPTS} to ${url} failed:`, err);
      if (attempt < MAX_ATTEMPTS) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * attempt));
      }
    }
  }
  throw lastError;
}

/** Verifies a Messaging API webhook request really came from LINE: the
 *  X-Line-Signature header is base64(HMAC-SHA256(channel secret, raw body)).
 *  Must be given the EXACT raw body text — re-serializing the parsed JSON
 *  changes the bytes and the signature will never match. */
export async function verifyLineSignature(
  rawBody: string,
  signature: string,
  channelSecret: string,
): Promise<boolean> {
  if (!signature || !channelSecret) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(channelSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return timingSafeEqual(expected, signature);
}

/** Assigns a rich menu to one specific LINE user id (LINE's per-user
 *  richmenu linking endpoint). Throws on any non-2xx response — callers
 *  decide how to surface that (e.g. telling the admin the automatic
 *  assignment failed and the manual curl from line-oa/README.md is still
 *  needed for this person). */
export async function linkRichMenuToUser(
  lineUserId: string,
  richMenuId: string,
  channelAccessToken: string,
): Promise<void> {
  const res = await fetchWithRetry(
    `https://api.line.me/v2/bot/user/${encodeURIComponent(lineUserId)}/richmenu/${encodeURIComponent(richMenuId)}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${channelAccessToken}` },
    },
  );
  if (!res.ok) {
    throw new Error(`LINE richmenu link failed: ${res.status} ${await res.text()}`);
  }
}

export async function verifyLineIdToken(idToken: string, channelId: string): Promise<string> {
  const res = await fetchWithRetry('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id_token: idToken, client_id: channelId }),
  });

  if (!res.ok) {
    throw new Error(`LINE id_token verification failed: ${res.status} ${await res.text()}`);
  }

  const payload = await res.json();
  if (!payload.sub) {
    throw new Error('LINE id_token verification response missing sub');
  }
  return payload.sub as string;
}
