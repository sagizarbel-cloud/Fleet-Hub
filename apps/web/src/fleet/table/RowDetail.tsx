import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import type { RecordPage } from '@/vehicle/records/api';
import type { FormatCtx } from '@/vehicle/records/kinds';
import type { FleetRow } from './model';

const LATEST_SERVICES = 3;

/** The latest services and the open malfunctions, from the vehicle page's record API. */
function useRowDetail(serial: string) {
  const base = `/vehicles/${encodeURIComponent(serial)}/records`;
  return useQuery({
    queryKey: ['fleet', 'detail', serial],
    queryFn: async () => {
      const [services, open, inProgress] = await Promise.all([
        api<RecordPage>(`${base}/service?limit=${LATEST_SERVICES}`),
        api<RecordPage>(`${base}/malfunctions?state=OPEN&limit=20`),
        api<RecordPage>(`${base}/malfunctions?state=IN_PROGRESS&limit=20`),
      ]);
      return { services: services.items, malfunctions: [...open.items, ...inProgress.items] };
    },
  });
}

function Section({
  title,
  panel,
  onOpen,
  children,
}: {
  title: string;
  panel: string;
  onOpen: (panel: string) => void;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <section className="min-w-0 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-muted text-xs font-semibold">{title}</h3>
        <button
          type="button"
          onClick={() => onOpen(panel)}
          className="text-accent-ink text-xs font-medium hover:underline"
        >
          {t('fleet.detail.openPanel')}
        </button>
      </div>
      {children}
    </section>
  );
}

const Empty = ({ text }: { text: string }) => <p className="text-muted text-sm">{text}</p>;

/** A row opened in place: latest services, open malfunctions and assigned items (SPEC 5.4). */
export function RowDetail({
  row,
  ctx,
  onOpen,
}: {
  row: FleetRow;
  ctx: FormatCtx;
  onOpen: (panel: string) => void;
}) {
  const { t } = useTranslation();
  const detail = useRowDetail(row.serial);
  const str = (v: unknown) => (typeof v === 'string' ? v : '');

  let records;
  if (detail.isPending) {
    records = <Loader2 aria-hidden className="text-muted size-5 animate-spin" />;
  } else if (detail.isError) {
    records = (
      <p role="alert" className="text-bad text-sm">
        {t('records.error.load')}
      </p>
    );
  }

  return (
    <div className="grid gap-4 p-3 sm:grid-cols-3" data-testid={`detail-${row.serial}`}>
      <Section title={t('fleet.detail.services')} panel="service" onOpen={onOpen}>
        {records ??
          (detail.data!.services.length ? (
            <ul className="space-y-1 text-sm">
              {detail.data!.services.map((s) => (
                <li key={s.id} className="flex gap-2">
                  <span className="num text-muted shrink-0">{ctx.date(str(s.date))}</span>
                  <span className="truncate">{str(s.description)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty text={t('vehicle.records.empty')} />
          ))}
      </Section>
      <Section title={t('fleet.detail.malfunctions')} panel="malfunctions" onOpen={onOpen}>
        {records ??
          (detail.data!.malfunctions.length ? (
            <ul className="space-y-1 text-sm">
              {detail.data!.malfunctions.map((m) => (
                <li key={m.id} className="flex gap-2">
                  <span
                    className={cn(
                      'shrink-0 text-xs font-medium',
                      m.severity === 'CRITICAL' || m.severity === 'HIGH' ? 'text-bad' : 'text-warn',
                    )}
                  >
                    {t(`severity.${str(m.severity)}` as never)}
                  </span>
                  <span className="truncate">{str(m.description)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty text={t('fleet.detail.noOpen')} />
          ))}
      </Section>
      <Section title={t('vehicle.items.title')} panel="items" onOpen={onOpen}>
        {row.items.length ? (
          <ul className="space-y-1 text-sm">
            {row.items.map((name) => (
              <li key={name} className="truncate">
                {name}
              </li>
            ))}
          </ul>
        ) : (
          <Empty text={t('vehicle.items.empty')} />
        )}
      </Section>
    </div>
  );
}
