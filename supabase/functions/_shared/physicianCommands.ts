// Parses and renders the /add, /remove, /list admin commands sent to the bot.
//
// Kept free of any Deno/Supabase dependency (pure string in, string out) so it
// can be unit-tested from the app's own vitest suite, the same pattern as
// caseMessage.ts. The webhook function (telegram-webhook/index.ts) does the
// actual database reads/writes and calls these only to parse input and render
// replies.
import { esc } from './html.ts';

export type Command =
  | { name: 'add'; args: string }
  | { name: 'remove'; args: string }
  | { name: 'list'; args: string }
  | { name: 'unknown'; text: string };

/** Recognizes "/add ...", "/add@BotName ..." (Telegram appends the bot's
 *  username in a group chat), case-insensitively. Returns null for anything
 *  that isn't a slash command, so non-command chat is silently ignored. */
export function parseCommand(text: string): Command | null {
  const match = /^\/(\w+)(?:@\S+)?(?:\s+([\s\S]*))?$/.exec(text.trim());
  if (!match) return null;
  const name = match[1].toLowerCase();
  const args = (match[2] ?? '').trim();
  if (name === 'add' || name === 'remove' || name === 'list') return { name, args };
  return { name: 'unknown', text: match[1] };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email);
}

/** Escapes ILIKE wildcard characters so a case-insensitive email lookup can't
 *  be widened by characters that are completely ordinary in a real address —
 *  "_" is common in a local part and would otherwise act as a single-char
 *  wildcard, letting "john_doe@x.com" match a lookup for "johnxdoe@x.com". */
export function escapeLikePattern(text: string): string {
  return text.replace(/[\\%_]/g, m => `\\${m}`);
}

export interface AddInput {
  fullName: string;
  email: string;
  institution: string | null;
}

export type ParsedAdd =
  | { ok: true; value: AddInput }
  | { ok: false; error: 'usage' | 'invalid-email'; email?: string };

/** "name | email | institution" (institution optional). Split on "|" rather
 *  than whitespace because Thai names contain spaces and emails don't. */
export function parseAddArgs(args: string): ParsedAdd {
  const parts = args.split('|').map(p => p.trim());
  const [fullName, email, institution] = parts;
  if (!fullName || !email) return { ok: false, error: 'usage' };
  if (!isValidEmail(email)) return { ok: false, error: 'invalid-email', email };
  return { ok: true, value: { fullName, email, institution: institution || null } };
}

const ADD_USAGE =
  `Couldn't read that\n` +
  `Separate the fields with <code>|</code> :\n\n` +
  `<code>/add name | email | institution</code>\n\n` +
  `Institution is optional.`;

export function addUsageMessage(): string {
  return ADD_USAGE;
}

export function invalidEmailMessage(email: string): string {
  return (
    `That email doesn't look right\n` +
    `<code>${esc(email)}</code> has no domain ending.\n\n` +
    `Nothing was added. This is the address they'll sign in with, so it has to be exact.`
  );
}

export function addedMessage(input: AddInput, totalCount: number): string {
  return (
    `✅ <b>Physician added</b>\n` +
    `<b>Name</b> ${esc(input.fullName)}\n` +
    `<b>Email</b> <code>${esc(input.email)}</code>\n` +
    (input.institution ? `<b>Institution</b> ${esc(input.institution)}\n\n` : `\n`) +
    `Not yet verified — they become active the first time they sign in themselves.\n` +
    `Roster now has ${totalCount} physician${totalCount === 1 ? '' : 's'}.`
  );
}

export interface ExistingPhysician {
  full_name: string;
  institution: string | null;
  verified: boolean;
}

export function alreadyExistsMessage(email: string, existing: ExistingPhysician): string {
  return (
    `⚠️ <b>Already on the roster</b>\n` +
    `<code>${esc(email)}</code> is registered to <b>${esc(existing.full_name)}</b>` +
    (existing.institution ? ` (${esc(existing.institution)})` : '') +
    `, ${existing.verified ? 'verified' : 'not yet verified'}.\n\n` +
    `Nothing was changed. Email is the login identity, so it's matched ignoring case.`
  );
}

const REMOVE_USAGE = `Usage:\n<code>/remove email</code>`;

export function removeUsageMessage(): string {
  return REMOVE_USAGE;
}

export function notFoundMessage(email: string): string {
  return `No physician found with <code>${esc(email)}</code>.`;
}

/** Deliberately vague about *why* — "already verified" vs "already linked"
 *  both amount to the same operator action (fix it in the SQL editor), and
 *  spelling out the exact reason isn't worth a second message shape. */
export function cannotRemoveMessage(fullName: string): string {
  return (
    `⛔ <b>Can't remove ${esc(fullName)}</b>\n` +
    `This physician has already signed in at least once, so removing them here ` +
    `would affect a real account. Use the SQL editor for this one.`
  );
}

export function removedMessage(email: string): string {
  return `🗑 Removed <code>${esc(email)}</code> from the roster.`;
}

export interface RosterRow {
  full_name: string;
  verified: boolean;
}

export function listMessage(rows: RosterRow[]): string {
  if (rows.length === 0) return 'No physicians on the roster yet.';
  const lines = rows.map(r => `${r.verified ? '✅' : '⏳'} ${esc(r.full_name)}`);
  return `<b>Roster (${rows.length})</b>\n${lines.join('\n')}`;
}

export function unknownCommandMessage(name: string): string {
  return `Unknown command <code>/${esc(name)}</code>. Try <code>/add</code>, <code>/remove</code>, or <code>/list</code>.`;
}
