import { describe, expect, it } from 'vitest';
import {
  budgetReachedMessage,
  deliveryGapMessage,
  errorMessage,
  formatWhen,
  occurrenceLine,
  rollupMessage,
} from '../../supabase/functions/_shared/errorMessage';
import {
  describeError,
  fingerprint,
  hasWithheldDetail,
  redact,
  stackOf,
  truncate,
} from '../../supabase/functions/_shared/errorText';

// These builders live with the Edge Functions (Deno) but are plain
// TypeScript, so they're exercised here rather than left untested — the same
// arrangement notify.test.ts uses for the case-message builders.

const AT = new Date('2026-08-02T07:33:00Z'); // 14:33 in +07

describe('errorMessage', () => {
  const msg = errorMessage({
    severity: 'error',
    kind: 'Function error',
    component: 'drive-images',
    origin: 'Edge Function',
    message: 'Drive upload failed: 403 Rate Limit Exceeded',
    who: 'ปองสิทธิ์ โพธิคุณ · สมุทรสาคร',
    where: 'POST drive-images · action=upload',
    context: ['Responded 500 after 2.4 s', ['Request', '019842d1-7f3a']],
    detail: 'at uploadToDrive (drive-images/index.ts:118:11)',
    fingerprint: '3e91ab',
    occurrence: '2nd in 5 min',
    at: AT,
  });

  it('leads with severity, class and component — all a lock screen shows', () => {
    expect(msg.split('\n')[0]).toBe('🔴 <b>Function error · drive-images</b>');
  });

  it('states the surface and the local +07 time on the second line', () => {
    expect(msg.split('\n')[1]).toBe('Edge Function · 2 Aug 2026, 14:33 (+07)');
  });

  it('renders each block in the fixed order', () => {
    const labels = [...msg.matchAll(/<b>(Error|Who|Where|Context)<\/b>/g)].map(m => m[1]);
    expect(labels).toEqual(['Error', 'Who', 'Where', 'Context']);
  });

  it('sets a labelled context value as tappable code', () => {
    expect(msg).toContain('Request <code>019842d1-7f3a</code>');
  });

  it('collapses the stack into an expandable quote', () => {
    expect(msg).toContain('<blockquote expandable>at uploadToDrive');
  });

  it('closes with the fingerprint and the occurrence', () => {
    expect(msg.trimEnd().endsWith('<code>3e91ab</code> · 2nd in 5 min')).toBe(true);
  });
});

describe('errorMessage — omitted blocks', () => {
  it('drops a block entirely rather than showing an empty label', () => {
    const msg = errorMessage({
      severity: 'error',
      kind: 'App error',
      component: 'Save case',
      origin: 'Frontend (unverified)',
      message: 'Failed to fetch',
      at: AT,
    });
    expect(msg).not.toContain('<b>Who</b>');
    expect(msg).not.toContain('<b>Where</b>');
    expect(msg).not.toContain('<b>Context</b>');
    expect(msg).not.toContain('blockquote');
    expect(msg).toBe(
      '🔴 <b>App error · Save case</b>\n' +
        'Frontend (unverified) · 2 Aug 2026, 14:33 (+07)\n\n' +
        '<b>Error</b>\nFailed to fetch',
    );
  });

  it('omits the component separator when there is no component', () => {
    const msg = errorMessage({
      severity: 'degraded',
      kind: 'Telegram delivery gap',
      origin: 'Notifier',
      message: 'telegram 429',
      at: AT,
    });
    expect(msg.split('\n')[0]).toBe('🟠 <b>Telegram delivery gap</b>');
  });
});

describe('errorMessage — severity', () => {
  const base = { kind: 'X', origin: 'Y', message: 'z', at: AT } as const;

  it('marks each tier with its own emoji', () => {
    const emojiOf = (severity: 'error' | 'degraded' | 'rejected' | 'repeating' | 'muted') =>
      errorMessage({ ...base, severity }).slice(0, 2).trim();
    expect(emojiOf('error')).toBe('🔴');
    expect(emojiOf('degraded')).toBe('🟠');
    expect(emojiOf('rejected')).toBe('🛡');
    expect(emojiOf('repeating')).toBe('🔁');
    expect(emojiOf('muted')).toBe('🔇');
  });

  it('calls a rejection a Reason, not an Error — nothing went wrong', () => {
    expect(errorMessage({ ...base, severity: 'rejected' })).toContain('<b>Reason</b>');
    expect(errorMessage({ ...base, severity: 'error' })).toContain('<b>Error</b>');
  });
});

