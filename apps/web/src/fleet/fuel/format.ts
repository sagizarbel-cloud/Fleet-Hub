import { useTranslation } from 'react-i18next';
import { localeOf, relativeFormat } from '@/lib/intl';

/** "62%", "62% · 310 L", or "310 L" when only litres are known. */
export function fuelAmount(
  level: { pct: number | null; liters: number | null },
  num: Intl.NumberFormat,
) {
  const parts = [
    level.pct !== null ? `${num.format(Math.round(level.pct))}%` : null,
    level.liters !== null ? `${num.format(Math.round(level.liters))} L` : null,
  ].filter(Boolean);
  return parts.join(' · ');
}

/** "now", "4 min ago", "3 hours ago", "yesterday": how old a reading is, in the active language. */
export function useFuelAge() {
  const { i18n } = useTranslation();
  const rel = relativeFormat(localeOf(i18n.language), { numeric: 'auto', style: 'short' });
  return (at: string, now: number) => {
    const sec = Math.max(0, (now - Date.parse(at)) / 1000);
    if (sec < 60) return rel.format(0, 'second');
    if (sec < 3600) return rel.format(-Math.floor(sec / 60), 'minute');
    if (sec < 86_400) return rel.format(-Math.floor(sec / 3600), 'hour');
    return rel.format(-Math.floor(sec / 86_400), 'day');
  };
}
