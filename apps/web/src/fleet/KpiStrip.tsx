import { lazy, Suspense, useState } from 'react';
import { CalendarClock, CircleCheck, CircleX, TriangleAlert, Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { prefersReducedMotion } from '@/lib/motion';
import { VEHICLE_STATUSES, type VehicleStatus } from '@fleet-hub/shared';
import { cn } from '@/lib/cn';
import type { Dashboard } from './data';
import { formatMoney } from './events';

const OpenMalfunctionsSheet = lazy(() => import('./OpenMalfunctionsSheet'));
const DueSheet = lazy(() => import('./DueSheet'));
const SpendSheet = lazy(() => import('./SpendSheet'));

type SheetName = 'open' | 'due' | 'spend';

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
  const [sheet, setSheet] = useState<SheetName | null>(null);
  const close = () => setSheet(null);

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
      {/* Revisions 1: the box opens the list of what's due, by vehicle. */}
      <button
        type="button"
        onClick={() => setSheet('due')}
        className="glass hover:border-border-strong col-span-2 block p-3 text-start"
        data-testid="kpi-due"
        aria-label={t('dashboard.dueList.title')}
      >
        <span className="text-muted mb-1 inline-flex items-center gap-1.5 text-xs font-medium">
          <CalendarClock aria-hidden className="size-3.5" />
          {t('dashboard.kpi.due')}
        </span>
        <span className="flex items-end gap-4">
          <span className="num text-2xl leading-none font-semibold">{due.total}</span>
          <span className="text-muted flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
            {DUE_KEYS.map(([key, field]) => (
              <span key={key} className="flex gap-1">
                <span>{t(`dashboard.kpi.${key}`)}</span>
                <span className="num text-text">{due[field]}</span>
              </span>
            ))}
          </span>
        </span>
      </button>
      {/* Revisions 1: the box opens the list of open malfunctions, each with its report. */}
      <button
        type="button"
        onClick={() => setSheet('open')}
        className="glass hover:border-border-strong block p-3 text-start"
        data-testid="kpi-malfunctions"
        aria-label={t('report.fleetOpenTitle')}
      >
        <span className="text-muted mb-1 inline-flex items-center gap-1.5 text-xs font-medium">
          <TriangleAlert aria-hidden className="size-3.5" />
          {t('dashboard.kpi.openMalfunctions')}
        </span>
        <span
          className={cn(
            'num block text-2xl leading-none font-semibold',
            kpis.openMalfunctions > 0 && 'text-warn',
          )}
        >
          {kpis.openMalfunctions}
        </span>
      </button>
      {/* Revisions 1: the box opens this month's spend, by vehicle. */}
      <button
        type="button"
        onClick={() => setSheet('spend')}
        className="glass hover:border-border-strong block p-3 text-start"
        data-testid="kpi-spend"
        aria-label={t('dashboard.spendList.title')}
      >
        <span className="text-muted mb-1 inline-flex items-center gap-1.5 text-xs font-medium">
          <Wallet aria-hidden className="size-3.5" />
          {t('dashboard.kpi.spendThisMonth')}
        </span>
        <span className="num block text-xl leading-none font-semibold">
          <bdi>{formatMoney(kpis.spendThisMonth, i18n.language)}</bdi>
        </span>
      </button>
      {sheet && (
        <Suspense>
          {sheet === 'open' && (
            <OpenMalfunctionsSheet onClose={close} reduced={prefersReducedMotion()} />
          )}
          {sheet === 'due' && <DueSheet onClose={close} reduced={prefersReducedMotion()} />}
          {sheet === 'spend' && <SpendSheet onClose={close} reduced={prefersReducedMotion()} />}
        </Suspense>
      )}
    </section>
  );
}
