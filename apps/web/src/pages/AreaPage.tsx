import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { VEHICLE_STATUSES } from '@fleet-hub/shared';
import { StatusBadge } from '@/components/StatusBadge';
import { AREA_ROUTES, type Area } from '@/layout/nav';

/** Empty state for an area that later phases fill in. */
export function AreaPage({ area }: { area: Area }) {
  const { t } = useTranslation();
  const Icon = AREA_ROUTES[area].icon;
  const title = t(`nav.${area}`);

  useEffect(() => {
    document.title = `${title} · ${t('app.name')}`;
  }, [title, t]);

  return (
    <section
      aria-labelledby="area-title"
      className="glass flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center"
    >
      <div className="bg-accent/10 text-accent grid size-14 place-items-center rounded-2xl">
        <Icon aria-hidden className="size-7" />
      </div>
      <h1 id="area-title" className="text-2xl font-semibold tracking-tight">
        {title}
      </h1>
      <p className="text-muted max-w-md">{t(`areas.${area}`)}</p>
      {area === 'dashboard' && (
        <div className="mt-4 flex flex-col items-center gap-2">
          <span className="text-muted text-xs">{t('status.legend')}</span>
          <div className="flex flex-wrap justify-center gap-2">
            {VEHICLE_STATUSES.map((s) => (
              <StatusBadge key={s} status={s} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
