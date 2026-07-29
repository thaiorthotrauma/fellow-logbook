import { describe, expect, it } from 'vitest';
import { pelvisExperience, pelvisRegionOf } from './pelvisTable';
import { ROLES } from '../../data';
import { emptyForm, type CaseEntry } from '../../types';

function makeCase(over: Partial<CaseEntry>): CaseEntry {
  return {
    ...emptyForm(),
    id: Math.random().toString(),
    aoCode: '',
    aoRegionLabel: '',
    imagePaths: [],
    ...over,
  };
}

describe('pelvisRegionOf', () => {
  it('recognizes both regions from a structured Q6 code', () => {
    expect(pelvisRegionOf(makeCase({ aoCode: '61', aoRegionLabel: 'Pelvic ring' }))).toBe('pelvicring');
    expect(pelvisRegionOf(makeCase({ aoCode: '62', aoRegionLabel: 'Acetabulum' }))).toBe('acetabulum');
  });

  it('returns null for any other region', () => {
    expect(pelvisRegionOf(makeCase({ aoCode: '32-A1', aoRegionLabel: 'Femur' }))).toBeNull();
    expect(pelvisRegionOf(makeCase({ aoCode: '15', aoRegionLabel: 'Clavicle' }))).toBeNull();
  });

  it('falls back to the AI region map when Q6 is blank', () => {
    const c = makeCase({ diagnosis: 'Acetabular fracture, posterior wall' });
    const regionMap = new Map([['acetabular fracture, posterior wall', 'Acetabulum']]);
    expect(pelvisRegionOf(c, regionMap)).toBe('acetabulum');
    // Without the map there is nothing to resolve it by.
    expect(pelvisRegionOf(c)).toBeNull();
  });

  it('ignores an AI label that is not one of the two regions', () => {
    const c = makeCase({ diagnosis: 'Femoral shaft fracture' });
    const regionMap = new Map([['femoral shaft fracture', 'Femur – Diaphyseal']]);
    expect(pelvisRegionOf(c, regionMap)).toBeNull();
  });

  it('prefers Q6 over the AI map, as the rest of the summary page does', () => {
    const c = makeCase({ aoCode: '32-A1', aoRegionLabel: 'Femur', diagnosis: 'Acetabular fracture' });
    const regionMap = new Map([['acetabular fracture', 'Acetabulum']]);
    expect(pelvisRegionOf(c, regionMap)).toBeNull();
  });
});

describe('pelvisExperience', () => {
  it('counts each case once under its logged role, split by region', () => {
    const cases = [
      makeCase({ aoCode: '61', aoRegionLabel: 'Pelvic ring', role: 'primary_surgeon' }),
      makeCase({ aoCode: '61', aoRegionLabel: 'Pelvic ring', role: 'primary_assistant' }),
      makeCase({ aoCode: '61', aoRegionLabel: 'Pelvic ring', role: 'primary_assistant' }),
      makeCase({ aoCode: '62', aoRegionLabel: 'Acetabulum', role: 'primary_surgeon' }),
      makeCase({ aoCode: '62', aoRegionLabel: 'Acetabulum', role: 'observer' }),
      // Not a pelvis/acetabulum case — must not appear anywhere in the table.
      makeCase({ aoCode: '32-A1', aoRegionLabel: 'Femur', role: 'primary_surgeon' }),
    ];
    const { rows, totals } = pelvisExperience(cases);
    const by = Object.fromEntries(rows.map(r => [r.role, r]));

    expect(by.primary_surgeon).toMatchObject({ pelvicring: 1, acetabulum: 1, total: 2 });
    expect(by.primary_assistant).toMatchObject({ pelvicring: 2, acetabulum: 0, total: 2 });
    expect(by.observer).toMatchObject({ pelvicring: 0, acetabulum: 1, total: 1 });
    expect(totals).toEqual({ pelvicring: 3, acetabulum: 2, total: 5 });
  });

  it('always lists every role, including ones with no cases', () => {
    // A zero row is the finding in a training record — "0 as primary surgeon"
    // is exactly what a reader looks for, so it must not be omitted the way
    // the top-5 rankings omit empty entries.
    const { rows } = pelvisExperience([makeCase({ aoCode: '61', aoRegionLabel: 'Pelvic ring', role: 'observer' })]);
    expect(rows.map(r => r.role)).toEqual(ROLES.map(r => r.value));
    expect(rows.find(r => r.role === 'primary_surgeon')).toMatchObject({ pelvicring: 0, acetabulum: 0, total: 0 });
  });

  it('counts AI-resolved cases alongside Q6-resolved ones', () => {
    const cases = [
      makeCase({ aoCode: '62', aoRegionLabel: 'Acetabulum', role: 'primary_surgeon' }),
      makeCase({ diagnosis: 'Acetabular fracture, no code', role: 'primary_surgeon' }),
    ];
    const regionMap = new Map([['acetabular fracture, no code', 'Acetabulum']]);
    expect(pelvisExperience(cases, regionMap).totals).toEqual({ pelvicring: 0, acetabulum: 2, total: 2 });
  });

  it('skips a case with no role rather than inventing a bucket for it', () => {
    const cases = [makeCase({ aoCode: '61', aoRegionLabel: 'Pelvic ring', role: null })];
    expect(pelvisExperience(cases).totals).toEqual({ pelvicring: 0, acetabulum: 0, total: 0 });
  });

  it('reports all-zero totals for a range with no pelvis or acetabulum cases', () => {
    const { rows, totals } = pelvisExperience([makeCase({ aoCode: '32-A1', aoRegionLabel: 'Femur', role: 'primary_surgeon' })]);
    expect(totals.total).toBe(0);
    expect(rows).toHaveLength(ROLES.length);
  });
});
