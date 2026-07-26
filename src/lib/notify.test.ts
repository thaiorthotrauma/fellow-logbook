import { describe, expect, it } from 'vitest';
import {
  chatMessage,
  deletedCaseMessage,
  editedCaseMessage,
  maskHn,
  newCaseMessage,
  type CaseRow,
} from '../../supabase/functions/_shared/caseMessage';
import { diffCaseColumns } from './casesApi';
import type { CaseEntry } from '../types';

// The message builders live with the Edge Functions (Deno) but are plain
// TypeScript, so they're exercised here rather than left untested.

const row: CaseRow = {
  date: '2026-07-24',
  timing: 'in',
  place: 'own',
  staff: 'Somsak Jaidee',
  hn: '1234567',
  diagnosis: 'Closed fracture right proximal humerus',
  ao_code: '11-A2',
  other_classification: '',
  approach: 'Deltopectoral',
  position: '',
  procedure: 'ORIF locking plate',
  procedure_type: 'primary',
  role: 'primary_surgeon',
  op_time: '1-2',
  memo: '',
  image_paths: ['a', 'b'],
};

describe('maskHn', () => {
  it('keeps only the last four digits', () => {
    expect(maskHn('1234567')).toBe('•••4567');
  });
  it('leaves a short HN alone rather than revealing it is short', () => {
    expect(maskHn('123')).toBe('123');
  });
  it('empty → em dash', () => {
    expect(maskHn('')).toBe('—');
  });
});

describe('newCaseMessage', () => {
  const msg = newCaseMessage(row, 'ปองสิทธิ์ โพธิคุณ', 'สมุทรสาคร', 12);

  it('leads with the new-case heading, fellow and institution', () => {
    expect(msg).toContain('🆕 <b>New case logged</b>');
    expect(msg).toContain('ปองสิทธิ์ โพธิคุณ · สมุทรสาคร');
  });

  it('shows the date in full-month form with hours and place', () => {
    expect(msg).toContain('24 July 2026 · Official hours · Home institution');
  });

  it('never sends a full HN', () => {
    expect(msg).toContain('•••4567');
    expect(msg).not.toContain('1234567');
  });

  it('renders the AO code as the Classification block', () => {
    expect(msg).toContain('<b>Classification</b>\nAO/OTA 11-A2');
  });

  it('omits empty optional fields rather than printing a dash', () => {
    expect(msg).not.toContain('Memo');
    expect(msg).not.toContain('Position');
  });

  it('closes with the meta line and running case number', () => {
    expect(msg).toContain('Primary surgeon · Primary surgery · 1–2 hr · 2 images');
    expect(msg).toContain('Case #12 in the logbook');
  });

  it('bullets a multi-row answer but not a single-row one', () => {
    const multi = newCaseMessage(
      { ...row, procedure: '- ORIF plate\n- Bone graft' },
      'A',
      null,
      1,
    );
    expect(multi).toContain('• ORIF plate\n• Bone graft');
    expect(msg).toContain('<b>Procedure(s)</b>\nORIF locking plate');
  });

  it('bullets Classification when both Q6 and Q7 are answered', () => {
    const both = newCaseMessage(
      { ...row, other_classification: 'Neer type II' },
      'A',
      null,
      1,
    );
    expect(both).toContain('• AO/OTA 11-A2\n• Neer type II');
  });

  it('escapes HTML so a value with < or & cannot break the message', () => {
    const risky = newCaseMessage({ ...row, diagnosis: 'Fracture <2cm & displaced' }, 'A', null, 1);
    expect(risky).toContain('Fracture &lt;2cm &amp; displaced');
  });
});

describe('editedCaseMessage', () => {
  it('reports only the changed fields, struck-through old → new', () => {
    const msg = editedCaseMessage(
      { ...row, role: 'primary_surgeon' },
      { role: 'primary_assistant' },
      'ปองสิทธิ์ โพธิคุณ',
      'สมุทรสาคร',
    );
    expect(msg).toContain('✏️ <b>Case edited</b>');
    expect(msg).toContain('1 field changed');
    expect(msg).toContain('<s>Primary assist</s> → Primary surgeon');
  });

  it('identifies which case was edited, with HN masked', () => {
    const msg = editedCaseMessage(row, { staff: 'Older Name' }, 'A', null);
    expect(msg).toContain('Case of 24 July 2026 · HN <code>•••4567</code>');
  });

  it('stacks a long value onto its own lines instead of inline', () => {
    const msg = editedCaseMessage(row, { diagnosis: 'Closed fracture of the right proximal humeral shaft' }, 'A', null)!;
    expect(msg).toContain('<b>Diagnosis</b>\n<s>');
    expect(msg).toContain('</s>\n→ ');
  });

  it('reports images as a count, not as Drive file ids', () => {
    const msg = editedCaseMessage(row, { image_paths: ['a'] }, 'A', null)!;
    expect(msg).toContain('<s>1 image</s> → 2 images');
    expect(msg).not.toContain('Drive');
  });

  it('pluralizes the changed-field count', () => {
    const msg = editedCaseMessage(row, { staff: 'x', role: 'observer' }, 'A', null)!;
    expect(msg).toContain('2 fields changed');
  });

  it('no changes → no message at all', () => {
    expect(editedCaseMessage(row, {}, 'A', null)).toBeNull();
  });

  it('ignores unknown columns rather than rendering them', () => {
    expect(editedCaseMessage(row, { not_a_column: 1 }, 'A', null)).toBeNull();
  });
});

