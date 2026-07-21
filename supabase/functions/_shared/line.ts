// Verifies a LIFF ID token with LINE's own verification endpoint and returns
// the verified LINE user id (the token's `sub` claim). Never trust a
// client-supplied line user id directly — always go through this.
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
