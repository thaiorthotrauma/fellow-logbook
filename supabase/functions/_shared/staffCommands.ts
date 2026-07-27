// Parses and renders the /addstaff admin command sent to the bot.
//
// Kept free of any Deno/Supabase dependency (pure string in, string out) so it
// can be unit-tested from the app's own vitest suite, the same pattern as
// fellowCommands.ts. The webhook function (telegram-webhook/index.ts) does the
// actual database reads/writes and calls these only to parse input and render
// replies.
//
// Unlike fellow /add, staff have no email/OTP step to establish their LINE
// identity later — the LINE user id must be supplied up front. In practice an
// admin gets it from the "unregistered user" Telegram message that line-webhook
// forwards the first time that person messages the official account.
import { esc } from './html.ts';

export interface AddStaffInput {
  fullName: string;
  institution: string;
  lineUserId: string;
}

export type ParsedAddStaff =
  | { ok: true; value: AddStaffInput }
  | { ok: false; error: 'usage' };

/** "name | institution | LINE user id". Split on "|" rather than whitespace
 *  because Thai names contain spaces. */
export function parseAddStaffArgs(args: string): ParsedAddStaff {
  const parts = args.split('|').map(p => p.trim());
  const [fullName, institution, lineUserId] = parts;
  if (!fullName || !institution || !lineUserId) return { ok: false, error: 'usage' };
  return { ok: true, value: { fullName, institution, lineUserId } };
}

const ADD_STAFF_USAGE =
  `Couldn't read that\n` +
  `Separate the fields with <code>|</code> :\n\n` +
  `<code>/addstaff name | institution | LINE user id</code>\n\n` +
  `All three are required — staff have no email step, so the LINE user id ` +
  `has to be supplied up front (copy it from the "unregistered user" message ` +
  `once they've messaged the official account).`;

export function addStaffUsageMessage(): string {
  return ADD_STAFF_USAGE;
}

/** Outcome of the automatic LINE rich-menu assignment attempted right after
 *  the DB insert — surfaced to the admin so a 'failed'/'not-configured'
 *  result is visibly a call to do the line-oa/README.md step 3 curl by hand,
 *  rather than a silent gap like before this was automated. */
export type RichMenuLinkStatus = 'linked' | 'not-configured' | 'failed';

function richMenuStatusLine(status: RichMenuLinkStatus): string {
  switch (status) {
    case 'linked':
      return `LINE staff rich menu assigned automatically.`;
    case 'not-configured':
      return (
        `⚠️ LINE_CHANNEL_ACCESS_TOKEN / LINE_STAFF_RICH_MENU_ID isn't set, so the ` +
        `rich menu wasn't assigned — do it by hand (line-oa/README.md, staff section, step 3).`
      );
    case 'failed':
      return (
        `⚠️ Automatic rich menu assignment failed — do it by hand ` +
        `(line-oa/README.md, staff section, step 3).`
      );
  }
}

export function addedStaffMessage(
  input: AddStaffInput,
  totalCount: number,
  richMenuStatus: RichMenuLinkStatus = 'linked',
): string {
  return (
    `✅ <b>Staff added</b>\n` +
    `<b>Name</b> ${esc(input.fullName)}\n` +
    `<b>Institution</b> ${esc(input.institution)}\n\n` +
    `Active immediately — staff sign in by LINE id alone, no verification step.\n` +
    `Roster now has ${totalCount} staff member${totalCount === 1 ? '' : 's'}.\n` +
    richMenuStatusLine(richMenuStatus)
  );
}

export interface ExistingStaff {
  full_name: string;
  institution: string;
}

export function alreadyExistsStaffMessage(existing: ExistingStaff): string {
  return (
    `⚠️ <b>Already on the staff roster</b>\n` +
    `That LINE user id is registered to <b>${esc(existing.full_name)}</b> ` +
    `(${esc(existing.institution)}).\n\n` +
    `Nothing was changed.`
  );
}
