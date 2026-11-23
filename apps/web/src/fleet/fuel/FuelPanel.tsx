import { lazy, Suspense, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Clock, Fuel, Hand, Loader2, Pencil, Radio } from 'lucide-react';
import { FUEL_LOW_PCT, fuelState, type FuelState } from '@fleet-hub/shared';
import { cn } from '@/lib/cn';
import { localeOf, numberFormat } from '@/lib/intl';
import { prefersReducedMotion } from '@/lib/motion';
import { useFuel, useFuelStream, type FuelRow, type StreamState } from './data';
import { fuelAmount, useFuelAge } from './format';
import { useCan } from '@/auth/can';

const SetFuelSheet = lazy(() => import('./SetFuelSheet'));

const SORTS = ['low', 'serial'] as const;
type Sort = (typeof SORTS)[number];

/** Lowest first, vehicles with no reading last; or by serial. */
function sortRows(rows: FuelRow[], sort: Sort) {
  const pct = (r: FuelRow) => r.level?.pct ?? (r.level ? 101 : 102);
  return [...rows].sort((a, b) =>
    sort === 'low'
      ? pct(a) - pct(b) || a.serial.localeCompare(b.serial)
      : a.serial.localeCompare(b.serial),
  );
}

const STATE_STYLE: Record<FuelState, { icon: typeof Radio; tone: string }> = {
  live: { icon: Radio, tone: 'text-ok' },
  stale: { icon: Clock, tone: 'text-warn' },
  manual: { icon: Hand, tone: 'text-muted' },
  none: { icon: Clock, tone: 'text-muted' },
};

/**
 * Current fuel (Sagi, 2026-11-15): every vehicle's fuel level on the dashboard, lowest first.
 * Connected vehicles update in real time; each row says whether its level is live, stale (the
 * vehicle stopped reporting) or read by hand, and how old it is. Editors set a level by hand.
 */
