import { describe, expect, it } from 'vitest';
import { computeAoCode, findRegion } from './logic';
import { emptyAo } from './types';

describe('findRegion', () => {
  it('resolves a known region key', () => {
    expect(findRegion('femur')?.name).toBe('Femur');
  });

  it('returns undefined for a null or unknown key', () => {
    expect(findRegion(null)).toBeUndefined();
    expect(findRegion('not-a-region')).toBeUndefined();
  });
});

describe('computeAoCode', () => {
  it('returns empty string when no region is selected', () => {
    expect(computeAoCode(emptyAo())).toBe('');
  });

  it('uses the region code as the base when no segment/subtype chosen', () => {
    expect(computeAoCode({ ...emptyAo(), regionKey: 'patella' })).toBe('34');
  });

  it('prefers the segment code over the region code', () => {
    expect(computeAoCode({ ...emptyAo(), regionKey: 'femur', segmentCode: '33' })).toBe('33');
  });

  it('prefers the subtype code when there is no segment', () => {
    expect(computeAoCode({ ...emptyAo(), regionKey: 'hand', subtypeCode: '72' })).toBe('72');
  });

  it('appends type and group as a full AO/OTA code', () => {
    const code = computeAoCode({
      ...emptyAo(),
      regionKey: 'femur',
      segmentCode: '33',
      type: 'A',
      group: '2',
    });
    expect(code).toBe('33-A2');
  });

  it('appends type without a group when no group is chosen', () => {
    const code = computeAoCode({ ...emptyAo(), regionKey: 'femur', segmentCode: '32', type: 'B' });
    expect(code).toBe('32-B');
  });
});
