/** The fleet runs on Israel time: month boundaries and "today" use this zone. */
export const FLEET_TZ = 'Asia/Jerusalem';

/** Offset of `zone` from UTC at `date`, in minutes (e.g. +180 in Israeli summer time). */
function offsetMinutes(date: Date, zone: string): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' })
    .formatToParts(date)
    .find((p) => p.type === 'timeZoneName')!.value; // "GMT+03:00" or "GMT"
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
  if (!m) return 0;
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
}

/** The instant the current month began in `zone`. */
export function startOfMonth(now: Date, zone = FLEET_TZ): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
  })
    .formatToParts(now)
    .reduce<Record<string, string>>((acc, p) => ((acc[p.type] = p.value), acc), {});
  const localMidnight = Date.UTC(Number(parts.year), Number(parts.month) - 1, 1);
  // Midnight local = midnight UTC minus the zone offset in force at that moment.
  const guess = new Date(localMidnight - offsetMinutes(new Date(localMidnight), zone) * 60_000);
  return new Date(localMidnight - offsetMinutes(guess, zone) * 60_000);
}
