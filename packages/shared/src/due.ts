/**
 * How close a service or inspection is (Sagi, 2026-11-22): an orange border from 80 engine
 * hours or one month before, a red border from 20 hours or one week before, and full red once
 * overdue. Plain constants only, so the web bundle can import them without zod.
 */
export const DUE_LEVELS = ['soon', 'urgent', 'overdue'] as const;
export type DueLevel = (typeof DUE_LEVELS)[number];

export const DUE_HOURS = { soon: 80, urgent: 20 } as const;
/** "One month" is counted as 31 days, so a whole calendar month always shows. */
export const DUE_DAYS = { soon: 31, urgent: 7 } as const;

const DAY_MS = 86_400_000;

/** From whole days left (negative = overdue). */
export function dueByDays(days: number | null | undefined): DueLevel | null {
  if (days === null || days === undefined || Number.isNaN(days)) return null;
  if (days < 0) return 'overdue';
  if (days <= DUE_DAYS.urgent) return 'urgent';
  if (days <= DUE_DAYS.soon) return 'soon';
  return null;
}

/** From a due date, compared with today (a date due today is not yet overdue). */
export function dueByDate(
  iso: string | Date | null | undefined,
  now = Date.now(),
): DueLevel | null {
  if (!iso) return null;
  const due = new Date(iso);
  const today = new Date(now);
  const days = Math.round(
    (Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate()) -
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())) /
      DAY_MS,
  );
  return dueByDays(days);
}

/** From engine hours left until the service (negative = overdue). */
export function dueByHours(left: number | null | undefined): DueLevel | null {
  if (left === null || left === undefined || Number.isNaN(left)) return null;
  if (left < 0) return 'overdue';
  if (left <= DUE_HOURS.urgent) return 'urgent';
  if (left <= DUE_HOURS.soon) return 'soon';
  return null;
}

/** The more pressing of several levels. */
export function worstDue(...levels: (DueLevel | null | undefined)[]): DueLevel | null {
  let worst = -1;
  for (const l of levels) if (l) worst = Math.max(worst, DUE_LEVELS.indexOf(l));
  return worst < 0 ? null : DUE_LEVELS[worst]!;
}
