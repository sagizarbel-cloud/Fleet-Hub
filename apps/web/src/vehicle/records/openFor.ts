const DAY_MS = 86_400_000;

/** Whole days a malfunction was (or has been) open: reported day to resolved day, or to today. */
export function openDays(reportedAt: string, resolvedAt: string | null, now = new Date()): number {
  const start = new Date(reportedAt).getTime();
  const end = resolvedAt ? new Date(resolvedAt).getTime() : now.getTime();
  return Math.max(0, Math.floor((end - start) / DAY_MS));
}

/** The i18n key and count for "Open for N days" / "Was open N days". */
export function openForKey(days: number, resolved: boolean) {
  const base = resolved ? 'report.wasOpen' : 'report.openFor';
  const form = days === 0 ? 'none' : days === 1 ? 'one' : days === 2 ? 'two' : 'many';
  return { key: `${base}.${form}` as const, count: days };
}
