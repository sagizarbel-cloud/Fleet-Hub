import { useEffect, useMemo, useState, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Check,
  FileSpreadsheet,
  FileText,
  Link2,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { hasRole, RECEIPT_STATES } from '@fleet-hub/shared';
import { useSession } from '@/auth/session';
import { Button } from '@/components/ui/button';
import { lookupName, useDashboard, useLookups } from '@/fleet/data';
import { cn } from '@/lib/cn';
import { prefersReducedMotion } from '@/lib/motion';
import { attachmentUrl, type RecordRow } from '@/vehicle/records/api';
import { AttachmentList } from '@/vehicle/records/Attachments';
import { useFormatCtx } from '@/vehicle/records/format';
import { localDay, type Column } from '@/vehicle/records/kinds';
import { UndoProvider, useOfferUndo } from '@/vehicle/records/Undo';
import {
  fetchAllReceipts,
  useReceiptAction,
  useReceipts,
  type Receipt,
  type ReceiptFilters,
} from './api';
import { hasFiles } from './drag';
import { ReceiptForm } from './ReceiptForm';
import {
  Badge,
  CONTROL,
  FilterSelect,
  monthLabel,
  PageHeader,
  SearchBox,
  useFilters,
  useViewMode,
  ViewToggle,
} from './ui';
import { VehicleTagChip } from './VehiclePicker';

const TABLE_KEYS = ['date', 'vehicles', 'vendor', 'category', 'amount'] as const;
const FILTER_KEYS = ['vehicle', 'category', 'state', 'from', 'to', 'min', 'max', 'q'] as const;

const str = (v: unknown) => (typeof v === 'string' ? v : null);
const num = (v: unknown) => (typeof v === 'number' ? v : null);

/** Excel columns for receipts; vehicles as their serials. */
const COLUMNS: Column[] = [
  { key: 'date', header: 'records.col.date', kind: 'date', value: (r) => new Date(String(r.date)) },
  {
    key: 'vehicles',
    header: 'receipts.vehicles',
    kind: 'text',
    value: (r) => (r.vehicles as Receipt['vehicles']).map((v) => v.serial).join(', '),
  },
  {
    key: 'kind',
    header: 'records.col.documentKind',
    kind: 'text',
    value: (r) => str(r.kind),
    text: (r, ctx) => ctx.t(`records.documentKind.${str(r.kind) ?? 'OTHER'}` as never),
  },
  {
    key: 'category',
    header: 'records.col.category',
    kind: 'text',
    value: (r, ctx) =>
      lookupName(
        ctx.lookups?.receiptCategories.find((c) => c.code === r.category),
        ctx.lang,
      ) ?? str(r.category),
  },
  { key: 'vendor', header: 'records.col.vendor', kind: 'text', value: (r) => str(r.vendor) },
  {
    key: 'amount',
    header: 'records.col.amount',
    kind: 'money',
    value: (r) => num(r.amount),
    numFmt: '#,##0.00 "₪"',
  },
  {
    key: 'state',
    header: 'receipts.state',
    kind: 'text',
    value: (r) => str(r.state),
    text: (r, ctx) => ctx.t(`receipts.states.${str(r.state) ?? 'approved'}` as never),
  },
  {
    key: 'createdBy',
    header: 'records.col.createdBy',
    kind: 'text',
    value: (r) => str(r.createdBy),
  },
  { key: 'notes', header: 'records.col.notes', kind: 'long', value: (r) => str(r.notes) },
];

/** Files dragged in from the computer (not text or links). */
function ReceiptActions({
  r,
  canReview,
  onEdit,
}: {
  r: Receipt;
  canReview: boolean;
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  const act = useReceiptAction();
  const offerUndo = useOfferUndo();
  const btn =
    'text-muted hover:text-text grid size-8 place-items-center rounded-md hover:bg-border/60 disabled:opacity-50';
  return (
    <div className="flex items-center gap-0.5">
      {canReview && r.state === 'suggested' && (
        <>
          <button
            type="button"
            className={cn(btn, 'text-ok hover:text-ok')}
            disabled={act.isPending}
            onClick={() => act.mutate({ id: r.id, action: 'approve' })}
            aria-label={t('receipts.approve')}
            title={t('receipts.approve')}
            data-testid="receipt-approve"
          >
            <Check aria-hidden className="size-4" />
          </button>
          <button
            type="button"
            className={cn(btn, 'text-bad hover:text-bad')}
            disabled={act.isPending}
            onClick={() => act.mutate({ id: r.id, action: 'reject' })}
            aria-label={t('receipts.reject')}
            title={t('receipts.reject')}
          >
            <X aria-hidden className="size-4" />
          </button>
        </>
      )}
      {r.canEdit && (
        <>
          <button
            type="button"
            className={btn}
            onClick={onEdit}
            aria-label={t('records.edit')}
            title={t('records.edit')}
            data-testid="receipt-edit"
          >
            <Pencil aria-hidden className="size-4" />
          </button>
          <button
            type="button"
            className={cn(btn, 'hover:text-bad')}
            disabled={act.isPending}
            onClick={() =>
              // The card leaves the list on success, so the Undo offer can't wait for a callback on it.
              void act
                .mutateAsync({ id: r.id, action: 'delete' })
                .then(() =>
                  offerUndo(t('records.deleted', { record: t('receipts.one') }), () =>
                    act.mutateAsync({ id: r.id, action: 'restore' }),
                  ),
                )
                .catch(() => undefined)
            }
            aria-label={t('records.delete')}
            title={t('records.delete')}
            data-testid="receipt-delete"
          >
            <Trash2 aria-hidden className="size-4" />
          </button>
        </>
      )}
    </div>
  );
}

function StateBadge({ r }: { r: Receipt }) {
  const { t } = useTranslation();
  return r.state === 'suggested' ? (
    <Badge tone="warn" testId="suggested-badge">
      {t('receipts.states.suggested')}
    </Badge>
  ) : null;
}

function Card({ r, canReview, onEdit }: { r: Receipt; canReview: boolean; onEdit: () => void }) {
  const { t, i18n } = useTranslation();
  const ctx = useFormatCtx('KM');
  const { data: lookups } = useLookups();
  const first = r.attachments[0];
  const category = lookupName(
    lookups?.receiptCategories.find((c) => c.code === r.category),
    i18n.language,
  );
  return (
    <li
      className={cn(
        'border-border bg-surface flex flex-col overflow-hidden rounded-xl border',
        r.state === 'suggested' && 'border-warn/60 border-dashed',
      )}
      data-testid="receipt-card"
    >
      <a
        href={first ? attachmentUrl(first) : undefined}
        target="_blank"
        rel="noreferrer"
        className="bg-border/30 grid aspect-[4/3] place-items-center overflow-hidden"
        aria-label={first ? first.fileName : t('receipts.noFile')}
      >
        {first?.hasThumb ? (
          <img
            src={attachmentUrl(first, 'thumb')}
            alt=""
            loading="lazy"
            className="size-full object-cover"
          />
        ) : (
          <FileText aria-hidden className="text-muted size-8" />
        )}
      </a>
      <div className="flex flex-1 flex-col gap-1.5 p-2.5">
        <div className="flex items-baseline gap-2">
          <span className="num me-auto text-base font-semibold">
            {r.amount === null ? '—' : ctx.money(r.amount)}
          </span>
          <StateBadge r={r} />
        </div>
        <p className="truncate text-sm">{r.vendor ?? t('receipts.noVendor')}</p>
        <p className="text-muted flex flex-wrap items-center gap-x-2 text-xs">
          <span className="num">{ctx.date(r.date)}</span>
          {category && <span>{category}</span>}
          {r.linked && (
            <span className="inline-flex items-center gap-0.5">
              <Link2 aria-hidden className="size-3" />
              {t(`vehicle.records.one.${r.linked.kind}`)}
            </span>
          )}
        </p>
        <div className="flex flex-wrap gap-1">
          {r.vehicles.map((v) => (
            <VehicleTagChip key={v.serial} serial={v.serial} type={v.type} />
          ))}
        </div>
        <div className="mt-auto flex items-center justify-between pt-1">
          <span className="text-muted text-[0.7rem]">
            {r.attachments.length > 1 && t('receipts.pages', { count: r.attachments.length })}
          </span>
          <ReceiptActions r={r} canReview={canReview} onEdit={onEdit} />
        </div>
      </div>
    </li>
  );
}

function Table({
  items,
  canReview,
  onEdit,
}: {
  items: Receipt[];
  canReview: boolean;
  onEdit: (r: Receipt) => void;
}) {
  const { t } = useTranslation();
  const ctx = useFormatCtx('KM');
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full min-w-[44rem] text-sm" data-testid="receipts-table">
        <thead className="text-muted text-xs">
          <tr className="border-border border-b">
            {TABLE_KEYS.map((k) => (
              <th
                key={k}
                scope="col"
                className={cn(
                  'px-1.5 py-2 font-medium',
                  k === 'amount' ? 'text-end' : 'text-start',
                )}
              >
                {t(COLUMNS.find((c) => c.key === k)!.header as never)}
              </th>
            ))}
            <th scope="col" className="px-1.5 py-2 text-start font-medium">
              {t('records.files')}
            </th>
            <th className="px-1.5 py-2">
              <span className="sr-only">{t('records.actions')}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((r) => {
            const row = r as unknown as RecordRow;
            return (
              <tr
                key={r.id}
                className="border-border border-b last:border-0"
                data-testid="receipt-row"
              >
                <td className="num px-1.5 py-2">{ctx.date(r.date)}</td>
                <td className="px-1.5 py-2">
                  <span className="flex flex-wrap gap-1">
                    {r.vehicles.map((v) => (
                      <bdi key={v.serial} dir="ltr" className="num">
                        {v.serial}
                      </bdi>
                    ))}
                  </span>
                </td>
                <td className="px-1.5 py-2">
                  <span className="flex items-center gap-2">
                    {r.vendor ?? <span className="text-muted">—</span>}
                    <StateBadge r={r} />
                  </span>
                </td>
                <td className="px-1.5 py-2">{COLUMNS[3]!.value(row, ctx) as string}</td>
                <td className="num px-1.5 py-2 text-end">
                  {r.amount === null ? '—' : ctx.money(r.amount)}
                </td>
                <td className="px-1.5 py-1">
                  <AttachmentList serial="" items={r.attachments} canEdit={false} compact />
                </td>
                <td className="px-1.5 py-1">
                  <ReceiptActions r={r} canReview={canReview} onEdit={() => onEdit(r)} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Totals({
  totals,
  vehicleScoped,
}: {
  totals: NonNullable<ReturnType<typeof useReceipts>['data']>['pages'][0]['totals'];
  vehicleScoped: boolean;
}) {
  const { t, i18n } = useTranslation();
  const ctx = useFormatCtx('KM');
  const months = totals.byMonth.slice(-12);
  const top = Math.max(1, ...months.map((m) => m.amount));
  return (
    <section
      aria-label={t('receipts.totals')}
      className="border-border grid gap-4 rounded-xl border p-3 sm:grid-cols-[auto_1fr_1fr]"
      data-testid="receipt-totals"
    >
      <div>
        <p className="text-muted text-xs">{t('receipts.total')}</p>
        <p className="num text-2xl font-semibold" data-testid="receipt-sum">
          {ctx.money(totals.sum)}
        </p>
        <p className="text-muted text-xs">{t('receipts.count', { count: totals.count })}</p>
      </div>
      {!vehicleScoped && (
        <div className="min-w-0">
          <p className="text-muted mb-1 text-xs">{t('receipts.byVehicle')}</p>
          <ol className="space-y-0.5 text-xs">
            {totals.byVehicle.slice(0, 5).map((v) => (
              <li key={v.serial} className="flex justify-between gap-2">
                <bdi dir="ltr" className="num">
                  {v.serial}
                </bdi>
                <span className="num">{ctx.money(v.amount)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      <div className={cn('min-w-0', vehicleScoped && 'sm:col-span-2')}>
        <p className="text-muted mb-1 text-xs">{t('receipts.byMonth')}</p>
        <ol className="space-y-0.5 text-xs">
          {months.map((m) => (
            <li key={m.month} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-2">
              <span>{monthLabel(m.month, i18n.language)}</span>
              <span className="bg-border/60 block h-1.5 overflow-hidden rounded-full">
                <span
                  className="bg-accent block h-full rounded-full"
                  style={{ width: `${(m.amount / top) * 100}%` }}
                />
              </span>
              <span className="num text-end">{ctx.money(m.amount)}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/**
 * The receipts list with filters, totals, grid or table, and export. On the Receipts page the
 * filters live in the URL; on a vehicle's Documents tab it is scoped to that vehicle.
 */
export function ReceiptsView({ vehicle }: { vehicle?: string }) {
  const { t, i18n } = useTranslation();
  const { data: user } = useSession();
  const { data: lookups } = useLookups();
  const { data: dash } = useDashboard();
  const ctx = useFormatCtx('KM');
  const [reduced] = useState(prefersReducedMotion);
  const [filters, setFilters] = useFilters<ReceiptFilters>(FILTER_KEYS, !vehicle);
  const scoped = useMemo(
    () => ({ ...filters, ...(vehicle ? { vehicle } : {}) }),
    [filters, vehicle],
  );
  const list = useReceipts(scoped);
  const [mode, setMode] = useViewMode('receipts');
  const [editing, setEditing] = useState<Receipt | 'new' | null>(null);
  const [dropped, setDropped] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const canReview = !!user && hasRole(user.role, 'EDITOR');
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const first = list.data?.pages[0];

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 5000);
    return () => clearTimeout(timer);
  }, [message]);

  const exportList = async () => {
    setExporting(true);
    try {
      const [{ downloadWorkbook }, rows] = await Promise.all([
        import('@/vehicle/records/exportXlsx'),
        fetchAllReceipts(scoped),
      ]);
      const today = new Date();
      await downloadWorkbook({
        title: t('nav.receipts'),
        lines: [
          ...(vehicle ? [vehicle] : []),
          t('records.exportedOn', { date: ctx.date(today.toISOString()) }),
        ],
        columns: COLUMNS,
        rows: rows as unknown as RecordRow[],
        ctx,
        fileName: `receipts ${vehicle ? `${vehicle} ` : ''}${localDay(today)}.xlsx`,
      });
    } finally {
      setExporting(false);
    }
  };

  const onDrop = (e: DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    setDragOver(false);
    setDropped(Array.from(e.dataTransfer.files));
    setEditing('new');
  };

  return (
    <UndoProvider reduced={reduced}>
      <div
        className={cn(
          'relative space-y-3',
          dragOver && 'outline-accent rounded-xl outline-2 outline-dashed',
        )}
        onDragOver={(e) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false);
        }}
        onDrop={onDrop}
        data-testid="receipts-view"
      >
        <div className="flex flex-wrap items-center gap-2">
          <SearchBox
            label={t('receipts.search')}
            value={filters.q ?? ''}
            onChange={(q) => setFilters({ q })}
            testId="receipt-search"
          />
          {!vehicle && (
            <FilterSelect
              label={t('receipts.vehicle')}
              value={filters.vehicle ?? ''}
              onChange={(v) => setFilters({ vehicle: v })}
              options={(dash?.tiles ?? []).map((v) => ({ value: v.serial, label: v.serial }))}
              testId="receipt-filter-vehicle"
            />
          )}
          <FilterSelect
            label={t('records.col.category')}
            value={filters.category ?? ''}
            onChange={(v) => setFilters({ category: v })}
            options={(lookups?.receiptCategories ?? []).map((c) => ({
              value: c.code,
              label: lookupName(c, i18n.language) ?? c.code,
            }))}
            testId="receipt-filter-category"
          />
          <FilterSelect
            label={t('receipts.state')}
            value={filters.state ?? ''}
            onChange={(v) => setFilters({ state: v })}
            options={RECEIPT_STATES.map((s) => ({ value: s, label: t(`receipts.states.${s}`) }))}
            testId="receipt-filter-state"
          />
          <label className="flex items-center gap-1 text-xs">
            <span className="text-muted">{t('records.from')}</span>
            <input
              type="date"
              className={cn(CONTROL, 'num')}
              value={filters.from ?? ''}
              onChange={(e) => setFilters({ from: e.target.value })}
            />
          </label>
          <label className="flex items-center gap-1 text-xs">
            <span className="text-muted">{t('records.to')}</span>
            <input
              type="date"
              className={cn(CONTROL, 'num')}
              value={filters.to ?? ''}
              onChange={(e) => setFilters({ to: e.target.value })}
            />
          </label>
          <label className="flex items-center gap-1 text-xs">
            <span className="text-muted">{t('receipts.min')}</span>
            <input
              type="number"
              min={0}
              inputMode="decimal"
              className={cn(CONTROL, 'num w-20')}
              value={filters.min ?? ''}
              onChange={(e) => setFilters({ min: e.target.value })}
            />
          </label>
          <label className="flex items-center gap-1 text-xs">
            <span className="text-muted">{t('receipts.max')}</span>
            <input
              type="number"
              min={0}
              inputMode="decimal"
              className={cn(CONTROL, 'num w-20')}
              value={filters.max ?? ''}
              onChange={(e) => setFilters({ max: e.target.value })}
            />
          </label>
          <div className="ms-auto flex items-center gap-2">
            <ViewToggle mode={mode} onChange={setMode} />
            <Button
              variant="outline"
              size="sm"
              disabled={exporting || items.length === 0}
              onClick={() => void exportList()}
              data-testid="export"
            >
              {exporting ? (
                <Loader2 aria-hidden className="animate-spin" />
              ) : (
                <FileSpreadsheet aria-hidden />
              )}
              {t('records.export')}
            </Button>
            <Button size="sm" onClick={() => setEditing('new')} data-testid="receipt-add">
              <Plus aria-hidden />
              {t('receipts.add')}
            </Button>
          </div>
        </div>

        {canReview && !!first?.suggested && filters.state !== 'suggested' && (
          <button
            type="button"
            onClick={() => setFilters({ state: 'suggested' })}
            className="bg-warn/10 text-warn w-full rounded-lg px-3 py-2 text-start text-sm"
            data-testid="suggested-banner"
          >
            {t('receipts.waiting', { count: first.suggested })}
          </button>
        )}
        {message && (
          <p role="status" className="bg-ok/10 text-ok rounded-lg px-3 py-2 text-sm">
            {message}
          </p>
        )}

        {first && <Totals totals={first.totals} vehicleScoped={!!vehicle} />}

        {list.isPending ? (
          <Loader2 aria-hidden className="text-muted mx-auto my-8 size-5 animate-spin" />
        ) : list.isError ? (
          <p role="alert" className="text-bad py-6 text-center text-sm">
            {t('records.error.load')}
          </p>
        ) : items.length === 0 ? (
          <div className="text-muted flex flex-col items-center gap-2 py-10 text-center text-sm">
            <Upload aria-hidden className="size-6" />
            <p>{t('receipts.empty')}</p>
          </div>
        ) : mode === 'grid' ? (
          <ul
            className="grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-3"
            data-testid="receipts-grid"
          >
            {items.map((r) => (
              <Card key={r.id} r={r} canReview={canReview} onEdit={() => setEditing(r)} />
            ))}
          </ul>
        ) : (
          <Table items={items} canReview={canReview} onEdit={setEditing} />
        )}
        {list.hasNextPage && (
          <div className="flex justify-center">
            <Button variant="outline" size="sm" onClick={() => void list.fetchNextPage()}>
              {t('records.more')}
            </Button>
          </div>
        )}
        {first && items.length > 0 && (
          <p className="text-muted text-center text-xs">
            {t('records.showing', { shown: items.length, total: first.total })}
          </p>
        )}
        {dragOver && (
          <div className="bg-surface/80 pointer-events-none absolute inset-0 grid place-items-center rounded-xl text-sm font-medium">
            {t('receipts.dropHere')}
          </div>
        )}
      </div>
      {editing && (
        <ReceiptForm
          receipt={editing === 'new' ? undefined : editing}
          vehicles={vehicle ? [vehicle] : filters.vehicle ? [filters.vehicle] : []}
          files={editing === 'new' ? dropped : []}
          reduced={reduced}
          onClose={() => {
            setEditing(null);
            setDropped([]);
          }}
          onSaved={setMessage}
        />
      )}
    </UndoProvider>
  );
}

export function ReceiptsPage() {
  const { t } = useTranslation();
  const title = t('nav.receipts');
  useEffect(() => {
    document.title = `${title} · ${t('app.name')}`;
  }, [title, t]);
  return (
    <section aria-labelledby="area-title" className="glass space-y-4 p-3 sm:p-5">
      <PageHeader title={title} />
      <ReceiptsView />
    </section>
  );
}
