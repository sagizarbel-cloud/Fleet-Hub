import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  Columns2,
  FileSpreadsheet,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Trash2,
  Users,
} from 'lucide-react';
import {
  canSetQuoteStatus,
  QUOTE_NEXT,
  QUOTE_STATUSES,
  QUOTE_VISIBILITIES,
  type QuoteStatus,
  type QuoteVisibility,
} from '@fleet-hub/shared';
import { useSession } from '@/auth/session';
import { Sheet } from '@/components/Sheet';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { prefersReducedMotion } from '@/lib/motion';
import type { RecordRow } from '@/vehicle/records/api';
import { AttachmentList } from '@/vehicle/records/Attachments';
import { useFormatCtx } from '@/vehicle/records/format';
import { localDay, type Column, type FormatCtx } from '@/vehicle/records/kinds';
import { UndoProvider, useOfferUndo } from '@/vehicle/records/Undo';
import {
  fetchAllQuotes,
  useParts,
  usePartComparison,
  useQuote,
  useQuoteAction,
  useQuoteComparison,
  useQuotes,
  useSuppliers,
  type CompareLine,
  type Quote,
  type QuoteFilters,
} from './api';
import { QuoteForm } from './QuoteForm';
import { Badge, CONTROL, FilterSelect, PageHeader, SearchBox, useFilters } from './ui';
import { VehiclePicker, VehicleTagChip } from './VehiclePicker';

const FILTER_KEYS = ['status', 'supplier', 'vehicle', 'visibility', 'from', 'to', 'q'] as const;

const STATUS_TONE: Record<QuoteStatus, 'muted' | 'accent' | 'ok' | 'bad'> = {
  REQUESTED: 'muted',
  RECEIVED: 'accent',
  APPROVED: 'ok',
  ORDERED: 'ok',
  REJECTED: 'bad',
};

export function StatusBadgeQ({ status }: { status: QuoteStatus }) {
  const { t } = useTranslation();
  return <Badge tone={STATUS_TONE[status]}>{t(`records.quoteStatus.${status}`)}</Badge>;
}

export function VisibilityBadge({ level }: { level: QuoteVisibility }) {
  const { t } = useTranslation();
  const Icon = level === 'ADMINS' ? Lock : level === 'PUBLIC' ? Users : null;
  return (
    <span
      className="text-muted inline-flex items-center gap-1 text-[0.7rem]"
      title={t(`quotes.levelHint.${level}`)}
      data-testid="visibility-badge"
    >
      {Icon && <Icon aria-hidden className="size-3" />}
      {t(`quotes.levels.${level}`)}
    </span>
  );
}

const str = (v: unknown) => (typeof v === 'string' ? v : null);
const num = (v: unknown) => (typeof v === 'number' ? v : null);
const day = (v: unknown) => (typeof v === 'string' ? new Date(v) : null);

/** Excel: one row per quote, and one per line on its own sheet. */
const QUOTE_COLUMNS: Column[] = [
  { key: 'date', header: 'records.col.date', kind: 'date', value: (r) => day(r.date) },
  {
    key: 'supplier',
    header: 'records.col.supplier',
    kind: 'text',
    value: (r) => (r.supplier as Quote['supplier']).name,
  },
  {
    key: 'status',
    header: 'records.col.quoteStatus',
    kind: 'text',
    value: (r) => str(r.status),
    text: (r, ctx) => ctx.t(`records.quoteStatus.${str(r.status) ?? 'REQUESTED'}` as never),
  },
  {
    key: 'visibility',
    header: 'quotes.visibility',
    kind: 'text',
    value: (r) => str(r.visibility),
    text: (r, ctx) => ctx.t(`quotes.levels.${str(r.visibility) ?? 'STANDARD'}` as never),
  },
  {
    key: 'validUntil',
    header: 'records.col.validUntil',
    kind: 'date',
    value: (r) => day(r.validUntil),
  },
  {
    key: 'vehicles',
    header: 'quotes.vehicles',
    kind: 'text',
    value: (r) => (r.vehicles as Quote['vehicles']).map((v) => v.serial).join(', '),
  },
  {
    key: 'lines',
    header: 'records.col.lines',
    kind: 'number',
    value: (r) => (r.lines as unknown[]).length,
  },
  {
    key: 'total',
    header: 'records.col.total',
    kind: 'money',
    value: (r) => num(r.total),
    numFmt: '#,##0.00 "₪"',
  },
  {
    key: 'createdBy',
    header: 'records.col.createdBy',
    kind: 'text',
    value: (r) => str(r.createdBy),
  },
  { key: 'notes', header: 'records.col.notes', kind: 'long', value: (r) => str(r.notes) },
];

