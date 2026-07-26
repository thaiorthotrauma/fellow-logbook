import { describe, expect, it } from 'vitest';
import {
  addUsageMessage,
  addedMessage,
  alreadyExistsMessage,
  cannotRemoveMessage,
  escapeLikePattern,
  invalidEmailMessage,
  isValidEmail,
  listMessage,
  notFoundMessage,
  parseAddArgs,
  parseCommand,
  removedMessage,
  removeUsageMessage,
  unknownCommandMessage,
} from '../../supabase/functions/_shared/fellowCommands';

describe('parseCommand', () => {
  it('splits the command name from its arguments', () => {
    expect(parseCommand('/add ปองสิทธิ์ | a@b.com | Home')).toEqual({
      name: 'add',
      args: 'ปองสิทธิ์ | a@b.com | Home',
    });
  });

  it('is case-insensitive on the command name', () => {
    expect(parseCommand('/ADD a | b@c.com')).toMatchObject({ name: 'add' });
  });

  it('strips a bot-username suffix ("/add@MyBot ...")', () => {
    expect(parseCommand('/add@TotsLogbookBot a | b@c.com')).toMatchObject({
      name: 'add',
      args: 'a | b@c.com',
    });
  });

  it('a command with no arguments has empty args, not undefined', () => {
    expect(parseCommand('/list')).toEqual({ name: 'list', args: '' });
  });

  it('recognizes /addstaff', () => {
    expect(parseCommand('/addstaff A B | Home | Uabc123')).toEqual({
      name: 'addstaff',
      args: 'A B | Home | Uabc123',
    });
  });

  it('unrecognized command name is tagged unknown, not dropped', () => {
    expect(parseCommand('/help')).toEqual({ name: 'unknown', text: 'help' });
  });

  it('plain chat text (no leading slash) is not a command', () => {
    expect(parseCommand('hello there')).toBeNull();
    expect(parseCommand('')).toBeNull();
  });
});

describe('isValidEmail / escapeLikePattern', () => {
  it('accepts an ordinary address', () => {
    expect(isValidEmail('pong.poti@gmail.com')).toBe(true);
  });

  it('rejects a domain with no dot', () => {
    expect(isValidEmail('pong.poti@gmial')).toBe(false);
  });

  it('rejects text with no @', () => {
    expect(isValidEmail('not-an-email')).toBe(false);
  });

  it('escapes ILIKE wildcards so "_" in a real address is not a wildcard', () => {
    expect(escapeLikePattern('john_doe@x.com')).toBe('john\\_doe@x.com');
    expect(escapeLikePattern('50%off@x.com')).toBe('50\\%off@x.com');
  });
});

describe('parseAddArgs', () => {
  it('parses name, email, and institution', () => {
    expect(parseAddArgs('ปองสิทธิ์ โพธิคุณ | pong.poti@gmail.com | สมุทรสาคร')).toEqual({
      ok: true,
      value: { fullName: 'ปองสิทธิ์ โพธิคุณ', email: 'pong.poti@gmail.com', institution: 'สมุทรสาคร' },
    });
  });

  it('institution is optional', () => {
    expect(parseAddArgs('ชื่อ นามสกุล | a@b.com')).toEqual({
      ok: true,
      value: { fullName: 'ชื่อ นามสกุล', email: 'a@b.com', institution: null },
    });
  });

  it('trims each field', () => {
    const parsed = parseAddArgs('  Name  |  a@b.com  |  Inst  ');
    expect(parsed).toMatchObject({ ok: true, value: { fullName: 'Name', email: 'a@b.com', institution: 'Inst' } });
  });

  it('missing the "|" separator is a usage error', () => {
    expect(parseAddArgs('Name a@b.com')).toEqual({ ok: false, error: 'usage' });
  });

  it('missing email is a usage error', () => {
    expect(parseAddArgs('Name | ')).toEqual({ ok: false, error: 'usage' });
  });

  it('an unparseable email is reported distinctly from a missing one', () => {
    expect(parseAddArgs('Name | not-an-email')).toEqual({ ok: false, error: 'invalid-email', email: 'not-an-email' });
  });
});

describe('message rendering', () => {
  it('addedMessage never claims verified and always states the running count', () => {
    const msg = addedMessage({ fullName: 'A B', email: 'a@b.com', institution: 'Home' }, 24);
    expect(msg).toContain('Not yet verified');
    expect(msg).toContain('Roster now has 24 fellows.');
  });

  it('addedMessage omits the institution line when none was given', () => {
    const msg = addedMessage({ fullName: 'A B', email: 'a@b.com', institution: null }, 1);
    expect(msg).not.toContain('Institution');
    expect(msg).toContain('Roster now has 1 fellow.');
  });

  it('alreadyExistsMessage shows who owns the email without changing anything', () => {
    const msg = alreadyExistsMessage('a@b.com', { full_name: 'A B', institution: 'Home', verified: true });
    expect(msg).toContain('A B');
    expect(msg).toContain('verified');
    expect(msg).toContain('Nothing was changed');
  });

  it('cannotRemoveMessage never states which specific signal blocked it', () => {
    const msg = cannotRemoveMessage('A B');
    expect(msg).toContain("Can't remove A B");
    expect(msg).not.toMatch(/verified|linked/i);
  });

  it('listMessage marks verified vs pending distinctly and states the count', () => {
    const msg = listMessage([
      { full_name: 'A', verified: true },
      { full_name: 'B', verified: false },
    ]);
    expect(msg).toContain('Roster (2)');
    expect(msg).toContain('✅ A');
    expect(msg).toContain('⏳ B');
  });

  it('listMessage never includes an email address', () => {
    const msg = listMessage([{ full_name: 'A', verified: true }]);
    expect(msg).not.toContain('@');
  });

  it('empty roster has a distinct message rather than "Roster (0)"', () => {
    expect(listMessage([])).toBe('No fellows on the roster yet.');
  });

  it('escapes HTML in every user-controlled value', () => {
    const risky = { fullName: 'A <b>B</b>', email: 'a@b.com', institution: 'X & Y' };
    expect(addedMessage(risky, 1)).toContain('A &lt;b&gt;B&lt;/b&gt;');
    expect(addedMessage(risky, 1)).toContain('X &amp; Y');
    expect(invalidEmailMessage('<script>')).toContain('&lt;script&gt;');
    expect(notFoundMessage('<script>')).toContain('&lt;script&gt;');
    expect(removedMessage('<script>')).toContain('&lt;script&gt;');
    expect(unknownCommandMessage('<script>')).toContain('&lt;script&gt;');
  });

  it('static usage messages document the "|" syntax', () => {
    expect(addUsageMessage()).toContain('|');
    expect(removeUsageMessage()).toContain('/remove');
  });
});
