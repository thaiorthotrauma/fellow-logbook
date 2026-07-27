import { describe, expect, it } from 'vitest';
import { verifyInitData } from '../../supabase/functions/_shared/telegramInitData';

const BOT_TOKEN = '123456:test-bot-token';

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

/** Independently signs a payload the way Telegram does, so the test fixture
 *  doesn't depend on the module under test to build its own inputs. */
async function buildInitData(fields: Record<string, string>): Promise<string> {
  const dataCheckString = Object.keys(fields)
    .sort()
    .map(k => `${k}=${fields[k]}`)
    .join('\n');
  const secretKey = await hmac(new TextEncoder().encode('WebAppData'), BOT_TOKEN);
  const hash = toHex(await hmac(secretKey, dataCheckString));
  return new URLSearchParams({ ...fields, hash }).toString();
}

describe('verifyInitData', () => {
  it('accepts a correctly signed payload and returns the user id', async () => {
    const initData = await buildInitData({
      user: JSON.stringify({ id: 987654321, first_name: 'Admin' }),
      auth_date: '1700000000',
    });
    await expect(verifyInitData(initData, BOT_TOKEN)).resolves.toEqual({ id: 987654321 });
  });

  it('rejects a tampered hash', async () => {
    const initData = await buildInitData({ user: JSON.stringify({ id: 1 }), auth_date: '1700000000' });
    const tampered = initData.replace(/hash=[0-9a-f]+/, `hash=${'0'.repeat(64)}`);
    await expect(verifyInitData(tampered, BOT_TOKEN)).resolves.toBeNull();
  });

  it('rejects a tampered payload signed for a different value', async () => {
    const initData = await buildInitData({ user: JSON.stringify({ id: 1 }), auth_date: '1700000000' });
    const tampered = initData.replace('auth_date=1700000000', 'auth_date=1799999999');
    await expect(verifyInitData(tampered, BOT_TOKEN)).resolves.toBeNull();
  });

  it('rejects a payload signed with a different bot token', async () => {
    const initData = await buildInitData({ user: JSON.stringify({ id: 1 }), auth_date: '1700000000' });
    await expect(verifyInitData(initData, 'a-different-token')).resolves.toBeNull();
  });

  it('rejects a payload missing the hash or the user field', async () => {
    await expect(verifyInitData('auth_date=1700000000', BOT_TOKEN)).resolves.toBeNull();
    const noUser = await buildInitData({ auth_date: '1700000000' });
    await expect(verifyInitData(noUser, BOT_TOKEN)).resolves.toBeNull();
  });

  it('rejects malformed initData without throwing', async () => {
    await expect(verifyInitData('not-a-valid-query-string-at-all', BOT_TOKEN)).resolves.toBeNull();
  });
});