const LINE_COLUMNS: Column[] = [
  { key: 'date', header: 'records.col.date', kind: 'date', value: (r) => day(r.date) },
  { key: 'supplier', header: 'records.col.supplier', kind: 'text', value: (r) => str(r.supplier) },
  { key: 'item', header: 'quotes.item', kind: 'text', value: (r) => str(r.item) },
  { key: 'partNo', header: 'quotes.partNo', kind: 'text', value: (r) => str(r.partNo) },
  {
    key: 'condition',
    header: 'quotes.condition',
    kind: 'text',
    value: (r) => str(r.condition),
    text: (r, ctx) => ctx.t(`quotes.conditions.${str(r.condition) ?? 'NEW'}` as never),
  },
  { key: 'quantity', header: 'quotes.quantity', kind: 'number', value: (r) => num(r.quantity) },
  {
    key: 'unitPrice',
    header: 'quotes.unitPrice',
    kind: 'money',
    value: (r) => num(r.unitPrice),
    numFmt: '#,##0.00 "₪"',
  },
  {
    key: 'total',
    header: 'records.col.total',
    kind: 'money',
    value: (r) => num(r.total),
    numFmt: '#,##0.00 "₪"',
  },
  {
    key: 'status',
    header: 'records.col.quoteStatus',
    kind: 'text',
    value: (r) => str(r.status),
    text: (r, ctx) => ctx.t(`records.quoteStatus.${str(r.status) ?? 'REQUESTED'}` as never),
  },
];

const asRows = (items: object[]) =>
  items.map(
    (i) => ({ attachments: [], createdById: null, createdBy: null, ...i }) as unknown as RecordRow,
  );

async function download(
  ctx: FormatCtx,
  title: string,
  fileName: string,
  sheets: { title: string; columns: Column[]; rows: RecordRow[]; files?: boolean }[],
) {
  const { downloadWorkbook } = await import('@/vehicle/records/exportXlsx');
  const line = ctx.t('records.exportedOn', { date: ctx.date(new Date().toISOString()) });
  await downloadWorkbook({
    fileName,
    sheets: sheets.map((s, i) => ({
      ...s,
      title: i === 0 ? title : s.title,
      lines: [line],
      ctx,
      fileName,
    })),
  });
}

export function exportQuotes(ctx: FormatCtx, quotes: Quote[], name: string) {
  return download(ctx, ctx.t('nav.quotes'), `${name} ${localDay(new Date())}.xlsx`, [
    { title: ctx.t('nav.quotes'), columns: QUOTE_COLUMNS, rows: asRows(quotes) },
    {
      title: ctx.t('quotes.lines'),
      columns: LINE_COLUMNS,
      files: false,
      rows: asRows(
        quotes.flatMap((q) =>
          q.lines.map((l) => ({ ...l, date: q.date, supplier: q.supplier.name, status: q.status })),
        ),
      ),
    },
  ]);
}

// ---------- One quote ----------

