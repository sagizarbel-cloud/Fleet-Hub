import { describe, expect, it } from 'vitest';
import { openDays, openForKey } from './openFor';

describe('openDays', () => {
  const now = new Date('2026-11-22T12:00:00Z');
  it('counts to today while open', () => {
    expect(openDays('2026-11-19T00:00:00Z', null, now)).toBe(3);
  });
  it('counts to the resolved day once resolved', () => {
    expect(openDays('2026-11-01T00:00:00Z', '2026-11-03T00:00:00Z', now)).toBe(2);
  });
  it('never goes below zero', () => {
    expect(openDays('2026-11-23T00:00:00Z', null, now)).toBe(0);
  });
  it('picks the wording', () => {
    expect(openForKey(0, true).key).toBe('report.wasOpen.none');
    expect(openForKey(2, false).key).toBe('report.openFor.two');
    expect(openForKey(9, false)).toEqual({ key: 'report.openFor.many', count: 9 });
  });
});
