import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Loader2, TriangleAlert } from 'lucide-react';
import type { MalfunctionSeverity, MalfunctionState } from '@fleet-hub/shared';
import { ResizableSheet } from '@/components/ResizableSheet';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { recordParam } from '@/vehicle/records/recordLink';
import { useDateFormat } from './FleetGrid';

interface OpenMalfunction {
  id: string;
  serial: string;
  reportedAt: string;
  severity: MalfunctionSeverity;
  state: MalfunctionState;
  isAccident: boolean;
  description: string;
}

/**
 * The fleet's open malfunctions, from the dashboard's "Open malfunctions" box (Revisions 1).
 * Picking one opens its report on that vehicle's page.
 */
export default function OpenMalfunctionsSheet({
  onClose,
  reduced,
}: {
  onClose: () => void;
  reduced: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const formatDate = useDateFormat();
  const list = useQuery({
    queryKey: ['open-malfunctions'],
    queryFn: () => api<OpenMalfunction[]>('/dashboard/open-malfunctions'),
  });
  const severity = (s: MalfunctionSeverity) => {
    const text = t(`severity.${s}`);
    return text.charAt(0).toLocaleUpperCase() + text.slice(1);
  };

  return (
    <ResizableSheet
      title={t('report.fleetOpenTitle')}
      onClose={onClose}
      reduced={reduced}
      testId="open-malfunctions-sheet"
    >
      {list.isPending ? (
        <Loader2 aria-hidden className="text-muted mx-auto my-8 size-5 animate-spin" />
      ) : list.isError ? (
        <p role="alert" className="text-bad py-6 text-center text-sm">
          {t('records.error.load')}
        </p>
      ) : list.data.length === 0 ? (
        <p className="text-muted py-6 text-center text-sm">{t('report.noneOpen')}</p>
      ) : (
        <ul className="space-y-2" data-testid="open-malfunctions">
          {list.data.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() =>
                  navigate(
                    `/vehicles/${encodeURIComponent(m.serial)}?record=${encodeURIComponent(recordParam('malfunctions', m.id))}`,
                    { state: { fromDashboard: true } },
                  )
                }
                className="border-border hover:border-border-strong hover:bg-border/40 flex w-full items-start gap-3 rounded-lg border p-3 text-start"
              >
                <TriangleAlert
                  aria-hidden
                  className={cn(
                    'mt-0.5 size-4 shrink-0',
                    m.severity === 'CRITICAL' ? 'text-bad' : 'text-warn',
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="num border-border-strong shrink-0 rounded-md border px-1.5 py-px text-xs">
                      <bdi dir="ltr">{m.serial}</bdi>
                    </span>
                    <bdi className="truncate text-sm">{m.description}</bdi>
                  </span>
                  <span className="text-muted mt-1 block text-xs">
                    {formatDate(m.reportedAt)} · {severity(m.severity)} ·{' '}
                    {t(`malfunctionState.${m.state}`)}
                    {m.isAccident && <> · {t('records.accidentFlag')}</>}
                  </span>
                </span>
                <ChevronRight aria-hidden className="text-muted mt-0.5 size-4 rtl:-scale-x-100" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </ResizableSheet>
  );
}
