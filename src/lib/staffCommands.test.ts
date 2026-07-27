import { describe, expect, it } from 'vitest';
import {
  addStaffUsageMessage,
  addedStaffMessage,
  alreadyExistsStaffMessage,
  parseAddStaffArgs,
} from '../../supabase/functions/_shared/staffCommands';

describe('parseAddStaffArgs', () => {
  it('parses name, institution, and LINE user id', () => {
    expect(parseAddStaffArgs('ปองสิทธิ์ โพธิคุณ | สมุทรสาคร | U1f7800c1ec874bb896bb11598c5ec49e')).toEqual({
      ok: true,
      value: {
        fullName: 'ปองสิทธิ์ โพธิคุณ',
        institution: 'สมุทรสาคร',
        lineUserId: 'U1f7800c1ec874bb896bb11598c5ec49e',
      },
    });
  });

  it('trims each field', () => {
    const parsed = parseAddStaffArgs('  Name  |  Inst  |  Uabc123  ');
    expect(parsed).toEqual({
      ok: true,
      value: { fullName: 'Name', institution: 'Inst', lineUserId: 'Uabc123' },
    });
  });

  it('all three fields are required, unlike fellow /add', () => {
    expect(parseAddStaffArgs('Name | Inst')).toEqual({ ok: false, error: 'usage' });
    expect(parseAddStaffArgs('Name | | Uabc123')).toEqual({ ok: false, error: 'usage' });
    expect(parseAddStaffArgs('')).toEqual({ ok: false, error: 'usage' });
  });
});

describe('message rendering', () => {
  it('addedStaffMessage states the running staff count', () => {
    const msg = addedStaffMessage({ fullName: 'A B', institution: 'Home', lineUserId: 'Uabc' }, 3);
    expect(msg).toContain('Staff added');
    expect(msg).toContain('A B');
    expect(msg).toContain('Home');
    expect(msg).toContain('Roster now has 3 staff members.');
  });

  it('addedStaffMessage uses singular "member" for a count of 1', () => {
    const msg = addedStaffMessage({ fullName: 'A B', institution: 'Home', lineUserId: 'Uabc' }, 1);
    expect(msg).toContain('Roster now has 1 staff member.');
  });

  it('addedStaffMessage defaults to reporting the rich menu as linked', () => {
    const msg = addedStaffMessage({ fullName: 'A B', institution: 'Home', lineUserId: 'Uabc' }, 1);
    expect(msg).toContain('rich menu assigned automatically');
  });

  it('addedStaffMessage flags a missing LINE config as a manual step', () => {
    const msg = addedStaffMessage(
      { fullName: 'A B', institution: 'Home', lineUserId: 'Uabc' },
      1,
      'not-configured',
    );
    expect(msg).toContain("isn't set");
    expect(msg).toContain('line-oa/README.md');
  });

  it('addedStaffMessage flags a failed LINE API call as a manual step', () => {
    const msg = addedStaffMessage(
      { fullName: 'A B', institution: 'Home', lineUserId: 'Uabc' },
      1,
      'failed',
    );
    expect(msg).toContain('assignment failed');
    expect(msg).toContain('line-oa/README.md');
  });

  it('alreadyExistsStaffMessage shows who owns that LINE id without changing anything', () => {
    const msg = alreadyExistsStaffMessage({ full_name: 'A B', institution: 'Home' });
    expect(msg).toContain('A B');
    expect(msg).toContain('Home');
    expect(msg).toContain('Nothing was changed');
  });

  it('escapes HTML in every user-controlled value', () => {
    const risky = { fullName: 'A <b>B</b>', institution: 'X & Y', lineUserId: 'Uabc' };
    expect(addedStaffMessage(risky, 1)).toContain('A &lt;b&gt;B&lt;/b&gt;');
    expect(addedStaffMessage(risky, 1)).toContain('X &amp; Y');
    expect(alreadyExistsStaffMessage({ full_name: 'A <b>B</b>', institution: 'X & Y' })).toContain(
      'A &lt;b&gt;B&lt;/b&gt;',
    );
  });

  it('static usage message documents the "|" syntax and all three fields', () => {
    const msg = addStaffUsageMessage();
    expect(msg).toContain('|');
    expect(msg).toContain('/addstaff');
  });
});
