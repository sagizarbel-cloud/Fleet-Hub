import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Loader2 } from 'lucide-react';
import { ResizableSheet } from '@/components/ResizableSheet';
import { api } from '@/lib/api';
import { formatMoney } from './events';
import { useDateFormat } from './FleetGrid';

const BOX = 'border-border flex w-full items-start gap-3 rounded-lg border p-3 text-start';

interface SpendReceipt {
  id: string;
  date: string;
  vendor: string | null;
  category: { nameEn: string; nameHe: string } | null;
  amount: number;
  share: number;
  vehicles: number;
}
interface SpendGroup {
  serial: string | null;
  make: string | null;
  model: string | null;
  total: number;
  receipts: SpendReceipt[];
}

/**
 * This month's receipts by vehicle, biggest spend first, from the dashboard's "Spent this month"
 * box (Revisions 1). A receipt for several vehicles counts an even share on each.
 */
export default function SpendSheet({
  onClose,
  reduced,
}: {
  onClose: () => void;
  reduced: boolean;
}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const formatDate = useDateFormat();
  const lang = i18n.language;
  const money = (n: number) => <bdi className="num">{formatMoney(n, lang)}</bdi>;
  const list = useQuery({
    queryKey: ['dashboard', 'spend'],
    queryFn: () => api<{ total: number; vehicles: SpendGroup[] }>('/dashboard/spend'),
  });

  return (
    <ResizableSheet
      title={t('dashboard.spendList.title')}
      onClose={onClose}
      reduced={reduced}
      testId="spend-sheet"
    >
      {list.isPending ? (
        <Loader2 aria-hidden className="text-muted mx-auto my-8 size-5 animate-spin" />
      ) : list.isError ? (
        <p role="alert" className="text-bad py-6 text-center text-sm">
          {t('records.error.load')}
        </p>
      ) : list.data.vehicles.length === 0 ? (
        <p className="text-muted py-6 text-center text-sm">{t('dashboard.spendList.none')}</p>
      ) : (
        <>
          <p className="text-muted mb-3 text-sm">
            {t('dashboard.spendList.total')}:{' '}
            <span className="text-text font-semibold">{money(list.data.total)}</span>
          </p>
          <ul className="space-y-2" data-testid="spend-list">
            {list.data.vehicles.map((g) => {
              const body = (
                <>
                  <span className="flex items-center gap-2">
                    {g.serial ? (
                      <>
                        <span className="num border-border-strong shrink-0 rounded-md border px-1.5 py-px text-xs">
                          <bdi dir="ltr">{g.serial}</bdi>
                        </span>
                        <bdi className="truncate text-sm">
                          {g.make} {g.model}
                        </bdi>
                      </>
                    ) : (
                      <span className="text-muted text-sm">
                        {t('dashboard.spendList.noVehicle')}
                      </span>
                    )}
                    <span className="ms-auto shrink-0 text-sm font-semibold">{money(g.total)}</span>
                  </span>
                  <ul className="text-muted mt-1.5 space-y-0.5 text-xs">
                    {g.receipts.map((r) => (
                      <li key={r.id} className="flex gap-2">
                        <span className="num shrink-0">{formatDate(r.date)}</span>
                        <bdi className="min-w-0 flex-1 truncate">
                          {[
                            r.category && (lang === 'he' ? r.category.nameHe : r.category.nameEn),
                            r.vendor,
                          ]
                            .filter(Boolean)
                            .join(' · ') || t('dashboard.notSet')}
                          {r.vehicles > 1 && (
                            <> · {t('dashboard.spendList.shared', { count: r.vehicles })}</>
                          )}
                        </bdi>
                        <span className="shrink-0">{money(r.share)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              );
              return (
                <li key={g.serial ?? ''}>
                  {g.serial ? (
                    <button
                      type="button"
                      onClick={() =>
                        navigate(`/vehicles/${encodeURIComponent(g.serial!)}`, {
                          state: { fromDashboard: true },
                        })
                      }
                      className={`${BOX} hover:border-border-strong hover:bg-border/40`}
                    >
                      <span className="min-w-0 flex-1">{body}</span>
                      <ChevronRight
                        aria-hidden
                        className="text-muted mt-0.5 size-4 rtl:-scale-x-100"
                      />
                    </button>
                  ) : (
                    <div className={BOX}>
                      <span className="min-w-0 flex-1">{body}</span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </ResizableSheet>
  );
}
