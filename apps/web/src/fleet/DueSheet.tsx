import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, ChevronRight, Loader2 } from 'lucide-react';
import { ResizableSheet } from '@/components/ResizableSheet';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useDateFormat } from './FleetGrid';

type DueKind = 'service' | 'annualTest' | 'insurance';
interface DueItem {
  serial: string;
  make: string;
  model: string;
  kind: DueKind;
  date: string;
}

/** A vehicle's due items, soonest first; the list keeps the soonest vehicle on top. */
function byVehicle(items: DueItem[]) {
  const map = new Map<string, DueItem[]>();
  for (const d of items) map.set(d.serial, [...(map.get(d.serial) ?? []), d]);
  return [...map.values()];
}

/**
 * Services, annual tests and insurance due within 30 days, overdue included, from the
 * dashboard's "Due within 30 days" box (Revisions 1). Picking a vehicle opens its page.
 */
export default function DueSheet({ onClose, reduced }: { onClose: () => void; reduced: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const formatDate = useDateFormat();
  const list = useQuery({
    queryKey: ['dashboard', 'due'],
    queryFn: () => api<DueItem[]>('/dashboard/due'),
  });
  const today = new Date().setHours(0, 0, 0, 0);

  return (
    <ResizableSheet
      title={t('dashboard.dueList.title')}
      onClose={onClose}
      reduced={reduced}
      testId="due-sheet"
    >
      {list.isPending ? (
        <Loader2 aria-hidden className="text-muted mx-auto my-8 size-5 animate-spin" />
      ) : list.isError ? (
        <p role="alert" className="text-bad py-6 text-center text-sm">
          {t('records.error.load')}
        </p>
      ) : list.data.length === 0 ? (
        <p className="text-muted py-6 text-center text-sm">{t('dashboard.dueList.none')}</p>
      ) : (
        <ul className="space-y-2" data-testid="due-list">
          {byVehicle(list.data).map((items) => {
            const v = items[0]!;
            return (
              <li key={v.serial}>
                <button
                  type="button"
                  onClick={() =>
                    navigate(
                      `/vehicles/${encodeURIComponent(v.serial)}${items.every((d) => d.kind === 'service') ? '?panel=service' : ''}`,
                      { state: { fromDashboard: true } },
                    )
                  }
                  className="border-border hover:border-border-strong hover:bg-border/40 flex w-full items-start gap-3 rounded-lg border p-3 text-start"
                >
                  <CalendarClock aria-hidden className="text-muted mt-0.5 size-4 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="num border-border-strong shrink-0 rounded-md border px-1.5 py-px text-xs">
                        <bdi dir="ltr">{v.serial}</bdi>
                      </span>
                      <bdi className="truncate text-sm">
                        {v.make} {v.model}
                      </bdi>
                    </span>
                    <span className="mt-1.5 flex flex-wrap gap-1.5">
                      {items.map((d) => {
                        const overdue = new Date(d.date).getTime() < today;
                        return (
                          <span
                            key={d.kind}
                            data-kind={d.kind}
                            className={cn(
                              'rounded-full border px-2 py-0.5 text-xs',
                              overdue ? 'border-bad/50 text-bad' : 'border-warn/50 text-warn',
                            )}
                          >
                            {t(`dashboard.dueList.kind.${d.kind}`)} ·{' '}
                            <span className="num">{formatDate(d.date)}</span>
                            {overdue && <> · {t('dashboard.dueList.overdue')}</>}
                          </span>
                        );
                      })}
                    </span>
                  </span>
                  <ChevronRight aria-hidden className="text-muted mt-0.5 size-4 rtl:-scale-x-100" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </ResizableSheet>
  );
}
