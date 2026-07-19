// Verifies a LIFF ID token with LINE's own verification endpoint and returns
// the verified LINE user id (the token's `sub` claim). Never trust a
// client-supplied line user id directly — always go through this.
export async function verifyLineIdToken(idToken: string, channelId: string): Promise<string> {
  const res = await fetch('https://api.line.me/oauth2/v2.1/verify', {
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
