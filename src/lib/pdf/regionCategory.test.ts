import { describe, expect, it } from 'vitest';
import {
  allRegionLabelOptions,
  isPediatric,
  regionBucketLabel,
  resolveStructuredRegion,
  topRegions,
  uniqueUnclassifiedTexts,
} from './regionCategory';
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

describe('resolveStructuredRegion', () => {
  it('resolves a bare region code (no segment)', () => {
    expect(resolveStructuredRegion(makeCase({ aoCode: '15', aoRegionLabel: 'Clavicle' }))).toEqual({
      key: 'clavicle',
      label: 'Clavicle',
    });
  });

  it('resolves a region + segment code', () => {
    expect(resolveStructuredRegion(makeCase({ aoCode: '32-A1', aoRegionLabel: 'Femur' }))).toEqual({
      key: 'femur:32',
      label: 'Femur – Diaphyseal',
    });
  });

  it('resolves a region + bone + segment code', () => {
    expect(resolveStructuredRegion(makeCase({ aoCode: '2R3-B2', aoRegionLabel: 'Forearm (Radius / Ulna)' }))).toEqual({
      key: 'forearm:radius:2R3',
      label: 'Forearm (Radius / Ulna) – Radius – Distal',
    });
  });

  it('resolves a region + subtype code', () => {
    expect(resolveStructuredRegion(makeCase({ aoCode: '72', aoRegionLabel: 'Hand' }))).toEqual({
      key: 'hand:72',
      label: 'Hand – Scaphoid',
    });
  });

  it('returns null when aoCode is blank (Q6 not answered)', () => {
    expect(resolveStructuredRegion(makeCase({ aoCode: '' }))).toBeNull();
  });
});

describe('allRegionLabelOptions', () => {
  it('includes bare regions, bone-level, and segment-level labels', () => {
    const options = allRegionLabelOptions();
    expect(options).toContain('Clavicle');
    expect(options).toContain('Femur – Diaphyseal');
    expect(options).toContain('Forearm (Radius / Ulna) – Radius');
    expect(options).toContain('Forearm (Radius / Ulna) – Radius – Distal');
    expect(options).toContain('Hand – Scaphoid');
  });

  it('offers every label resolveStructuredRegion can produce, so no Q6 bucket is unreachable by the AI', () => {
    // The bone-split regions are the ones this guards: picking Forearm or
    // Tibia/Fibula without narrowing to a bone resolves to the region name
    // alone, which must still be an assignable option.
    const options = new Set(allRegionLabelOptions());
    for (const aoCode of ['2R/2U', '4/4F']) {
      const label = resolveStructuredRegion(makeCase({ aoCode }))?.label;
      expect(label).toBeDefined();
      expect(options.has(label as string)).toBe(true);
    }
  });
});

describe('isPediatric', () => {
  it('recognizes common English age-in-years markers under the threshold', () => {
    expect(isPediatric('12 YO fall from height')).toBe(true);
    expect(isPediatric('12yo fall from height')).toBe(true);
    expect(isPediatric('12 y/o fall from height')).toBe(true);
    expect(isPediatric('Fracture, aged 12')).toBe(true);
    expect(isPediatric('15 years old')).toBe(true);
  });

  it('recognizes Thai age markers under the threshold', () => {
    expect(isPediatric('อายุ 12 ปี ตกจากที่สูง')).toBe(true);
    expect(isPediatric('เด็กชายอายุ 5')).toBe(true);
  });

  it('treats an explicit age in months as pediatric regardless of the number', () => {
    expect(isPediatric('8 mo infant')).toBe(true);
    expect(isPediatric('18 months old')).toBe(true);
    expect(isPediatric('อายุ 6 เดือน')).toBe(true);
  });

  it('does not read a bare month count as an age — in a memo it is usually a duration', () => {
    expect(isPediatric('ORIF 12 months post-op')).toBe(false);
    expect(isPediatric('18 months')).toBe(false);
    expect(isPediatric('6 เดือน post op')).toBe(false);
  });

  it('does not flag an age at or above the threshold', () => {
    expect(isPediatric('65 YO fall')).toBe(false);
    expect(isPediatric('16 years old')).toBe(false);
  });

  it('does not false-positive on bare numbers with no age marker', () => {
    expect(isPediatric('3.5 mm plate, 12 hole LCP')).toBe(false);
    expect(isPediatric('AO/OTA 33-A2')).toBe(false);
    expect(isPediatric('2.0 K-wire fixation x2')).toBe(false);
    expect(isPediatric('')).toBe(false);
  });
});