export function FuelPanel() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const canSet = useCan().card('fuelLevel');
  const fuel = useFuel();
  const { state: link, updated, now } = useFuelStream();
  const age = useFuelAge();
  const num = numberFormat(localeOf(i18n.language), { maximumFractionDigits: 0 });
  const [sort, setSort] = useState<Sort>('low');
  const [setting, setSetting] = useState<FuelRow | null>(null);

  // The order is fixed when the list loads or the sort changes, not on every live reading, so
  // rows don't jump under a finger.
  const rows = fuel.data;
  const serialsKey = rows?.map((r) => r.serial).join('|') ?? '';
  const order = useMemo(
    () => (rows ? sortRows(rows, sort).map((r) => r.serial) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-sort on load and sort only
    [serialsKey, sort],
  );
  const bySerial = new Map(rows?.map((r) => [r.serial, r]));
  const states = rows?.map((r) => fuelState(r.level, now)) ?? [];
  const liveCount = states.filter((s) => s === 'live').length;
  const lowCount = rows?.filter((r) => r.level?.pct != null && r.level.pct <= FUEL_LOW_PCT).length;

  return (
    <section
      aria-labelledby="fuel-title"
      className="glass flex flex-col p-3"
      data-testid="fuel-panel"
    >
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <h2 id="fuel-title" className="inline-flex items-center gap-1.5 text-sm font-semibold">
          <Fuel aria-hidden className="size-4" />
          {t('fuel.title')}
        </h2>
        <LinkState state={link} />
        <div className="ms-auto flex items-center gap-1" role="group" aria-label={t('fuel.sort')}>
          {SORTS.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={sort === s}
              onClick={() => setSort(s)}
              className={cn(
                'rounded-md border px-2 py-0.5 text-xs',
                sort === s
                  ? 'border-accent bg-accent text-accent-contrast'
                  : 'border-border text-muted hover:text-text',
              )}
            >
              {t(`fuel.sortBy.${s}`)}
            </button>
          ))}
        </div>
      </div>
      {rows && (
        <p className="text-muted mb-2 flex flex-wrap gap-x-3 text-xs" data-testid="fuel-summary">
          <span className="inline-flex items-center gap-1">
            <Radio aria-hidden className="text-ok size-3.5" />
            {t('fuel.liveCount', { count: liveCount })}
          </span>
          {!!lowCount && (
            <span className="text-bad inline-flex items-center gap-1">
              <Fuel aria-hidden className="size-3.5" />
              {t('fuel.lowCount', { count: lowCount })}
            </span>
          )}
        </p>
      )}
      {fuel.isPending ? (
        <Loader2 aria-hidden className="text-muted mx-auto my-6 size-5 animate-spin" />
      ) : fuel.isError ? (
        <p role="alert" className="text-bad py-4 text-center text-sm">
          {t('records.error.load')}
        </p>
      ) : rows!.length === 0 ? (
        <p className="text-muted py-4 text-center text-sm">{t('fuel.empty')}</p>
      ) : (
        <ul
          className="-me-1.5 max-h-[18.5rem] space-y-0.5 overflow-y-auto pe-1.5"
          data-testid="fuel-list"
        >
          {order.map((serial) => {
            const r = bySerial.get(serial);
            if (!r) return null;
            const state = fuelState(r.level, now);
            const { icon: Icon, tone } = STATE_STYLE[state];
            const pct = r.level?.pct ?? null;
            const low = pct !== null && pct <= FUEL_LOW_PCT;
            const flash = updated?.serial === serial ? updated.n : 0;
            return (
              <li
                key={serial}
                className="relative flex items-center gap-1"
                data-serial={serial}
                data-state={state}
              >
                {flash > 0 && (
                  <span
                    key={flash}
                    aria-hidden
                    className="fh-fuel-flash bg-accent/25 pointer-events-none absolute inset-0 rounded-md"
                  />
                )}
                <button
                  type="button"
                  onClick={() =>
                    navigate(`/vehicles/${encodeURIComponent(serial)}`, {
                      state: { fromDashboard: true },
                    })
                  }
                  title={`${r.make} ${r.model}`}
                  className="hover:bg-border/50 grid min-w-0 flex-1 grid-cols-[4.75rem_minmax(0,1fr)_1rem] items-center gap-2 rounded-md px-1.5 py-1 text-start sm:grid-cols-[4.75rem_minmax(0,1fr)_6.5rem]"
                >
                  <span className="num border-border-strong justify-self-start rounded-md border px-1.5 py-px text-xs">
                    <bdi dir="ltr">{serial}</bdi>
                  </span>
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="bg-border relative h-2.5 flex-1 overflow-hidden rounded-full"
                      role="meter"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={pct ?? undefined}
                      aria-label={t('fuel.levelOf', { serial })}
                    >
                      {pct !== null && (
                        <span
                          className={cn(
                            'absolute inset-0 origin-left rounded-full transition-transform duration-700 ease-out rtl:origin-right',
                            low ? 'bg-bad' : 'bg-accent',
                          )}
                          style={{ transform: `scaleX(${Math.max(0.02, pct / 100)})` }}
                        />
                      )}
                    </span>
                    <span
                      className={cn(
                        'num w-[4.5rem] shrink-0 text-end text-xs',
                        low && 'text-bad font-semibold',
                        !r.level && 'text-muted',
                      )}
                    >
                      {r.level ? fuelAmount(r.level, num) : t('fuel.noReading')}
                    </span>
                  </span>
                  <span
                    className={cn('inline-flex min-w-0 items-center gap-1 text-xs', tone)}
                    title={t(`fuel.state.${state}`)}
                  >
                    <Icon
                      aria-hidden
                      className={cn('size-3.5 shrink-0', state === 'live' && 'fh-live')}
                    />
                    {/* Phones: the icon says it; the words are for screen readers. */}
                    <span className="sr-only sm:not-sr-only sm:truncate">
                      {state === 'live' || !r.level
                        ? t(`fuel.state.${state}`)
                        : age(r.level.at, now)}
                    </span>
                  </span>
                </button>
                {canSet && (
                  <button
                    type="button"
                    onClick={() => setSetting(r)}
                    className="text-muted hover:text-text hover:bg-border/50 grid size-8 shrink-0 place-items-center rounded-md"
                    aria-label={t('fuel.setFor', { serial })}
                    title={t('fuel.set')}
                  >
                    <Pencil aria-hidden className="size-3.5" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {setting && (
        <Suspense>
          <SetFuelSheet
            row={setting}
            onClose={() => setSetting(null)}
            reduced={prefersReducedMotion()}
          />
        </Suspense>
      )}
    </section>
  );
}

function LinkState({ state }: { state: StreamState }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-xs',
        state === 'open' ? 'text-ok' : 'text-muted',
      )}
      data-testid="fuel-link"
      data-state={state}
      role="status"
    >
      <span
        aria-hidden
        className={cn(
          'size-2 rounded-full',
          state === 'open' ? 'fh-live bg-ok' : state === 'down' ? 'bg-bad' : 'bg-warn',
        )}
      />
      {t(`fuel.link.${state}`)}
    </span>
  );
}
