export type UsageUnit = 'KM' | 'HOURS';
export type EconomyUnit = 'KM_PER_L' | 'L_PER_HOUR';

/**
 * Sudden-drop rule (Sagi, 2026-10-26): a fill-up is flagged when its economy is at least
 * DROP_RATIO worse than the median of the DROP_WINDOW fill-ups before it. At least
 * DROP_MIN_HISTORY earlier fill-ups are needed before anything is flagged.
 */
export const DROP_RATIO = 0.25;
export const DROP_WINDOW = 5;
export const DROP_MIN_HISTORY = 3;

export interface FuelReading {
  id: string;
  date: Date | string;
  liters: number;
  odometerKm: number | null;
  engineHours: number | null;
}

export interface EconomyPoint {
  id: string;
  date: string;
  /** km per litre (road vehicles) or litres per engine hour (equipment). */
  value: number;
  /** The median of the fill-ups before it, when there were enough to compare. */
  baseline: number | null;
  drop: boolean;
}

export const economyUnit = (unit: UsageUnit): EconomyUnit =>
  unit === 'KM' ? 'KM_PER_L' : 'L_PER_HOUR';

function median(values: number[]) {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Economy per fill-up, oldest first (the full-tank method): the distance or hours since the
 * previous fill-up with a reading, against the litres put in now. The first fill-up only sets
 * the starting reading. Entries may come in any order.
 */
export function economyPoints(entries: FuelReading[], unit: UsageUnit): EconomyPoint[] {
  const reading = (e: FuelReading) => (unit === 'KM' ? e.odometerKm : e.engineHours);
  const sorted = entries
    .filter((e) => reading(e) !== null)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const points: EconomyPoint[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const e = sorted[i]!;
    const distance = reading(e)! - reading(sorted[i - 1]!)!;
    if (distance <= 0 || e.liters <= 0) continue;
    const value = round2(unit === 'KM' ? distance / e.liters : e.liters / distance);
    const history = points.slice(-DROP_WINDOW).map((p) => p.value);
    const baseline = history.length >= DROP_MIN_HISTORY ? round2(median(history)) : null;
    const drop =
      baseline !== null &&
      (unit === 'KM' ? value <= baseline * (1 - DROP_RATIO) : value >= baseline * (1 + DROP_RATIO));
    points.push({ id: e.id, date: new Date(e.date).toISOString(), value, baseline, drop });
  }
  return points;
}