function QuoteDetail({
  id,
  reduced,
  onClose,
  onEdit,
}: {
  id: string;
  reduced: boolean;
  onClose: () => void;
  onEdit: (q: Quote) => void;
}) {
  const { t } = useTranslation();
  const { data: user } = useSession();
  const ctx = useFormatCtx('KM');
  const quote = useQuote(id);
  const act = useQuoteAction();
  const offerUndo = useOfferUndo();
  const [vehicles, setVehicles] = useState<string[] | null>(null);
  const q = quote.data;

  if (!q) {
    return (
      <Sheet title={t('quotes.one')} onClose={onClose} reduced={reduced}>
        {quote.isError ? (
          <p role="alert" className="text-bad text-sm">
            {t('quotes.notFound')}
          </p>
        ) : (
          <Loader2 aria-hidden className="text-muted mx-auto my-8 size-5 animate-spin" />
        )}
      </Sheet>
    );
  }
  const next =
    q.canEdit && user ? QUOTE_NEXT[q.status].filter((s) => canSetQuoteStatus(user.role, s)) : [];
  const approvalWaits =
    q.canEdit && user && QUOTE_NEXT[q.status].some((s) => !canSetQuoteStatus(user.role, s));

  return (
    <Sheet
      title={t('quotes.from', { supplier: q.supplier.name })}
      onClose={onClose}
      reduced={reduced}
      footer={
        q.canEdit ? (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              className="text-bad"
              onClick={() =>
                act.mutate(
                  { id: q.id, action: 'delete' },
                  {
                    onSuccess: () => {
                      onClose();
                      offerUndo(t('records.deleted', { record: t('quotes.one') }), () =>
                        act.mutateAsync({ id: q.id, action: 'restore' }),
                      );
                    },
                  },
                )
              }
              data-testid="quote-delete"
            >
              <Trash2 aria-hidden />
              {t('records.delete')}
            </Button>
            <Button className="ms-auto" onClick={() => onEdit(q)} data-testid="quote-edit">
              <Pencil aria-hidden />
              {t('records.edit')}
            </Button>
          </div>
        ) : undefined
      }
    >
      <div className="space-y-4" data-testid="quote-detail">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadgeQ status={q.status} />
          <VisibilityBadge level={q.visibility} />
          {q.expired && <Badge tone="warn">{t('quotes.expired')}</Badge>}
          {!q.canEdit && (
            <span className="text-muted ms-auto text-xs">
              {q.mine ? t('quotes.lockedByAdmin') : t('quotes.readOnly')}
            </span>
          )}
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-muted text-xs">{t('records.col.date')}</dt>
            <dd className="num">{ctx.date(q.date)}</dd>
          </div>
          <div>
            <dt className="text-muted text-xs">{t('records.col.validUntil')}</dt>
            <dd className="num">{q.validUntil ? ctx.date(q.validUntil) : '—'}</dd>
          </div>
          <div>
            <dt className="text-muted text-xs">{t('records.col.createdBy')}</dt>
            <dd>{q.createdBy}</dd>
          </div>
          <div>
            <dt className="text-muted text-xs">{t('records.col.total')}</dt>
            <dd className="num font-semibold">{ctx.money(q.total)}</dd>
          </div>
        </dl>

        {(next.length > 0 || approvalWaits) && (
          <div className="flex flex-wrap items-center gap-2">
            {next.map((s) => (
              <Button
                key={s}
                size="sm"
                variant={s === 'REJECTED' ? 'outline' : 'primary'}
                disabled={act.isPending}
                onClick={() => act.mutate({ id: q.id, action: 'status', status: s })}
                data-testid={`quote-to-${s}`}
              >
                {s !== 'REJECTED' && <ArrowRight aria-hidden className="rtl:rotate-180" />}
                {t(`quotes.moveTo.${s}`)}
              </Button>
            ))}
            {approvalWaits && <p className="text-muted text-xs">{t('quotes.approvalWaits')}</p>}
          </div>
        )}

        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[30rem] text-sm">
            <thead className="text-muted text-xs">
              <tr className="border-border border-b">
                <th className="px-1.5 py-2 text-start font-medium">{t('quotes.item')}</th>
                <th className="px-1.5 py-2 text-start font-medium">{t('quotes.partNo')}</th>
                <th className="px-1.5 py-2 text-start font-medium">{t('quotes.condition')}</th>
                <th className="px-1.5 py-2 text-end font-medium">{t('quotes.quantity')}</th>
                <th className="px-1.5 py-2 text-end font-medium">{t('quotes.unitPrice')}</th>
                <th className="px-1.5 py-2 text-end font-medium">{t('records.col.total')}</th>
              </tr>
            </thead>
            <tbody>
              {q.lines.map((l) => (
                <tr key={l.id} className="border-border border-b last:border-0">
                  <td className="px-1.5 py-2">{l.item}</td>
                  <td className="px-1.5 py-2">
                    {l.partNo ? (
                      <bdi dir="ltr" className="num">
                        {l.partNo}
                      </bdi>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-1.5 py-2">{t(`quotes.conditions.${l.condition}`)}</td>
                  <td className="num px-1.5 py-2 text-end">{ctx.number(l.quantity)}</td>
                  <td className="num px-1.5 py-2 text-end">{ctx.money(l.unitPrice)}</td>
                  <td className="num px-1.5 py-2 text-end">{ctx.money(l.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {vehicles === null ? (
          <div className="space-y-1.5">
            <p className="text-xs font-medium">{t('quotes.vehicles')}</p>
            <div className="flex flex-wrap items-center gap-1.5">
              {q.vehicles.map((v) => (
                <VehicleTagChip key={v.serial} serial={v.serial} type={v.type} />
              ))}
              {q.vehicles.length === 0 && (
                <span className="text-muted text-xs">{t('quotes.noVehicles')}</span>
              )}
              {q.canEdit && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setVehicles(q.vehicles.map((v) => v.serial))}
                  data-testid="quote-change-vehicles"
                >
                  {t('quotes.changeVehicles')}
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <VehiclePicker label={t('quotes.vehicles')} value={vehicles} onChange={setVehicles} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setVehicles(null)}>
                {t('records.cancel')}
              </Button>
              <Button
                size="sm"
                disabled={act.isPending}
                onClick={() =>
                  act.mutate(
                    { id: q.id, action: 'vehicles', vehicles },
                    { onSuccess: () => setVehicles(null) },
                  )
                }
                data-testid="quote-save-vehicles"
              >
                {t('records.save')}
              </Button>
            </div>
          </div>
        )}

        {user?.role === 'ADMIN' && (
          <label className="block space-y-1 text-xs font-medium">
            <span>{t('quotes.visibility')}</span>
            <select
              className={cn(CONTROL, 'h-9 w-full text-sm')}
              value={q.visibility}
              onChange={(e) =>
                act.mutate({
                  id: q.id,
                  action: 'visibility',
                  visibility: e.target.value as QuoteVisibility,
                })
              }
              data-testid="quote-visibility"
            >
              {QUOTE_VISIBILITIES.map((v) => (
                <option key={v} value={v}>
                  {t(`quotes.levels.${v}`)} · {t(`quotes.levelHint.${v}`)}
                </option>
              ))}
            </select>
          </label>
        )}

        {q.notes && (
          <div>
            <p className="text-muted text-xs">{t('records.col.notes')}</p>
            <p className="text-sm whitespace-pre-line">{q.notes}</p>
          </div>
        )}
        <AttachmentList serial="" items={q.attachments} canEdit={q.canEdit} />
      </div>
    </Sheet>
  );
}

// ---------- Comparison ----------

/** The lowest unit price among lines still worth buying from: not rejected, not expired. */
function cheapest(lines: { unitPrice: number; rejected: boolean; expired: boolean }[]) {
  const live = lines.filter((l) => !l.rejected && !l.expired);
  return live.length ? Math.min(...live.map((l) => l.unitPrice)) : null;
}

function PartCompare({ ctx }: { ctx: FormatCtx }) {
  const { t } = useTranslation();
  const parts = useParts();
  const [part, setPart] = useState<string | null>(null);
  const chosen = part ?? parts.data?.find((p) => p.quotes > 1)?.key ?? parts.data?.[0]?.key ?? null;
  const lines = usePartComparison(chosen);
  const best = cheapest(
    (lines.data ?? []).map((l) => ({
      unitPrice: l.unitPrice,
      rejected: l.quote.status === 'REJECTED',
      expired: l.quote.expired,
    })),
  );
  const partLabel = (p: { item: string; partNo: string | null }) =>
    p.partNo ? `${p.item} · ${p.partNo}` : p.item;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-0 flex-1 space-y-1 text-xs font-medium">
          <span>{t('quotes.comparePart')}</span>
          <select
            className={cn(CONTROL, 'h-9 w-full text-sm')}
            value={chosen ?? ''}
            onChange={(e) => setPart(e.target.value)}
            data-testid="compare-part"
          >
            {parts.data?.map((p) => (
              <option key={p.key} value={p.key}>
                {partLabel(p)} ({t('quotes.quoteCount', { count: p.quotes })})
              </option>
            ))}
          </select>
        </label>
        <Button
          variant="outline"
          size="sm"
          disabled={!lines.data?.length}
          onClick={() =>
            void download(
              ctx,
              t('quotes.compareTitle'),
              `quote comparison ${localDay(new Date())}.xlsx`,
              [
                {
                  title: t('quotes.compareTitle'),
                  columns: LINE_COLUMNS,
                  files: false,
                  rows: asRows(
                    (lines.data ?? []).map((l) => ({
                      ...l,
                      date: l.quote.date,
                      supplier: l.quote.supplier.name,
                      status: l.quote.status,
                      total: l.unitPrice * l.quantity,
                    })),
                  ),
                },
              ],
            )
          }
        >
          <FileSpreadsheet aria-hidden />
          {t('records.export')}
        </Button>
      </div>
      {lines.isPending && chosen ? (
        <Loader2 aria-hidden className="text-muted mx-auto my-6 size-5 animate-spin" />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="compare-lines">
          {(lines.data ?? []).map((l: CompareLine) => {
            const isBest =
              best !== null &&
              l.unitPrice === best &&
              l.quote.status !== 'REJECTED' &&
              !l.quote.expired;
            return (
              <li
                key={l.id}
                className={cn(
                  'border-border space-y-1 rounded-xl border p-3',
                  isBest && 'border-ok ring-ok/30 ring-2',
                  (l.quote.status === 'REJECTED' || l.quote.expired) && 'opacity-60',
                )}
                data-testid="compare-line"
              >
                <div className="flex items-center gap-2">
                  <span className="me-auto truncate font-medium">{l.quote.supplier.name}</span>
                  {isBest && <Badge tone="ok">{t('quotes.cheapest')}</Badge>}
                </div>
                <p className="num text-xl font-semibold">{ctx.money(l.unitPrice)}</p>
                <p className="text-muted text-xs">
                  {t('quotes.unitPrice')} · {t(`quotes.conditions.${l.condition}`)} ·{' '}
                  {t('quotes.qty', { count: l.quantity })}
                </p>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <StatusBadgeQ status={l.quote.status} />
                  <span className="num text-muted">{ctx.date(l.quote.date)}</span>
                  {l.quote.validUntil && (
                    <span className={cn('num', l.quote.expired ? 'text-warn' : 'text-muted')}>
                      {t('quotes.validTo', { date: ctx.date(l.quote.validUntil) })}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function QuotesCompare({ ids, ctx }: { ids: string[]; ctx: FormatCtx }) {
  const { t } = useTranslation();
  const quotes = useQuoteComparison(ids);
  const list = useMemo(() => quotes.data ?? [], [quotes.data]);
  // Rows: every part across the chosen quotes, matched by part no. (or name).
  const keyOf = (l: { item: string; partNo: string | null }) =>
    (l.partNo ? `#${l.partNo}` : l.item).toLowerCase();
  const rows = useMemo(() => {
    const out = new Map<string, { label: string; partNo: string | null }>();
    for (const q of list)
      for (const l of q.lines) out.set(keyOf(l), { label: l.item, partNo: l.partNo });
    return [...out];
  }, [list]);
  if (quotes.isPending)
    return <Loader2 aria-hidden className="text-muted mx-auto my-6 size-5 animate-spin" />;
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full min-w-[32rem] text-sm" data-testid="compare-quotes">
        <thead>
          <tr className="border-border border-b">
            <th className="px-1.5 py-2" />
            {list.map((q) => (
              <th key={q.id} scope="col" className="px-1.5 py-2 text-start align-top font-medium">
                <span className="block">{q.supplier.name}</span>
                <span className="text-muted num block text-xs font-normal">{ctx.date(q.date)}</span>
                <StatusBadgeQ status={q.status} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([key, part]) => {
            const prices = list.map((q) => q.lines.find((l) => keyOf(l) === key));
            const best = cheapest(
              prices
                .map((l, i) =>
                  l
                    ? {
                        unitPrice: l.unitPrice,
                        rejected: list[i]!.status === 'REJECTED',
                        expired: list[i]!.expired,
                      }
                    : null,
                )
                .filter((x): x is NonNullable<typeof x> => !!x),
            );
            return (
              <tr key={key} className="border-border border-b">
                <th scope="row" className="px-1.5 py-2 text-start font-normal">
                  {part.label}
                  {part.partNo && (
                    <bdi dir="ltr" className="num text-muted ms-1 text-xs">
                      {part.partNo}
                    </bdi>
                  )}
                </th>
                {prices.map((l, i) => (
                  <td
                    key={list[i]!.id}
                    className={cn(
                      'num px-1.5 py-2',
                      l && l.unitPrice === best && 'text-ok font-semibold',
                    )}
                  >
                    {l ? ctx.money(l.unitPrice) : <span className="text-muted">—</span>}
                  </td>
                ))}
              </tr>
            );
          })}
          <tr>
            <th scope="row" className="px-1.5 py-2 text-start font-medium">
              {t('records.col.total')}
            </th>
            {list.map((q) => (
              <td key={q.id} className="num px-1.5 py-2 font-semibold">
                {ctx.money(q.total)}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function CompareSheet({
  ids,
  reduced,
  onClose,
}: {
  ids: string[];
  reduced: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const ctx = useFormatCtx('KM');
  return (
    <Sheet title={t('quotes.compareTitle')} onClose={onClose} reduced={reduced}>
      {ids.length >= 2 ? <QuotesCompare ids={ids} ctx={ctx} /> : <PartCompare ctx={ctx} />}
    </Sheet>
  );
}

// ---------- The list ----------

/** The quotes list (all visible quotes, or one vehicle's), with filters, compare and export. */
export function QuotesView({ vehicle }: { vehicle?: string }) {
  const { t } = useTranslation();
  const { data: user } = useSession();
  const ctx = useFormatCtx('KM');
  const suppliers = useSuppliers();
  const [reduced] = useState(prefersReducedMotion);
  const [filters, setFilters] = useFilters<QuoteFilters>(FILTER_KEYS, !vehicle);
  const scoped = useMemo(
    () => ({ ...filters, ...(vehicle ? { vehicle } : {}) }),
    [filters, vehicle],
  );
  const list = useQuotes(scoped);
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<Quote | 'new' | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [comparing, setComparing] = useState<string[] | null>(null);
  const [exporting, setExporting] = useState(false);
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const total = list.data?.pages[0]?.total ?? 0;

  const togglePick = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 4 ? p : [...p, id]));

  return (
    <UndoProvider reduced={reduced}>
      <div className="space-y-3" data-testid="quotes-view">
        <div className="flex flex-wrap items-center gap-2">
          <SearchBox
            label={t('quotes.search')}
            value={filters.q ?? ''}
            onChange={(q) => setFilters({ q })}
            testId="quote-search"
          />
          <FilterSelect
            label={t('records.col.quoteStatus')}
            value={filters.status ?? ''}
            onChange={(v) => setFilters({ status: v })}
            options={QUOTE_STATUSES.map((s) => ({
              value: s,
              label: t(`records.quoteStatus.${s}`),
            }))}
            testId="quote-filter-status"
          />
          <FilterSelect
            label={t('records.col.supplier')}
            value={filters.supplier ?? ''}
            onChange={(v) => setFilters({ supplier: v })}
            options={(suppliers.data?.items ?? []).map((s) => ({ value: s.id, label: s.name }))}
          />
          {user?.role === 'ADMIN' && (
            <FilterSelect
              label={t('quotes.visibility')}
              value={filters.visibility ?? ''}
              onChange={(v) => setFilters({ visibility: v })}
              options={QUOTE_VISIBILITIES.map((v) => ({
                value: v,
                label: t(`quotes.levels.${v}`),
              }))}
            />
          )}
          <div className="ms-auto flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setComparing(picked.length >= 2 ? picked : [])}
              data-testid="quote-compare"
            >
              <Columns2 aria-hidden />
              {picked.length >= 2
                ? t('quotes.compareChosen', { count: picked.length })
                : t('quotes.compare')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={exporting || items.length === 0}
              onClick={async () => {
                setExporting(true);
                try {
                  await exportQuotes(
                    ctx,
                    await fetchAllQuotes(scoped),
                    vehicle ? `quotes ${vehicle}` : 'quotes',
                  );
                } finally {
                  setExporting(false);
                }
              }}
              data-testid="export"
            >
              {exporting ? (
                <Loader2 aria-hidden className="animate-spin" />
              ) : (
                <FileSpreadsheet aria-hidden />
              )}
              {t('records.export')}
            </Button>
            <Button size="sm" onClick={() => setEditing('new')} data-testid="quote-add">
              <Plus aria-hidden />
              {t('quotes.add')}
            </Button>
          </div>
        </div>
        <p className="text-muted text-xs">{t('quotes.pickHint')}</p>

        {list.isPending ? (
          <Loader2 aria-hidden className="text-muted mx-auto my-8 size-5 animate-spin" />
        ) : list.isError ? (
          <p role="alert" className="text-bad py-6 text-center text-sm">
            {t('records.error.load')}
          </p>
        ) : items.length === 0 ? (
          <p className="text-muted py-10 text-center text-sm">{t('quotes.empty')}</p>
        ) : (
          <ul className="space-y-2" data-testid="quote-list">
            {items.map((q) => (
              <li
                key={q.id}
                className="border-border bg-surface hover:border-border-strong flex items-start gap-3 rounded-xl border p-3"
                data-testid="quote-row"
              >
                <input
                  type="checkbox"
                  className="mt-1 size-4 shrink-0 accent-[var(--fh-accent)]"
                  checked={picked.includes(q.id)}
                  onChange={() => togglePick(q.id)}
                  aria-label={t('quotes.pick', { supplier: q.supplier.name })}
                  data-testid="quote-pick"
                />
                <button
                  type="button"
                  onClick={() => setOpen(q.id)}
                  className="grid min-w-0 flex-1 gap-1 text-start sm:grid-cols-[1fr_auto]"
                  data-testid="quote-open"
                >
                  <span className="min-w-0 space-y-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">{q.supplier.name}</span>
                      <StatusBadgeQ status={q.status} />
                      <VisibilityBadge level={q.visibility} />
                      {q.expired && <Badge tone="warn">{t('quotes.expired')}</Badge>}
                    </span>
                    <span className="text-muted block truncate text-xs">
                      {q.lines.map((l) => l.item).join(' · ')}
                    </span>
                    <span className="flex flex-wrap gap-1">
                      {q.vehicles.map((v) => (
                        <bdi key={v.serial} dir="ltr" className="num text-muted text-xs">
                          {v.serial}
                        </bdi>
                      ))}
                    </span>
                  </span>
                  <span className="sm:text-end">
                    <span className="num block font-semibold">{ctx.money(q.total)}</span>
                    <span className="num text-muted block text-xs">{ctx.date(q.date)}</span>
                    <span className="text-muted block text-xs">{q.createdBy}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {list.hasNextPage && (
          <div className="flex justify-center">
            <Button variant="outline" size="sm" onClick={() => void list.fetchNextPage()}>
              {t('records.more')}
            </Button>
          </div>
        )}
        {items.length > 0 && (
          <p className="text-muted text-center text-xs">
            {t('records.showing', { shown: items.length, total })}
          </p>
        )}
      </div>
      {open && (
        <QuoteDetail
          id={open}
          reduced={reduced}
          onClose={() => setOpen(null)}
          onEdit={(q) => {
            setOpen(null);
            setEditing(q);
          }}
        />
      )}
      {editing && (
        <QuoteForm
          quote={editing === 'new' ? undefined : editing}
          vehicles={vehicle ? [vehicle] : []}
          reduced={reduced}
          onClose={() => setEditing(null)}
          onSaved={(q) => setOpen(q.id)}
        />
      )}
      {comparing && (
        <CompareSheet ids={comparing} reduced={reduced} onClose={() => setComparing(null)} />
      )}
    </UndoProvider>
  );
}

export function QuotesPage() {
  const { t } = useTranslation();
  const title = t('nav.quotes');
  useEffect(() => {
    document.title = `${title} · ${t('app.name')}`;
  }, [title, t]);
  return (
    <section aria-labelledby="area-title" className="glass space-y-4 p-3 sm:p-5">
      <PageHeader title={title} />
      <QuotesView />
    </section>
  );
}
