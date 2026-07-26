import { describe, expect, it } from 'vitest';
import { fromStaffRow, type StaffCaseRow } from './staffApi';

const row: StaffCaseRow = {
  id: 'c1',
  date: '2026-07-24',
  timing: 'in',
  place: 'own',
  fellow_name: 'ปองสิทธิ์ โพธิคุณ',
  staff: 'Somsak Jaidee',
  hn: '•••4567',
  diagnosis: 'Closed fracture right proximal humerus',
  ao_code: '11-A2',
  ao_region_label: 'Humerus',
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

describe('fromStaffRow', () => {
  it('carries the fellow name alongside the usual case fields', () => {
    const entry = fromStaffRow(row);
    expect(entry.fellowName).toBe('ปองสิทธิ์ โพธิคุณ');
    expect(entry.diagnosis).toBe('Closed fracture right proximal humerus');
    expect(entry.staff).toBe('Somsak Jaidee');
  });

  it('passes the hn field through as given, never re-deriving or exposing more than the query returned', () => {
    expect(fromStaffRow(row).hn).toBe('•••4567');
  });

  it('defaults a null image_paths to an empty array', () => {
    expect(fromStaffRow({ ...row, image_paths: null }).imagePaths).toEqual([]);
  });
});
