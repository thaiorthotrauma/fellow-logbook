import { describe, expect, it } from 'vitest';
import { casesMonthBounds, distribution, filterByMonthRange, sortChronological, topN } from './stats';
import { PLACE, PROC_TYPE } from '../../data';
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

describe('filterByMonthRange', () => {
  const cases = [
    makeCase({ date: '2026-06-30' }),
    makeCase({ date: '2026-07-01' }),
    makeCase({ date: '2026-07-31' }),
    makeCase({ date: '2026-08-15' }),
  ];
  it('includes both bound months, inclusive', () => {
    expect(filterByMonthRange(cases, '2026-07', '2026-07')).toHaveLength(2);
    expect(filterByMonthRange(cases, '2026-06', '2026-08')).toHaveLength(4);
    expect(filterByMonthRange(cases, '2026-08', '2026-08')).toHaveLength(1);
  });
  it('excludes cases with no date', () => {
    expect(filterByMonthRange([makeCase({ date: '' })], '2026-01', '2026-12')).toHaveLength(0);
  });
});

describe('casesMonthBounds', () => {
  it('returns min/max months, null when empty', () => {
    expect(casesMonthBounds([makeCase({ date: '2026-08-15' }), makeCase({ date: '2026-06-01' })])).toEqual({
      min: '2026-06',
      max: '2026-08',
    });
    expect(casesMonthBounds([])).toBeNull();
  });
});

describe('sortChronological', () => {
  it('orders oldest to newest', () => {
    const out = sortChronological([
      makeCase({ date: '2026-08-01' }),
      makeCase({ date: '2026-06-01' }),
      makeCase({ date: '2026-07-01' }),
    ]);
    expect(out.map(c => c.date)).toEqual(['2026-06-01', '2026-07-01', '2026-08-01']);
  });
});

describe('topN', () => {
  it('ranks by frequency, grouping normalized text and ignoring empties', () => {
    const cases = [
      makeCase({ diagnosis: 'Distal radius fracture' }),
      makeCase({ diagnosis: 'distal   radius fracture' }), // same after normalize
      makeCase({ diagnosis: '- Ankle fracture' }), // bullet stripped
      makeCase({ diagnosis: 'Ankle fracture' }),
      makeCase({ diagnosis: 'Femur fracture' }),
      makeCase({ diagnosis: '' }),
    ];
    const ranked = topN(cases, c => c.diagnosis, 5);
    // Equal counts break alphabetically: "Ankle" before "Distal".
    expect(ranked[0]).toEqual({ label: 'Ankle fracture', count: 2 });
    expect(ranked[1]).toEqual({ label: 'Distal radius fracture', count: 2 });
    expect(ranked[2]).toEqual({ label: 'Femur fracture', count: 1 });
    expect(ranked).toHaveLength(3);
  });

  it('caps at n', () => {
    const cases = ['a', 'b', 'c', 'd', 'e', 'f'].map(d => makeCase({ procedure: d }));
    expect(topN(cases, c => c.procedure, 5)).toHaveLength(5);
  });
});

describe('distribution', () => {
  it('counts categories in canonical order, omitting zero-count ones', () => {
    const cases = [
      makeCase({ procedureType: 'primary' }),
      makeCase({ procedureType: 'primary' }),
      makeCase({ procedureType: 'staged' }),
    ];
    expect(distribution(cases, c => c.procedureType, PROC_TYPE)).toEqual([
      { label: 'Primary surgery', value: 2 },
      { label: 'Staged surgery', value: 1 },
    ]);
  });
  it('handles a single category', () => {
    const cases = [makeCase({ place: 'own' }), makeCase({ place: 'own' })];
    expect(distribution(cases, c => c.place, PLACE)).toEqual([{ label: 'Home institution', value: 2 }]);
  });
});
