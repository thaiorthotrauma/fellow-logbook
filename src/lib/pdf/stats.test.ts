import { describe, expect, it } from 'vitest';
import {
  casesMonthBounds,
  distribution,
  filterByMonthRange,
  groupByFellow,
  monthFileSegment,
  monthLabel,
  monthsBetween,
  nameFileSegment,
  normalizeLabel,
  rangeLabel,
  sortChronological,
  topN,
  uniqueLabels,
} from './stats';
import { PLACE, PROC_TYPE } from '../../data';
import { emptyForm, type CaseEntry, type StaffCaseEntry } from '../../types';

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

  it('merges entries via a cluster map, using the canonical label for display', () => {
    const cases = [
      makeCase({ procedure: 'ORIF' }),
      makeCase({ procedure: 'Open reduction internal fixation' }),
      makeCase({ procedure: 'ORIF' }),
      makeCase({ procedure: 'K-wire fixation' }),
    ];
    const clusters = new Map([
      [normalizeLabel('ORIF').key, 'Open reduction internal fixation'],
      [normalizeLabel('Open reduction internal fixation').key, 'Open reduction internal fixation'],
    ]);
    const ranked = topN(cases, c => c.procedure, 5, clusters);
    expect(ranked[0]).toEqual({ label: 'Open reduction internal fixation', count: 3 });
    expect(ranked[1]).toEqual({ label: 'K-wire fixation', count: 1 });
    expect(ranked).toHaveLength(2);
  });

  it('falls back to exact-text ranking for labels the cluster map has no entry for', () => {
    const cases = [makeCase({ diagnosis: 'Ankle fracture' }), makeCase({ diagnosis: 'Femur fracture' })];
    const ranked = topN(cases, c => c.diagnosis, 5, new Map());
    expect(ranked).toHaveLength(2);
  });
});

describe('uniqueLabels', () => {
  it('returns one entry per normalized wording, ignoring empties', () => {
    const cases = [
      makeCase({ diagnosis: 'ORIF' }),
      makeCase({ diagnosis: '  ORIF  ' }), // same after normalize
      makeCase({ diagnosis: 'Open reduction internal fixation' }),
      makeCase({ diagnosis: '' }),
    ];
    expect(uniqueLabels(cases, c => c.diagnosis)).toEqual(['ORIF', 'Open reduction internal fixation']);
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

describe('monthLabel / rangeLabel', () => {
  it('formats a month with the full month name', () => {
    expect(monthLabel('2026-07')).toBe('July 2026');
  });

  it('a single-month range shows once, not as a range', () => {
    expect(rangeLabel('2026-07', '2026-07')).toBe('July 2026');
  });

  it('a multi-month range shows both ends', () => {
    expect(rangeLabel('2026-07', '2026-09')).toBe('July 2026 – September 2026');
  });
});

describe('monthFileSegment / nameFileSegment', () => {
  it('reorders YYYY-MM to MM-YYYY', () => {
    expect(monthFileSegment('2026-07')).toBe('07-2026');
  });

  it('splits a two-part name on the first space, joining the rest', () => {
    expect(nameFileSegment('ปองสิทธิ์ โพธิคุณ')).toBe('ปองสิทธิ์-โพธิคุณ');
  });

  it('a name with no space falls back to itself', () => {
    expect(nameFileSegment('Institution')).toBe('Institution');
  });
});

describe('monthsBetween', () => {
  it('lists every month inclusive, crossing a year boundary', () => {
    expect(monthsBetween('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });

  it('a single-month range returns just that month', () => {
    expect(monthsBetween('2026-07', '2026-07')).toEqual(['2026-07']);
  });
});

function makeStaffCase(over: Partial<StaffCaseEntry>): StaffCaseEntry {
  return {
    ...emptyForm(),
    id: Math.random().toString(),
    aoCode: '',
    aoRegionLabel: '',
    imagePaths: [],
    fellowName: 'Someone',
    ...over,
  };
}

describe('groupByFellow', () => {
  it('groups cases under their fellow', () => {
    const cases = [
      makeStaffCase({ id: '1', fellowName: 'A' }),
      makeStaffCase({ id: '2', fellowName: 'B' }),
      makeStaffCase({ id: '3', fellowName: 'A' }),
    ];
    const groups = groupByFellow(cases);
    expect(groups.map(g => g.fellowName)).toEqual(['A', 'B']);
    expect(groups[0].cases.map(c => c.id)).toEqual(['1', '3']);
    expect(groups[1].cases.map(c => c.id)).toEqual(['2']);
  });

  it('orders fellows by first appearance, not alphabetically', () => {
    const cases = [makeStaffCase({ fellowName: 'Zed' }), makeStaffCase({ fellowName: 'Amy' })];
    expect(groupByFellow(cases).map(g => g.fellowName)).toEqual(['Zed', 'Amy']);
  });

  it('empty input → empty output', () => {
    expect(groupByFellow([])).toEqual([]);
  });
});
