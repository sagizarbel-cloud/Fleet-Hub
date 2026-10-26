import { describe, expect, it } from 'vitest';
import { economyPoints, type FuelReading } from './fuel';

const day = (n: number) => new Date(Date.UTC(2026, 0, 1 + n * 7));

/** Fill-ups `liters[i]` each after `step` km (or hours). */
function road(liters: number[], step = 500): FuelReading[] {
  return liters.map((l, i) => ({
    id: `f${i}`,
    date: day(i),
    liters: l,
    odometerKm: 10_000 + i * step,
    engineHours: null,
  }));
}

describe('economyPoints', () => {
  it('skips the first fill-up and divides distance by the litres put in', () => {
    const points = economyPoints(road([60, 50, 40]), 'KM');
    expect(points.map((p) => p.value)).toEqual([10, 12.5]);
    expect(points[0]!.id).toBe('f1');
  });

  it('works in litres per engine hour for machines, in any input order', () => {
    const entries: FuelReading[] = [
      { id: 'b', date: day(1), liters: 150, odometerKm: null, engineHours: 1_030 },
      { id: 'a', date: day(0), liters: 200, odometerKm: null, engineHours: 1_000 },
    ];
    expect(economyPoints(entries, 'HOURS')).toEqual([
      expect.objectContaining({ id: 'b', value: 5, drop: false }),
    ]);
  });

  it('needs three earlier fill-ups before it flags anything', () => {
    const points = economyPoints(road([50, 50, 50, 100]), 'KM');
    expect(points.every((p) => !p.drop)).toBe(true);
  });

  it('flags a fill-up 25% or more worse than the median of the five before it', () => {
    // 10 km/L for five fill-ups, then 7.5 km/L (exactly 25% worse), then 8 km/L (20% worse).
    const points = economyPoints(road([50, 50, 50, 50, 50, 50, 66.67, 62.5]), 'KM');
    const last = points.slice(-2);
    expect(last[0]).toMatchObject({ value: 7.5, baseline: 10, drop: true });
    expect(last[1]).toMatchObject({ value: 8, drop: false });
  });

  it('flags more litres per hour as worse for machines', () => {
    const entries: FuelReading[] = [0, 1, 2, 3, 4].map((i) => ({
      id: `h${i}`,
      date: day(i),
      liters: i === 4 ? 160 : 100,
      odometerKm: null,
      engineHours: 500 + i * 20,
    }));
    const points = economyPoints(entries, 'HOURS');
    expect(points.at(-1)).toMatchObject({ value: 8, baseline: 5, drop: true });
  });

  it('ignores entries without a reading and readings that go backwards', () => {
    const entries = road([50, 50, 50]);
    entries[1]!.odometerKm = null;
    entries.push({ id: 'x', date: day(9), liters: 40, odometerKm: 9_000, engineHours: null });
    expect(economyPoints(entries, 'KM').map((p) => p.id)).toEqual(['f2']);
  });
});
