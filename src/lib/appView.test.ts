import { describe, expect, it } from 'vitest';
import { getAppView } from './appView';

describe('getAppView', () => {
  it('recognizes ?view=staff and ?view=demo', () => {
    expect(getAppView('?view=staff')).toBe('staff');
    expect(getAppView('?view=demo')).toBe('demo');
  });

  it('no view param → null', () => {
    expect(getAppView('')).toBeNull();
    expect(getAppView('?foo=bar')).toBeNull();
  });

  it('an unrecognized view value is treated as no view, not passed through', () => {
    expect(getAppView('?view=admin')).toBeNull();
  });

  it('works alongside other query params, in either order', () => {
    expect(getAppView('?foo=bar&view=staff')).toBe('staff');
    expect(getAppView('?view=demo&foo=bar')).toBe('demo');
  });
});