describe('errorMessage — escaping', () => {
  it('escapes every interpolated value', () => {
    const msg = errorMessage({
      severity: 'error',
      kind: 'Function error',
      component: 'a<b>',
      origin: 'x & y',
      message: 'expected <Response> & got null',
      who: 'Dr <someone>',
      where: 'f(a<b)',
      context: [['Header', '<script>']],
      detail: '<frame>',
      at: AT,
    });
    // Only the tags the builder itself emits survive.
    expect(msg).not.toContain('<script>');
    expect(msg).toContain('&lt;script&gt;');
    expect(msg).toContain('expected &lt;Response&gt; &amp; got null');
    expect(msg).toContain('a&lt;b&gt;');
  });
});

describe('formatWhen', () => {
  it('renders +07, not the isolate’s own timezone', () => {
    // 23:30 UTC is the next day in Bangkok — the date has to move with it.
    expect(formatWhen(new Date('2026-08-02T23:30:00Z'))).toBe('3 Aug 2026, 06:30 (+07)');
  });
});

describe('occurrenceLine', () => {
  const start = new Date('2026-08-02T07:28:00Z');
  const now = new Date('2026-08-02T07:33:00Z');

  it('says 1st without a window on the first occurrence', () => {
    expect(occurrenceLine(1, now, now)).toBe('1st');
  });

  it('reports how long the run has been going', () => {
    expect(occurrenceLine(2, start, now)).toBe('2nd in 5 min');
    expect(occurrenceLine(3, start, now)).toBe('3rd in 5 min');
    expect(occurrenceLine(9, start, now)).toBe('9th in 5 min');
  });

  it('uses th for the teens rather than 11st', () => {
    expect(occurrenceLine(11, start, now)).toBe('11th in 5 min');
    expect(occurrenceLine(12, start, now)).toBe('12th in 5 min');
    expect(occurrenceLine(13, start, now)).toBe('13th in 5 min');
    expect(occurrenceLine(21, start, now)).toBe('21st in 5 min');
  });

  it('names the mute, so the silence that follows is never ambiguous', () => {
    expect(occurrenceLine(3, start, now, new Date('2026-08-02T08:33:00Z'))).toBe(
      '3rd in 5 min — muted until 15:33',
    );
  });
});

describe('rollupMessage', () => {
  const msg = rollupMessage(
    {
      fingerprint: '3e91ab',
      headline: 'Function error · drive-images',
      origin: 'Edge Function',
      message: 'Drive upload failed: 403 Rate Limit Exceeded',
      suppressed: 47,
      since: new Date('2026-08-02T07:33:00Z'),
      lastSeen: new Date('2026-08-02T08:31:00Z'),
      peopleAffected: 3,
      stillMuted: true,
    },
    new Date('2026-08-02T08:33:00Z'),
  );

  it('counts what was missed and who it reached', () => {
    expect(msg).toContain('🔁 <b>Repeating · Function error · drive-images</b>');
    expect(msg).toContain('47 more since 14:33 — 3 people affected');
    expect(msg).toContain('Last seen 15:31');
    expect(msg).toContain('Muting for another hour.');
  });

  it('says when the mute has actually lifted', () => {
    const done = rollupMessage(
      {
        fingerprint: 'a1',
        headline: 'X',
        origin: 'Edge Function',
        message: 'y',
        suppressed: 1,
        since: AT,
        lastSeen: AT,
        peopleAffected: 1,
        stillMuted: false,
      },
      AT,
    );
    expect(done).toContain('1 person affected');
    expect(done).toContain('No longer muted.');
  });
});

describe('deliveryGapMessage', () => {
  const msg = deliveryGapMessage(
    'telegram 429: Too Many Requests, retry after 31',
    ['🆕 New case logged', '🔴 Function error · drive-images'],
    new Date('2026-08-02T07:22:00Z'),
    new Date('2026-08-02T07:26:00Z'),
    AT,
  );

  it('names the gap and what fell into it', () => {
    expect(msg).toContain('🟠 <b>Telegram delivery gap</b>');
    expect(msg).toContain('2 messages lost between 14:22 and 14:26');
    expect(msg).toContain('· 🆕 New case logged');
    expect(msg).toContain('Sending has recovered.');
  });
});

describe('budgetReachedMessage', () => {
  it('says the chat has gone quiet on purpose, and where to look instead', () => {
    const msg = budgetReachedMessage(40, new Date('2026-08-02T08:33:00Z'), AT);
    expect(msg).toContain('🔇 <b>Alert budget reached</b>');
    expect(msg).toContain('40 alerts sent in the past hour');
    expect(msg).toContain('Resumes 15:33');
    expect(msg).toContain('Supabase function logs still have everything.');
  });
});

