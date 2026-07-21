import { describe, expect, it } from 'vitest';
import { fromRow, toRow } from './casesApi';
import type { CaseEntry, FormState } from '../types';

const sampleForm: FormState = {
  date: '2026-07-21',
  timing: 'in',
  diagnosis: 'Closed fracture, right distal femur',
  otherClassification: 'AO/OTA 33-A2',
  approach: 'Lateral parapatellar',
  position: 'Supine',
  procedure: 'ORIF distal femur',
  procedureType: 'primary',
  role: 'primary_surgeon',
  opTime: '1-2',
  place: 'own',
};

describe('toRow', () => {
  it('maps camelCase form fields to snake_case columns', () => {
    const row = toRow(sampleForm, '33-A2', 'Femur');
    expect(row).toMatchObject({
      date: '2026-07-21',
      timing: 'in',
      ao_code: '33-A2',
      ao_region_label: 'Femur',
      other_classification: 'AO/OTA 33-A2',
      procedure_type: 'primary',
      op_time: '1-2',
      place: 'own',
    });
  });

  it('never includes id (the DB assigns it)', () => {
    expect(toRow(sampleForm, '', '')).not.toHaveProperty('id');
  });
});

describe('fromRow', () => {
  it('maps snake_case columns back to camelCase entry fields', () => {
    const entry = fromRow({
      id: 'abc-123',
      date: '2026-07-21',
      timing: 'out',
      diagnosis: 'x',
      ao_code: '33-A2',
      ao_region_label: 'Femur',
      other_classification: 'y',
      approach: 'z',
      position: 'supine',
      procedure: 'p',
      procedure_type: 'revision',
      role: 'observer',
      op_time: '>4',
      place: 'outside',
    });
    expect(entry.id).toBe('abc-123');
    expect(entry.aoCode).toBe('33-A2');
    expect(entry.aoRegionLabel).toBe('Femur');
    expect(entry.otherClassification).toBe('y');
    expect(entry.procedureType).toBe('revision');
    expect(entry.opTime).toBe('>4');
  });
});

describe('round trip', () => {
  it('toRow → fromRow reproduces the original values (plus id)', () => {
    const row = { id: 'id-1', ...toRow(sampleForm, '33-A2', 'Femur') };
    const entry = fromRow(row);
    const expected: CaseEntry = {
      id: 'id-1',
      ...sampleForm,
      aoCode: '33-A2',
      aoRegionLabel: 'Femur',
    };
    expect(entry).toEqual(expected);
  });
});
