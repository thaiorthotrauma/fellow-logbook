import { REGIONS, type Region } from './data';
import type { AoState } from './types';

export function findRegion(key: string | null): Region | undefined {
  return REGIONS.find(r => r.key === key);
}

export function computeAoCode(ao: AoState): string {
  const region = findRegion(ao.regionKey);
  if (!region) return '';
  const base = ao.segmentCode || ao.subtypeCode || region.code;
  let code = base;
  if (ao.type) code += '-' + ao.type + (ao.group || '');
  return code;
}
