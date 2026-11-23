import { describe, expect, it } from 'vitest';
import { dueByDate, dueByDays, dueByHours, worstDue } from './due';

describe('due levels (Sagi, 2026-11-22)', () => {
  it('hours: orange at 80, red at 20, full red when past', () => {
    expect(dueByHours(81)).toBeNull();
    expect(dueByHours(80)).toBe('soon');
    expect(dueByHours(21)).toBe('soon');
    expect(dueByHours(20)).toBe('urgent');
    expect(dueByHours(0)).toBe('urgent');
    expect(dueByHours(-1)).toBe('overdue');
    expect(dueByHours(null)).toBeNull();
  });

  it('dates: orange within a month, red within a week, full red when past', () => {
    expect(dueByDays(32)).toBeNull();
    expect(dueByDays(31)).toBe('soon');
    expect(dueByDays(8)).toBe('soon');
    expect(dueByDays(7)).toBe('urgent');
    expect(dueByDays(0)).toBe('urgent');
    expect(dueByDays(-1)).toBe('overdue');
    const now = Date.parse('2026-11-22T15:00:00Z');
    expect(dueByDate('2026-11-22', now)).toBe('urgent');
    expect(dueByDate('2026-11-21', now)).toBe('overdue');
    expect(dueByDate('2026-12-20', now)).toBe('soon');
  });

  it('the more pressing level wins', () => {
    expect(worstDue('soon', null, 'urgent')).toBe('urgent');
    expect(worstDue('overdue', 'soon')).toBe('overdue');
    expect(worstDue(null, undefined)).toBeNull();
  });
});
