import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, SlidersHorizontal } from 'lucide-react';
import { DEFAULT_PINNED_VITALS, VITAL_KEYS, type VitalKey } from '@fleet-hub/shared';
import { Popover } from '@/components/Popover';
import { cn } from '@/lib/cn';
import { usePreferences, useSavePreferences, type VehicleDetail } from './data';
import { useVehicleInfo, type Info } from './vitals';

const TONE = { ok: 'text-ok', warn: 'text-warn', bad: 'text-bad' } as const;

export function InfoValue({ info, className }: { info: Info; className?: string }) {
  const { t } = useTranslation();
  if (info.value === null)
    return <span className={cn('text-muted', className)}>{t('dashboard.notSet')}</span>;
  return (
    <span
      className={cn(info.mono && 'num', info.tone && TONE[info.tone], className)}
      title={info.hint}
    >
      {info.ltr ? <bdi dir="ltr">{info.value}</bdi> : info.value}
    </span>
  );
}

/** The pinned vitals row (SPEC A6) and its "Customize vitals" picker, saved per user. */
export function VitalsBar({ vehicle }: { vehicle: VehicleDetail | undefined }) {
  const { t } = useTranslation();
  const info = useVehicleInfo(vehicle);
  const prefs = usePreferences();
  const save = useSavePreferences();
  const pinned = prefs.data?.pinnedVitals ?? DEFAULT_PINNED_VITALS;
  const unpinned = VITAL_KEYS.filter((k) => !pinned.includes(k));

  const set = (pinnedVitals: VitalKey[]) => save.mutate({ pinnedVitals });
  const move = (i: number, by: -1 | 1) => {
    const next = [...pinned];
    [next[i], next[i + by]] = [next[i + by]!, next[i]!];
    set(next);
  };

  return (
    <div className="mt-3 flex flex-wrap items-start gap-2" data-testid="vitals">
      <dl className="grid min-w-0 flex-1 grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))]">
        {pinned.map((key) => {
          const v = info(key);
          return (
            <div
              key={key}
              data-vital={key}
              className="border-border bg-surface-strong/60 min-w-0 rounded-lg border px-2.5 py-1.5"
            >
              <dt className="text-muted truncate text-xs">{v.label}</dt>
              <dd className="text-sm font-medium break-words">
                {vehicle ? <InfoValue info={v} /> : <span className="text-muted">…</span>}
              </dd>
            </div>
          );
        })}
      </dl>
      <Popover
        label={t('vehicle.vitals.customize')}
        trigger={
          <>
            <SlidersHorizontal aria-hidden className="size-3.5" />
            <span className="hidden sm:inline">{t('vehicle.vitals.customize')}</span>
          </>
        }
        panelClassName="w-72 max-h-[60vh] overflow-y-auto"
      >
        {() => (
          <div className="space-y-2 text-sm">
            <p className="text-muted px-1 text-xs">{t('vehicle.vitals.hint')}</p>
            <ul aria-label={t('vehicle.vitals.pinned')} className="space-y-0.5">
              {pinned.map((key, i) => (
                <li key={key} className="flex items-center gap-1">
                  <label className="hover:bg-border flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1">
                    <input
                      type="checkbox"
                      checked
                      onChange={() => set(pinned.filter((k) => k !== key))}
                      className="accent-[var(--fh-accent)]"
                    />
                    <span className="truncate">{info(key).label}</span>
                  </label>
                  <button
                    type="button"
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                    aria-label={t('vehicle.vitals.moveUp', { name: info(key).label })}
                    className="text-muted hover:text-text rounded p-1 disabled:opacity-30"
                  >
                    <ArrowUp aria-hidden className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={i === pinned.length - 1}
                    onClick={() => move(i, 1)}
                    aria-label={t('vehicle.vitals.moveDown', { name: info(key).label })}
                    className="text-muted hover:text-text rounded p-1 disabled:opacity-30"
                  >
                    <ArrowDown aria-hidden className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
            {unpinned.length > 0 && (
              <ul
                aria-label={t('vehicle.vitals.more')}
                className="border-border space-y-0.5 border-t pt-2"
              >
                {unpinned.map((key) => (
                  <li key={key}>
                    <label className="hover:bg-border flex items-center gap-2 rounded-md px-1 py-1">
                      <input
                        type="checkbox"
                        checked={false}
                        onChange={() => set([...pinned, key])}
                        className="accent-[var(--fh-accent)]"
                      />
                      <span className="truncate">{info(key).label}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => set(DEFAULT_PINNED_VITALS)}
              className="text-accent-ink px-1 text-xs hover:underline"
            >
              {t('vehicle.vitals.reset')}
            </button>
          </div>
        )}
      </Popover>
    </div>
  );
}
