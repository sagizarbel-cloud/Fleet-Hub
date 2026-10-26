import { describe, expect, it } from 'vitest';
import { startOfMonth } from '../src/lib/time';

describe('startOfMonth (Asia/Jerusalem)', () => {
  it('uses the summer offset (UTC+3)', () => {
    expect(startOfMonth(new Date('2026-07-15T12:00:00Z')).toISOString()).toBe(
      '2026-06-30T21:00:00.000Z',
    );
  });

  it('uses the winter offset (UTC+2)', () => {
    expect(startOfMonth(new Date('2026-12-15T12:00:00Z')).toISOString()).toBe(
      '2026-11-30T22:00:00.000Z',
    );
  });

  it('treats late UTC on the last day as next month locally', () => {
    // 22:30 UTC on 31 Oct is already 1 Nov 00:30 in Israel (winter time).
    expect(startOfMonth(new Date('2026-10-31T22:30:00Z')).toISOString()).toBe(
      '2026-10-31T22:00:00.000Z',
    );
  });

  it('handles a month that starts in summer time and ends in winter time', () => {
    // October 2026 starts on IDT (UTC+3); DST ends late in the month.
    expect(startOfMonth(new Date('2026-10-30T10:00:00Z')).toISOString()).toBe(
      '2026-09-30T21:00:00.000Z',
    );
  });
});
