// Turns whatever was thrown into the text an error notification may carry.
//
// Three jobs, deliberately kept apart from the message layout in
// errorMessage.ts so each is testable on its own:
//   describeError  — thrown value → one readable line
//   redact         — strip secrets and patient data out of that line
//   fingerprint    — stable six-hex id for "the same bug", used by flood control
//
// No Deno APIs beyond Web Crypto, so the app's own Vitest suite can exercise
// all of it (see src/lib/errorText.test.ts), the way notify.test.ts already
// exercises the case-message builders.

/** Mirrors describeError in src/lib/errors.ts with ONE deliberate difference:
 *  Postgres `details` is never included. On a constraint or RLS failure
 *  PostgREST sets it to "Failing row contains (...)" — the whole row, HN and
 *  diagnosis included — which must not reach a Telegram chat. `message`,
 *  `hint` and `code` are enough to act on; the report says a detail was
 *  withheld rather than what it said. */
export function describeError(err: unknown): string {
  if (err == null) return 'Unknown error';
  if (typeof err === 'string') return err;
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'object') {
    const o = err as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof o.message === 'string' && o.message) parts.push(o.message);
    if (typeof o.hint === 'string' && o.hint) parts.push(`hint: ${o.hint}`);
    if (typeof o.code === 'string' && o.code) parts.push(`(${o.code})`);
    if (parts.length) return parts.join(' — ');
    try {
      return JSON.stringify(err);
    } catch {
      // circular or otherwise unserialisable — fall through
    }
  }
  return String(err);
}

/** True when a caught value is a Postgres error carrying a row-bearing
 *  `details`, so the report can say the detail was withheld instead of
 *  dropping it without trace. */
export function hasWithheldDetail(err: unknown): boolean {
  if (err == null || typeof err !== 'object') return false;
  const detail = (err as Record<string, unknown>).details;
  return typeof detail === 'string' && detail.trim() !== '';
}

/** The stack of a thrown Error, minus its first line — that line is the
 *  message, which the notification already shows on its own. */
export function stackOf(err: unknown): string | null {
  if (!(err instanceof Error) || !err.stack) return null;
  const lines = err.stack.split('\n');
  const frames = lines[0].includes(err.message) ? lines.slice(1) : lines;
  const trimmed = frames.join('\n').trim();
  return trimmed || null;
}

/** Patterns scrubbed from every string that goes into a notification.
 *  Applied by rule rather than by remembering to leave things out: an error
 *  message is assembled by code nobody audited for what it interpolates. */
const SCRUBS: Array<[RegExp, string]> = [
  // Telegram bot token: "<numeric bot id>:<35-char secret>".
  [/\b\d{6,}:[A-Za-z0-9_-]{30,}\b/g, '{telegram-token}'],
  // Any JWT — Supabase anon/service keys, LIFF id tokens, session tokens.
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+/g, '{jwt}'],
  // Google OAuth access and refresh tokens.
  [/\bya29\.[A-Za-z0-9._-]{10,}/g, '{google-token}'],
  [/\b1\/\/[A-Za-z0-9._-]{20,}/g, '{google-refresh-token}'],
  // Supabase publishable / secret key formats.
  [/\bsb_(?:secret|publishable)_[A-Za-z0-9_-]{10,}/g, '{supabase-key}'],
  [/\bsbp_[A-Za-z0-9]{20,}/g, '{supabase-key}'],
  // Authorization headers, however they happened to be stringified.
  [/(authorization["'\s:=]+)(?:bearer\s+)?[A-Za-z0-9._-]{12,}/gi, '$1{redacted}'],
  // Email addresses: the roster's contact list must not leak into chat.
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '{email}'],
  // Postgres drags the offending row along in some messages, not only in
  // `details` — belt and braces, since that row is patient data.
  [/Failing row contains \([^)]*\)/gi, 'Failing row contains (withheld)'],
  [/Key \([^)]*\)=\([^)]*\)/g, 'Key (withheld)'],
];

/** Removes secrets and row data from a string bound for Telegram. */
export function redact(text: string): string {
  let out = text ?? '';
  for (const [pattern, replacement] of SCRUBS) out = out.replace(pattern, replacement);
  return out;
}

/** Shortens to `max` characters, marking that it was cut. Telegram rejects a
 *  message over 4096 characters outright, so every variable-length field is
 *  bounded before the message is assembled rather than after. */
export function truncate(text: string, max: number): string {
  const value = text ?? '';
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/** Collapses the parts of a message that vary run to run, so two occurrences
 *  of one bug hash alike: ids, sizes and durations differ on every request but
 *  say nothing about which bug it is. Short numbers survive — an HTTP status
 *  is part of a failure's identity, not noise. */
function normalise(message: string): string {
  return message
    .toLowerCase()
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '{uuid}')
    .replace(/\b[0-9a-f]{16,}\b/g, '{hex}')
    .replace(/\b\d+(?:\.\d+)?\s?(?:ms|kb|mb|gb|bytes)\b/g, '{size}')
    .replace(/\b\d{4,}\b/g, '{n}')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Six hex characters over surface + call site + normalised message. Short
 *  enough to read aloud, wide enough (16.7M) that a collision between the
 *  handful of distinct failures this app can produce isn't a concern. */
export async function fingerprint(origin: string, where: string, message: string): Promise<string> {
  const input = `${origin} ${where} ${normalise(message)}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest).slice(0, 3))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
