import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { UsageUnit } from '@fleet-hub/shared';
import { useLookups } from '@/fleet/data';
import type { Cell, Column, FormatCtx } from './kinds';
import type { RecordRow } from './api';

/** Dates as DD/MM/YYYY in both languages (SPEC A8). */
const DATE = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

export function useFormatCtx(unit: UsageUnit): FormatCtx {
  const { t, i18n } = useTranslation();
  const { data: lookups } = useLookups();
  const lang = i18n.language;
  return useMemo(() => {
    const locale = lang === 'he' ? 'he-IL' : 'en-GB';
    const money = new Intl.NumberFormat(lang === 'he' ? 'he-IL' : 'en-IL', {
      style: 'currency',
      currency: 'ILS',
      maximumFractionDigits: 0,
    });
    return {
      t,
      lang,
      lookups,
      unit,
      date: (iso) => DATE.format(new Date(iso)),
      number: (value, digits = 0) =>
        new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value),
      money: (value) => money.format(value),
    };
  }, [t, lang, lookups, unit]);
}

/** A cell as text on screen. Booleans become Yes / No; empty values stay empty. */
export function cellText(col: Column, row: RecordRow, ctx: FormatCtx): string {
  if (col.text) return col.text(row, ctx);
  const v: Cell = col.value(row, ctx);
  if (v === null || v === '') return '';
  if (v instanceof Date) return ctx.date(v.toISOString());
  if (typeof v === 'boolean') return v ? ctx.t('records.yes') : ctx.t('records.no');
  if (typeof v === 'number') return col.kind === 'money' ? ctx.money(v) : ctx.number(v, 2);
  return v;
}
