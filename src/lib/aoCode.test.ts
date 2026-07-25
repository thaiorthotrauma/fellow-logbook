import { describe, expect, it } from 'vitest';
import { parseAoCode } from './aoCode';
import { computeAoCode } from '../logic';
import { GROUP_OPTS, REGIONS, TYPE_OPTS } from '../data';
import { emptyAo } from '../types';

describe('parseAoCode', () => {
  it('empty code → empty selection', () => {
    expect(parseAoCode('', '')).toEqual(emptyAo());
    expect(parseAoCode('   ', 'Femur')).toEqual(emptyAo());
  });

  it('region segment + type + group', () => {
    expect(parseAoCode('33-A2', 'Femur')).toEqual({
      regionKey: 'femur',
      boneKey: null,
      segmentCode: '33',
      subtypeCode: null,
      type: 'A',
      group: '2',
      code: '33-A2',
    });
  });

  it('type without a group', () => {
    const ao = parseAoCode('12-B', 'Humerus');
    expect(ao.segmentCode).toBe('12');
    expect(ao.type).toBe('B');
    expect(ao.group).toBeNull();
  });

  it('resolves the bone for a per-bone segment code', () => {
    expect(parseAoCode('2R2-C1', 'Forearm (Radius / Ulna)')).toMatchObject({
      regionKey: 'forearm',
      boneKey: 'radius',
      segmentCode: '2R2',
    });
    expect(parseAoCode('4F3', 'Tibia / Fibula (Leg)')).toMatchObject({
      regionKey: 'tibiafibula',
      boneKey: 'fibula',
      segmentCode: '4F3',
    });
  });

  it('resolves a subtype code (hand / foot bones)', () => {
    expect(parseAoCode('72', 'Hand')).toMatchObject({
      regionKey: 'hand',
      subtypeCode: '72',
      segmentCode: null,
    });
    expect(parseAoCode('82-A', 'Foot')).toMatchObject({
      regionKey: 'foot',
      subtypeCode: '82',
      type: 'A',
    });
  });

  it('bare region code (region chosen, no segment)', () => {
    expect(parseAoCode('61', 'Pelvic ring')).toMatchObject({
      regionKey: 'pelvicring',
      segmentCode: null,
      subtypeCode: null,
      type: null,
    });
  });

  it('region code containing a slash still splits its suffix correctly', () => {
    expect(parseAoCode('2R/2U-C1', 'Forearm (Radius / Ulna)')).toMatchObject({
      regionKey: 'forearm',
      segmentCode: null,
      type: 'C',
      group: '1',
    });
  });

  it('falls back to the region label when the base is unrecognized', () => {
    expect(parseAoCode('ZZ9-A1', 'Femur')).toMatchObject({ regionKey: 'femur', type: 'A', group: '1' });
  });

  it('keeps an unrecognizable code verbatim rather than dropping it', () => {
    const ao = parseAoCode('nonsense', 'not a region');
    expect(ao.regionKey).toBeNull();
    expect(ao.code).toBe('nonsense');
  });
});

describe('parseAoCode ↔ computeAoCode round-trip', () => {
  // Every selection the picker can produce must survive a save → edit cycle,
  // otherwise re-saving an untouched case would silently change its code.
  const selections: { label: string; ao: ReturnType<typeof emptyAo> }[] = [];

  for (const region of REGIONS) {
    const bases: { boneKey: string | null; segmentCode: string | null; subtypeCode: string | null }[] = [
      { boneKey: null, segmentCode: null, subtypeCode: null },
    ];
    for (const seg of region.segments ?? []) {
      bases.push({ boneKey: null, segmentCode: seg.code, subtypeCode: null });
    }
    for (const bone of region.bones ?? []) {
      for (const seg of bone.segments) {
        bases.push({ boneKey: bone.key, segmentCode: seg.code, subtypeCode: null });
      }
    }
    for (const st of region.subtypes ?? []) {
      bases.push({ boneKey: null, segmentCode: null, subtypeCode: st.code });
    }

    for (const base of bases) {
      for (const type of [null, ...TYPE_OPTS.map(t => t.code)]) {
        for (const group of type ? [null, ...GROUP_OPTS] : [null]) {
          selections.push({
            label: `${region.key} ${base.segmentCode ?? base.subtypeCode ?? region.code} ${type ?? '-'}${group ?? ''}`,
            ao: { ...emptyAo(), regionKey: region.key, ...base, type, group },
          });
        }
      }
    }
  }

  it('covers every region', () => {
    expect(new Set(selections.map(s => s.ao.regionKey)).size).toBe(REGIONS.length);
  });

  it.each(selections)('round-trips $label', ({ ao }) => {
    const code = computeAoCode(ao);
    const region = REGIONS.find(r => r.key === ao.regionKey)!;
    const parsed = parseAoCode(code, region.name);

    expect(parsed.regionKey).toBe(ao.regionKey);
    expect(parsed.boneKey).toBe(ao.boneKey);
    expect(parsed.segmentCode).toBe(ao.segmentCode);
    expect(parsed.subtypeCode).toBe(ao.subtypeCode);
    expect(parsed.type).toBe(ao.type);
    expect(parsed.group).toBe(ao.group);
    // The decisive property: re-saving a parsed selection yields the same code.
    expect(computeAoCode(parsed)).toBe(code);
  });
});