describe('regionBucketLabel', () => {
  it('prefers the structured Q6 code over any AI region map', () => {
    const c = makeCase({ aoCode: '32-A1', aoRegionLabel: 'Femur', diagnosis: 'Some other wording' });
    const aiMap = new Map([['some other wording', 'Clavicle']]);
    expect(regionBucketLabel(c, aiMap)).toBe('Femur – Diaphyseal');
  });

  it('falls back to the AI map when aoCode is blank', () => {
    const c = makeCase({ diagnosis: 'Distal radius fracture, no code entered' });
    const aiMap = new Map([['distal radius fracture, no code entered', 'Forearm (Radius / Ulna) – Radius – Distal']]);
    expect(regionBucketLabel(c, aiMap)).toBe('Forearm (Radius / Ulna) – Radius – Distal');
  });

  it('buckets as Unclassified when neither aoCode nor the AI map resolves it', () => {
    expect(regionBucketLabel(makeCase({ diagnosis: 'Something unrecognizable' }))).toBe('Unclassified');
    expect(regionBucketLabel(makeCase({}))).toBe('Unclassified');
  });

  it('appends (pediatric) when memo carries a pediatric age marker, independent of Q6', () => {
    const c = makeCase({ aoCode: '32-A1', aoRegionLabel: 'Femur', memo: '12 YO, fell from a tree' });
    expect(regionBucketLabel(c)).toBe('Femur – Diaphyseal (pediatric)');
  });

  it('ignores laterality words when the AI map key already normalizes past them', () => {
    // The AI classification step itself is responsible for treating left/right
    // as the same clinical concept; here we only assert the local plumbing
    // passes the normalized (bullet/whitespace-collapsed) key through.
    const left = makeCase({ diagnosis: 'Left distal radius fracture' });
    const right = makeCase({ diagnosis: 'Right distal radius fracture' });
    const aiMap = new Map([
      ['left distal radius fracture', 'Forearm (Radius / Ulna) – Radius – Distal'],
      ['right distal radius fracture', 'Forearm (Radius / Ulna) – Radius – Distal'],
    ]);
    expect(regionBucketLabel(left, aiMap)).toBe(regionBucketLabel(right, aiMap));
  });
});

describe('uniqueUnclassifiedTexts', () => {
  it('excludes cases Q6 resolves, deduplicated by normalized text', () => {
    const cases = [
      makeCase({ aoCode: '32-A1', aoRegionLabel: 'Femur', diagnosis: 'Femoral shaft fracture' }),
      makeCase({ diagnosis: 'Distal radius fracture' }),
      makeCase({ diagnosis: '  distal   radius fracture  ' }),
      makeCase({ diagnosis: '', otherClassification: '', memo: '' }),
    ];
    expect(uniqueUnclassifiedTexts(cases)).toEqual(['Distal radius fracture']);
  });

  it('includes a case whose aoCode parses to no known region, since that is what the bucket falls back on', () => {
    // Keying off "aoCode is blank" instead would leave this text unsent and
    // strand the case in "Unclassified" however good the model's answer.
    const c = makeCase({ aoCode: 'XYZ99', aoRegionLabel: 'Tibia', diagnosis: 'Tibial plateau fracture' });
    expect(uniqueUnclassifiedTexts([c])).toEqual(['Tibial plateau fracture']);
    expect(regionBucketLabel(c, new Map([['tibial plateau fracture', 'Tibia / Fibula (Leg) – Tibia – Proximal']]))).toBe(
      'Tibia / Fibula (Leg) – Tibia – Proximal',
    );
  });
});

describe('topRegions', () => {
  it('ranks by frequency, tying alphabetically, using the AI map for unresolved cases', () => {
    const cases = [
      makeCase({ aoCode: '32-A1', aoRegionLabel: 'Femur' }),
      makeCase({ aoCode: '32-B2', aoRegionLabel: 'Femur' }),
      makeCase({ diagnosis: 'Ankle fracture, no code' }),
      makeCase({ diagnosis: 'Something unrecognizable' }),
    ];
    const aiMap = new Map([['ankle fracture, no code', 'Malleolus (Ankle)']]);
    const ranked = topRegions(cases, 5, aiMap);
    expect(ranked[0]).toEqual({ label: 'Femur – Diaphyseal', count: 2 });
    expect(ranked[1]).toEqual({ label: 'Malleolus (Ankle)', count: 1 });
    expect(ranked[2]).toEqual({ label: 'Unclassified', count: 1 });
  });

  it('caps at n', () => {
    const cases = ['15', '14', '16', '5', '9', '9'].map(code => makeCase({ aoCode: code }));
    expect(topRegions(cases, 5)).toHaveLength(5);
  });
});
