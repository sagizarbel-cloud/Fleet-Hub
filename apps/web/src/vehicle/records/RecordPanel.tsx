import { lazy, Suspense, useDeferredValue, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import {
  ArrowDown,
  ArrowUp,
  FileSpreadsheet,
  Loader2,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { hasRole, type RecordKind } from '@fleet-hub/shared';
import { useSession } from '@/auth/session';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import type { VehicleDetail } from '../data';
import { useRecords, useSetDeleted, type RecordFilters, type RecordRow } from './api';
import { AttachmentList } from './Attachments';
import { cellText, useFormatCtx } from './format';
import { createdByCol, KIND_UI, type Column, type FormatCtx } from './kinds';
import { RecordForm } from './RecordForm';
import { useExport } from './useExport';
import { useOfferUndo } from './Undo';

const FuelChart = lazy(() => import('./FuelChart'));

const CONTROL =
  'border-border-strong bg-surface h-8 rounded-md border px-2 text-xs focus-visible:outline-2 focus-visible:outline-[var(--fh-accent)]';

/** Booleans that mean "flag this row" show only when true. */
function BoolCell({ col, row, ctx }: { col: Column; row: RecordRow; ctx: FormatCtx }) {
  const on = col.value(row, ctx) === true;
  if (col.key === 'drop' || col.key === 'isAccident') {
    return on ? (
      <span className="text-warn inline-flex items-center gap-1 text-xs font-medium">
        <TriangleAlert aria-hidden className="size-3.5" />
        {ctx.t(col.key === 'drop' ? 'records.dropFlag' : 'records.accidentFlag')}
      </span>
    ) : null;
  }
  return <>{cellText(col, row, ctx)}</>;
}

function CellView({ col, row, ctx }: { col: Column; row: RecordRow; ctx: FormatCtx }) {
  if (col.kind === 'bool') return <BoolCell col={col} row={row} ctx={ctx} />;
  const text = cellText(col, row, ctx);
  if (!text) return <span className="text-muted">—</span>;
  if (col.kind === 'long') return <span className="line-clamp-2 whitespace-pre-line">{text}</span>;
  return (
    <span className={cn((col.kind === 'number' || col.kind === 'money') && 'num')}>{text}</span>
  );
}

/** One record type's full panel (SPEC 5.3): filters, sortable table, add / edit / delete, files, export. */
export default function RecordPanel({
  kind,
  vehicle,
  reduced,
}: {
  kind: RecordKind;
  vehicle: VehicleDetail;
  reduced: boolean;
}) {
  const { t } = useTranslation();
  const serial = vehicle.serial;
  const ui = KIND_UI[kind];
  const ctx = useFormatCtx(vehicle.usageUnit);
  const { data: user } = useSession();
  const offerUndo = useOfferUndo();
  const [filters, setFilters] = useState<RecordFilters>({});
  const [search, setSearch] = useState('');
  const q = useDeferredValue(search.trim());
  const active = useMemo(() => ({ ...filters, q: q || undefined }), [filters, q]);
  const records = useRecords(serial, kind, active);
  const remove = useSetDeleted(serial, kind);
  const exporter = useExport();
  const [editing, setEditing] = useState<RecordRow | 'new' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isEditor = !!user && hasRole(user.role, 'EDITOR');
  const canAdd = !!user && (isEditor || kind === 'notes');
  const canChange = (row: RecordRow) =>
    isEditor || (kind === 'notes' && !!user && row.createdById === user.id);

  const rows = useMemo(() => records.data?.pages.flatMap((p) => p.items) ?? [], [records.data]);
  const total = records.data?.pages[0]?.total ?? 0;
  const filtered = Object.values(active).some(Boolean);

  const sorting: SortingState = filters.sort
    ? [{ id: filters.sort, desc: (filters.dir ?? 'desc') === 'desc' }]
    : [];
  const setFilter = (key: keyof RecordFilters, value: string | undefined) =>
    setFilters((f) => ({ ...f, [key]: value || undefined }));

  const columns = useMemo<ColumnDef<RecordRow>[]>(
    () => [
      ...ui.columns.map((col): ColumnDef<RecordRow> => ({
        id: col.sort ?? col.key,
        header: () => t(col.header as never),
        enableSorting: !!col.sort,
        cell: ({ row }) => <CellView col={col} row={row.original} ctx={ctx} />,
        meta: col,
      })),
      {
        id: 'files',
        header: () => <span className="sr-only">{t('records.files')}</span>,
        enableSorting: false,
        cell: ({ row }) =>
          row.original.attachments.length ? (
            <AttachmentList
              serial={serial}
              items={row.original.attachments}
              canEdit={false}
              compact
            />
          ) : null,
      },
    ],
    [ui.columns, ctx, t, serial],
  );

  // TanStack Table returns fresh functions each render; this component simply opts out of memoizing.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (r) => r.id,
    manualSorting: true,
    state: { sorting },
    onSortingChange: (updater) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater;
      const s = next[0];
      setFilters((f) => ({ ...f, sort: s?.id, dir: s ? (s.desc ? 'desc' : 'asc') : undefined }));
    },
  });

  const del = (row: RecordRow) =>
    remove.mutate(
      { id: row.id, deleted: true },
      {
        onSuccess: () =>
          offerUndo(t('records.deleted', { record: t(`vehicle.records.one.${kind}`) }), () =>
            remove.mutateAsync({ id: row.id, deleted: false }),
          ),
        onError: () => setNotice('records.error.delete'),
      },
    );

  const doExport = () =>
    exporter.run({
      serial,
      kind,
      vehicle,
      filters: active,
      columns: [...ui.columns, ...(kind === 'notes' ? [] : [createdByCol])],
      ctx,
    });

  const actions = (row: RecordRow) =>
    canChange(row) && (
      <div className="flex justify-end gap-1">
        <button
          type="button"
          onClick={() => setEditing(row)}
          aria-label={t('records.edit')}
          title={t('records.edit')}
          className="text-muted hover:text-text grid size-8 place-items-center rounded-md"
        >
          <Pencil aria-hidden className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => del(row)}
          disabled={remove.isPending}
          aria-label={t('records.delete')}
          title={t('records.delete')}
          className="text-muted hover:text-bad grid size-8 place-items-center rounded-md"
        >
          <Trash2 aria-hidden className="size-4" />
        </button>
      </div>
    );

  return (
    <div className="space-y-3" data-testid={`records-${kind}`}>
      {kind === 'fuel' && (
        <Suspense fallback={<div className="h-48" />}>
          <FuelChart serial={serial} unit={vehicle.usageUnit} />
        </Suspense>
      )}

      <div className="flex flex-wrap items-center gap-2" role="search">
        {ui.searchable && (
          <label className="relative min-w-40 flex-1 sm:max-w-64">
            <span className="sr-only">{t('records.search')}</span>
            <Search aria-hidden className="text-muted absolute start-2 top-2 size-4" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('records.search')}
              className={cn(CONTROL, 'w-full ps-8')}
            />
          </label>
        )}
        <label className="flex items-center gap-1 text-xs">
          <span className="text-muted">{t('records.from')}</span>
          <input
            type="date"
            value={filters.from ?? ''}
            onChange={(e) => setFilter('from', e.target.value)}
            className={cn(CONTROL, 'num')}
          />
        </label>
        <label className="flex items-center gap-1 text-xs">
          <span className="text-muted">{t('records.to')}</span>
          <input
            type="date"
            value={filters.to ?? ''}
            onChange={(e) => setFilter('to', e.target.value)}
            className={cn(CONTROL, 'num')}
          />
        </label>
        {ui.filters.map((f) =>
          f.type === 'select' ? (
            <select
              key={f.key}
              value={filters[f.key] ?? ''}
              onChange={(e) => setFilter(f.key, e.target.value)}
              aria-label={t(f.label as never)}
              className={CONTROL}
            >
              <option value="">{t('records.filterAll', { name: t(f.label as never) })}</option>
              {f.options?.(ctx).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <label key={f.key} className="flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={filters[f.key] === '1'}
                onChange={(e) => setFilter(f.key, e.target.checked ? '1' : undefined)}
                className="accent-[var(--fh-accent)] size-4"
              />
              {t(f.label as never)}
            </label>
          ),
        )}
        <div className="ms-auto flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={doExport}
            disabled={exporter.busy || total === 0}
            data-testid="export"
          >
            {exporter.busy ? (
              <Loader2 aria-hidden className="animate-spin" />
            ) : (
              <FileSpreadsheet aria-hidden />
            )}
            {t('records.export')}
          </Button>
          {canAdd && (
            <Button size="sm" onClick={() => setEditing('new')} data-testid="add-record">
              <Plus aria-hidden />
              {t('records.add')}
            </Button>
          )}
        </div>
      </div>
      {(notice || exporter.error) && (
        <p role="alert" className="text-bad text-xs">
          {t((notice ?? 'records.error.export') as never)}
        </p>
      )}

      {records.isPending ? (
        <Loader2 aria-hidden className="text-muted mx-auto my-8 size-5 animate-spin" />
      ) : records.isError ? (
        <p role="alert" className="text-bad py-6 text-center text-sm">
          {t('records.error.load')}
        </p>
      ) : rows.length === 0 ? (
        <p className="text-muted py-6 text-center text-sm">
          {t(filtered ? 'records.noMatch' : 'vehicle.records.empty')}
        </p>
      ) : (
        <>
          {/* Desktop: a sortable table. */}
          <div className="-mx-1 hidden overflow-x-auto sm:block">
            <table className="w-full text-sm" data-testid="record-table">
              <thead className="text-muted text-xs">
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id} className="border-border border-b">
                    {hg.headers.map((h) => {
                      const col = h.column.columnDef.meta as Column | undefined;
                      const sorted = h.column.getIsSorted();
                      const numeric = col?.kind === 'number' || col?.kind === 'money';
                      return (
                        <th
                          key={h.id}
                          scope="col"
                          aria-sort={
                            sorted === 'asc'
                              ? 'ascending'
                              : sorted === 'desc'
                                ? 'descending'
                                : undefined
                          }
                          className={cn(
                            'px-1.5 py-2 font-medium',
                            numeric ? 'text-end' : 'text-start',
                          )}
                        >
                          {h.column.getCanSort() ? (
                            <button
                              type="button"
                              onClick={h.column.getToggleSortingHandler()}
                              className="hover:text-text inline-flex items-center gap-1"
                            >
                              {flexRender(h.column.columnDef.header, h.getContext())}
                              {sorted === 'asc' && <ArrowUp aria-hidden className="size-3" />}
                              {sorted === 'desc' && <ArrowDown aria-hidden className="size-3" />}
                            </button>
                          ) : (
                            flexRender(h.column.columnDef.header, h.getContext())
                          )}
                        </th>
                      );
                    })}
                    <th className="w-20 px-1.5 py-2">
                      <span className="sr-only">{t('records.actions')}</span>
                    </th>
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-border hover:bg-border/40 border-b align-top last:border-0"
                    data-row={r.id}
                  >
                    {r.getVisibleCells().map((c) => {
                      const col = c.column.columnDef.meta as Column | undefined;
                      const numeric = col?.kind === 'number' || col?.kind === 'money';
                      return (
                        <td
                          key={c.id}
                          className={cn(
                            'px-1.5 py-2',
                            numeric && 'text-end',
                            col?.kind === 'long' && 'min-w-48 max-w-96',
                          )}
                        >
                          {flexRender(c.column.columnDef.cell, c.getContext())}
                        </td>
                      );
                    })}
                    <td className="px-1.5 py-1">{actions(r.original)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Phones: one card per record, main values only. */}
          <ul className="space-y-2 sm:hidden" data-testid="record-cards-list">
            {rows.map((row) => (
              <li key={row.id} className="border-border rounded-lg border p-3" data-row={row.id}>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                  {ui.columns
                    .filter((c) => !c.minor)
                    .map((col) => (
                      <div key={col.key} className={cn(col.kind === 'long' && 'col-span-2')}>
                        <dt className="text-muted text-xs">{t(col.header as never)}</dt>
                        <dd>
                          <CellView col={col} row={row} ctx={ctx} />
                        </dd>
                      </div>
                    ))}
                </dl>
                <div className="mt-2 flex items-center gap-2">
                  {row.attachments.length > 0 && (
                    <span className="text-muted inline-flex items-center gap-1 text-xs">
                      <Paperclip aria-hidden className="size-3.5" />
                      <span className="num">{row.attachments.length}</span>
                    </span>
                  )}
                  <div className="ms-auto">{actions(row)}</div>
                </div>
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-muted" data-testid="record-total">
              {t('records.showing', { shown: rows.length, total })}
            </span>
            {records.hasNextPage && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => records.fetchNextPage()}
                disabled={records.isFetchingNextPage}
              >
                {t('records.more')}
              </Button>
            )}
          </div>
        </>
      )}

      {editing && (
        <RecordForm
          serial={serial}
          kind={kind}
          unit={vehicle.usageUnit}
          location={vehicle.location}
          row={editing === 'new' ? undefined : editing}
          canEdit={editing === 'new' || canChange(editing)}
          reduced={reduced}
          onClose={() => setEditing(null)}
          onSaved={() => setEditing(null)}
        />
      )}
    </div>
  );
}
