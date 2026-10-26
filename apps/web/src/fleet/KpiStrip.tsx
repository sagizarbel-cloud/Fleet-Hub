import { CalendarClock, CircleCheck, CircleX, TriangleAlert, Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { VEHICLE_STATUSES, type VehicleStatus } from '@fleet-hub/shared';
import { cn } from '@/lib/cn';
import type { Dashboard } from './data';
import { formatMoney } from './events';

const STATUS_STYLE: Record<VehicleStatus, { icon: typeof CircleCheck; tone: string }> = {
  GREEN: { icon: CircleCheck, tone: 'text-ok' },
  AMBER: { icon: TriangleAlert, tone: 'text-warn' },
  RED: { icon: CircleX, tone: 'text-bad' },
};

const DUE_KEYS = [
  ['dueService', 'service'],
  ['dueAnnualTest', 'annualTest'],
  ['dueInsurance', 'insurance'],
] as const;

/** Fleet at a glance: vehicles per status, what's due soon, open malfunctions, spend this month. */
export function KpiStrip({ kpis }: { kpis: Dashboard['kpis'] }) {
  const { t, i18n } = useTranslation();
  const due = kpis.dueWithin30Days;

  return (
    <section
      aria-label={t('dashboard.kpi.vehicles')}
      className="grid grid-cols-2 gap-2 sm:grid-cols-4"
    >
      <div className="glass col-span-2 p-3 sm:col-span-4" data-testid="kpi-status">
        <h2 className="text-muted mb-2 text-xs font-medium">{t('dashboard.kpi.vehicles')}</h2>
        <dl className="grid grid-cols-3 gap-2">
          {VEHICLE_STATUSES.map((s) => {
            const { icon: Icon, tone } = STATUS_STYLE[s];
            return (
              <div key={s} className="flex flex-col">
                <dd className={cn('num text-3xl leading-none font-semibold', tone)}>
                  {kpis.status[s]}
                </dd>
                <dt className={cn('mt-1 inline-flex items-center gap-1 text-xs', tone)}>
                  <Icon aria-hidden className="size-3.5" />
                  {t(`status.${s}`)}
                </dt>
              </div>
            );
          })}
        </dl>
      </div>
      <div className="glass col-span-2 p-3" data-testid="kpi-due">
        <h2 className="text-muted mb-1 inline-flex items-center gap-1.5 text-xs font-medium">
          <CalendarClock aria-hidden className="size-3.5" />
          {t('dashboard.kpi.due')}
        </h2>
        <div className="flex items-end gap-4">
          <span className="num text-2xl leading-none font-semibold">{due.total}</span>
          <dl className="text-muted flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
            {DUE_KEYS.map(([key, field]) => (
              <div key={key} className="flex gap-1">
                <dt>{t(`dashboard.kpi.${key}`)}</dt>
                <dd className="num text-text">{due[field]}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
      <div className="glass p-3" data-testid="kpi-malfunctions">
        <h2 className="text-muted mb-1 inline-flex items-center gap-1.5 text-xs font-medium">
          <TriangleAlert aria-hidden className="size-3.5" />
          {t('dashboard.kpi.openMalfunctions')}
        </h2>
        <span
          className={cn(
            'num text-2xl leading-none font-semibold',
            kpis.openMalfunctions > 0 && 'text-warn',
          )}
        >
          {kpis.openMalfunctions}
        </span>
      </div>
      <div className="glass p-3" data-testid="kpi-spend">
        <h2 className="text-muted mb-1 inline-flex items-center gap-1.5 text-xs font-medium">
          <Wallet aria-hidden className="size-3.5" />
          {t('dashboard.kpi.spendThisMonth')}
        </h2>
        <span className="num text-xl leading-none font-semibold">
          <bdi dir="ltr">{formatMoney(kpis.spendThisMonth, i18n.language)}</bdi>
        </span>
      </div>
    </section>
  );
}