describe('deletedCaseMessage', () => {
  it('identifies the case with the same identity line as the other two', () => {
    const msg = deletedCaseMessage(row, 'ปองสิทธิ์ โพธิคุณ', 'สมุทรสาคร', 11);
    expect(msg).toContain('🗑 <b>Case deleted</b>');
    expect(msg).toContain('ปองสิทธิ์ โพธิคุณ · สมุทรสาคร');
    expect(msg).toContain('Case of 24 July 2026 · HN <code>•••4567</code>');
  });

  it('includes the diagnosis for recognition, bullets stripped', () => {
    const msg = deletedCaseMessage({ ...row, diagnosis: '- Line one\n- Line two' }, 'A', null, 0);
    expect(msg).toContain('<b>Diagnosis</b>\n• Line one\n• Line two');
  });

  it('reports images removed only when there were any', () => {
    const withImages = deletedCaseMessage(row, 'A', null, 11);
    expect(withImages).toContain('2 images removed · Roster now has 11 cases');

    const noImages = deletedCaseMessage({ ...row, image_paths: [] }, 'A', null, 5);
    expect(noImages).not.toContain('removed');
    expect(noImages).toContain('Roster now has 5 cases');
  });

  it('pluralizes the roster count correctly at one', () => {
    const msg = deletedCaseMessage({ ...row, image_paths: [] }, 'A', null, 1);
    expect(msg).toContain('Roster now has 1 case');
    expect(msg).not.toContain('1 cases');
  });

  it('never sends a full HN', () => {
    const msg = deletedCaseMessage(row, 'A', null, 0);
    expect(msg).not.toContain('1234567');
  });
});

describe('chatMessage', () => {
  it('labels a known fellow and quotes the message', () => {
    const msg = chatMessage('U4af8e2b9', 'Can I still edit last month?', 'ปองสิทธิ์ โพธิคุณ', 'สมุทรสาคร');
    expect(msg).toContain('💬 <b>Message from fellow</b>');
    expect(msg).toContain('ปองสิทธิ์ โพธิคุณ · สมุทรสาคร');
    expect(msg).toContain('<blockquote>Can I still edit last month?</blockquote>');
  });

  it('sends the LINE id in full, as code, so it can be tapped to copy', () => {
    const msg = chatMessage('U4af8e2b91c7d05e3', 'hi', null, null);
    expect(msg).toContain('<code>U4af8e2b91c7d05e3</code>');
  });

  it('marks an unregistered sender', () => {
    const msg = chatMessage('Ubb31c7f4', 'สวัสดีครับ', null, null);
    expect(msg).toContain('💬 <b>Message from unregistered user</b>');
    expect(msg).toContain('No fellow record');
  });
});

describe('diffCaseColumns', () => {
  const entry: CaseEntry = {
    id: 'c1',
    date: '2026-07-24',
    timing: 'in',
    place: 'own',
    staff: 'Somsak',
    hn: '1234567',
    diagnosis: 'Dx',
    otherClassification: '',
    approach: 'Ap',
    position: '',
    procedure: 'Proc',
    procedureType: 'primary',
    role: 'primary_surgeon',
    opTime: '1-2',
    memo: '',
    aoCode: '11-A2',
    aoRegionLabel: 'Humerus',
    imagePaths: ['a', 'b'],
  };

  it('identical entries → no changes', () => {
    expect(diffCaseColumns(entry, { ...entry })).toEqual({});
  });

  it('reports the previous value under the DB column name', () => {
    const after = { ...entry, role: 'observer' as const, diagnosis: 'New dx' };
    expect(diffCaseColumns(entry, after)).toEqual({ role: 'primary_surgeon', diagnosis: 'Dx' });
  });

  it('compares image arrays by contents, not identity', () => {
    expect(diffCaseColumns(entry, { ...entry, imagePaths: ['a', 'b'] })).toEqual({});
    expect(diffCaseColumns(entry, { ...entry, imagePaths: ['a'] })).toEqual({ image_paths: ['a', 'b'] });
  });

  it('never reports the id', () => {
    const diff = diffCaseColumns(entry, { ...entry, id: 'c2', staff: 'Other' });
    expect(diff).not.toHaveProperty('id');
  });
});
