import { describe, expect, it } from 'vitest';
import { deriveStatus } from './status';

const now = new Date('2026-06-01T00:00:00Z');
const future = new Date('2027-01-01T00:00:00Z');
const past = new Date('2026-05-01T00:00:00Z');
const base = { malfunctions: [], annualTestExpiry: future, insuranceExpiry: future };

describe('deriveStatus', () => {
  it('is green with no open malfunctions and valid compliance', () => {
    expect(deriveStatus(base, now)).toBe('GREEN');
  });

  it('is red with a critical open malfunction', () => {
    expect(deriveStatus({ ...base, malfunctions: [{ severity: 'CRITICAL', state: 'OPEN' }] }, now)).toBe('RED');
  });

  it('treats in-progress as open', () => {
    expect(deriveStatus({ ...base, malfunctions: [{ severity: 'CRITICAL', state: 'IN_PROGRESS' }] }, now)).toBe('RED');
    expect(deriveStatus({ ...base, malfunctions: [{ severity: 'LOW', state: 'IN_PROGRESS' }] }, now)).toBe('AMBER');
  });

  it('is red when the annual test or insurance has expired', () => {
    expect(deriveStatus({ ...base, annualTestExpiry: past }, now)).toBe('RED');
    expect(deriveStatus({ ...base, insuranceExpiry: past }, now)).toBe('RED');
  });

  it('is amber with a non-critical open malfunction', () => {
    expect(deriveStatus({ ...base, malfunctions: [{ severity: 'HIGH', state: 'OPEN' }] }, now)).toBe('AMBER');
  });

  it('ignores resolved malfunctions', () => {
    expect(deriveStatus({ ...base, malfunctions: [{ severity: 'CRITICAL', state: 'RESOLVED' }] }, now)).toBe('GREEN');
  });

  it('treats missing compliance dates as not expired', () => {
    expect(deriveStatus({ ...base, annualTestExpiry: null, insuranceExpiry: null }, now)).toBe('GREEN');
  });

  it('lets a manual override win', () => {
    expect(deriveStatus({ ...base, insuranceExpiry: past, override: 'GREEN' }, now)).toBe('GREEN');
  });
});