describe('describeError', () => {
  it('unpacks a Postgres error without its row-bearing details', () => {
    const pgError = {
      message: 'new row violates row-level security policy for table "cases"',
      details: 'Failing row contains (uuid, 2026-07-24, 1234567, closed fracture...)',
      hint: null,
      code: '42501',
    };
    const text = describeError(pgError);
    expect(text).toBe(
      'new row violates row-level security policy for table "cases" — (42501)',
    );
    expect(text).not.toContain('Failing row');
    expect(text).not.toContain('1234567');
  });

  it('flags that a detail existed, so its absence reads as deliberate', () => {
    expect(hasWithheldDetail({ details: 'Failing row contains (...)' })).toBe(true);
    expect(hasWithheldDetail({ details: '' })).toBe(false);
    expect(hasWithheldDetail(new Error('boom'))).toBe(false);
  });

  it('handles the ordinary shapes', () => {
    expect(describeError(new Error('boom'))).toBe('boom');
    expect(describeError('boom')).toBe('boom');
    expect(describeError(null)).toBe('Unknown error');
  });
});

describe('redact', () => {
  it('strips a Telegram bot token', () => {
    expect(redact('telegram 401 for bot 8123456789:AAF-abcdefghijklmnopqrstuvwxyz0123456')).toBe(
      'telegram 401 for bot {telegram-token}',
    );
  });

  it('strips JWTs, whatever they are', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc-def_123';
    expect(redact(`invalid token ${jwt}`)).toBe('invalid token {jwt}');
  });

  it('strips Google tokens', () => {
    expect(redact('refresh gave ya29.a0AfH6SMBx-9xQnotarealtoken')).toContain('{google-token}');
  });

  it('strips email addresses — the roster is not chat material', () => {
    expect(redact('no fellow row for somchai.j@hospital.ac.th')).toBe(
      'no fellow row for {email}',
    );
  });

  it('withholds a Postgres row even when it rides in the message', () => {
    expect(redact('DETAIL: Failing row contains (1, 1234567, fracture).')).toBe(
      'DETAIL: Failing row contains (withheld).',
    );
    expect(redact('Key (hn)=(1234567) already exists')).toBe('Key (withheld) already exists');
  });

  it('strips an Authorization header however it was stringified', () => {
    expect(redact('{"authorization":"Bearer abcdefghijklmnop"}')).toContain('{redacted}');
  });

  it('leaves an ordinary message alone', () => {
    expect(redact('Drive upload failed: 403 Rate Limit Exceeded')).toBe(
      'Drive upload failed: 403 Rate Limit Exceeded',
    );
  });
});

describe('truncate', () => {
  it('leaves a short value untouched', () => {
    expect(truncate('short', 400)).toBe('short');
  });

  it('marks a value it cut', () => {
    expect(truncate('abcdefghij', 5)).toBe('abcd…');
  });
});

describe('stackOf', () => {
  it('drops the message line, which the notification already shows', () => {
    const err = new Error('boom');
    err.stack = 'Error: boom\n    at a (f.ts:1:1)\n    at b (f.ts:2:2)';
    expect(stackOf(err)).toBe('at a (f.ts:1:1)\n    at b (f.ts:2:2)');
  });

  it('has nothing to show for a non-Error', () => {
    expect(stackOf({ message: 'x' })).toBeNull();
  });
});

describe('fingerprint', () => {
  it('is six hex characters', async () => {
    expect(await fingerprint('Edge Function', 'drive-images', 'boom')).toMatch(/^[0-9a-f]{6}$/);
  });

  it('is stable for the same failure', async () => {
    const a = await fingerprint('Edge Function', 'drive-images', 'Drive upload failed: 403');
    const b = await fingerprint('Edge Function', 'drive-images', 'Drive upload failed: 403');
    expect(a).toBe(b);
  });

  it('ignores the ids and sizes that differ on every request', async () => {
    const a = await fingerprint('Edge Function', 'notify-case', 'row 3f2a1b4c-1111-2222-3333-444455556666 missing');
    const b = await fingerprint('Edge Function', 'notify-case', 'row 99887766-aaaa-bbbb-cccc-ddddeeeeffff missing');
    expect(a).toBe(b);
  });

  it('keeps an HTTP status, which is part of a failure’s identity', async () => {
    const a = await fingerprint('Edge Function', 'drive-images', 'Drive upload failed: 403');
    const b = await fingerprint('Edge Function', 'drive-images', 'Drive upload failed: 500');
    expect(a).not.toBe(b);
  });

  it('separates the same message coming from different surfaces', async () => {
    const a = await fingerprint('Edge Function', 'drive-images', 'Failed to fetch');
    const b = await fingerprint('Frontend', 'drive-images', 'Failed to fetch');
    expect(a).not.toBe(b);
  });
});
