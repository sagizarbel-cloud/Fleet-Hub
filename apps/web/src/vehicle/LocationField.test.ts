import { describe, expect, it } from 'vitest';
import { locationCode } from './LocationField';

describe('locationCode', () => {
  it('slugs an English name', () => {
    expect(locationCode('South Quarry #2', [])).toBe('south_quarry_2');
  });
  it('avoids codes already taken', () => {
    expect(locationCode('Site A', ['site_a', 'site_a_2'])).toBe('site_a_3');
  });
  it('makes up a valid code when the name has no Latin letters', () => {
    expect(locationCode('אתר דרום', [])).toMatch(/^loc_[a-z0-9]+$/);
    expect(locationCode('42', [])).toMatch(/^loc_[a-z0-9]+$/);
  });
});
