import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { FileSpreadsheet, Loader2, Pencil } from 'lucide-react';
import { hasRole, ownershipBody } from '@fleet-hub/shared';
import { useSession } from '@/auth/session';
import { Sheet } from '@/components/Sheet';
import { Button } from '@/components/ui/button';
import { lookupName } from '@/fleet/data';
import { cn } from '@/lib/cn';
import type { VehicleDetail } from '../data';
import { useQueryClient } from '@tanstack/react-query';
import {
  refreshAfterWrite,
  uploadFiles,
  useDocuments,
  useOwnership,
  useQuotes,
  useSaveOwnership,
  type Ownership,
  type RecordRow,
} from './api';
import { AttachmentList, FilePicker } from './Attachments';
import { cellText, useFormatCtx } from './format';
import { localDay, type Column, type FormatCtx } from './kinds';
import { useExport } from './useExport';

const asRows = <T extends { id: string }>(items: T[]) =>
  items.map((i) => ({ createdById: null, createdBy: null, attachments: [], ...i }) as RecordRow);

/** A read-only table with Export, for documents and quotes until Phase 6 adds their forms. */
function ReadOnlyTable({
  kind,
  vehicle,
  columns,
  rows,
  pending,
  ctx,
}: {
  kind: 'documents' | 'quotes';
  vehicle: VehicleDetail;
  columns: Column[];
  rows: RecordRow[];
  pending: boolean;
  ctx: FormatCtx;
}) {
  const { t } = useTranslation();
  const exporter = useExport();
  return (
    <div className="space-y-3" data-testid={`records-${kind}`}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-muted me-auto text-xs">{t('records.addLater')}</p>
        <Button
          variant="outline"
          size="sm"
          disabled={exporter.busy || rows.length === 0}
          onClick={() =>
            exporter.run({ serial: vehicle.serial, kind, vehicle, columns, ctx, rows })
          }
          data-testid="export"
        >
          {exporter.busy ? (
            <Loader2 aria-hidden className="animate-spin" />
          ) : (
            <FileSpreadsheet aria-hidden />
          )}
          {t('records.export')}
        </Button>
      </div>
      {exporter.error && (
        <p role="alert" className="text-bad text-xs">
          {t('records.error.export')}
        </p>
      )}
      {pending ? (
        <Loader2 aria-hidden className="text-muted mx-auto my-8 size-5 animate-spin" />
      ) : rows.length === 0 ? (
        <p className="text-muted py-6 text-center text-sm">{t('vehicle.records.empty')}</p>
      ) : (
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[32rem] text-sm">
            <thead className="text-muted text-xs">
              <tr className="border-border border-b">
                {columns.map((c) => (
                  <th
                    key={c.key}
                    scope="col"
                    className={cn(
                      'px-1.5 py-2 font-medium',
                      c.kind === 'money' || c.kind === 'number' ? 'text-end' : 'text-start',
                    )}
                  >
                    {t(c.header as never)}
                  </th>
                ))}
                <th className="px-1.5 py-2">
                  <span className="sr-only">{t('records.files')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-border border-b last:border-0">
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={cn(
                        'px-1.5 py-2',
                        (c.kind === 'money' || c.kind === 'number') && 'num text-end',
                      )}
                    >
                      {cellText(c, row, ctx) || <span className="text-muted">—</span>}
                    </td>
                  ))}
                  <td className="px-1.5 py-1">
                    <AttachmentList
                      serial={vehicle.serial}
                      items={row.attachments}
                      canEdit={false}
                      compact
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const str = (v: unknown) => (typeof v === 'string' ? v : null);
const num = (v: unknown) => (typeof v === 'number' ? v : null);
const date = (v: unknown) => (typeof v === 'string' ? new Date(v) : null);

const DOC_COLUMNS: Column[] = [
  { key: 'date', header: 'records.col.date', kind: 'date', value: (r) => date(r.date) },
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
  { key: 'notes', header: 'records.col.notes', kind: 'long', value: (r) => str(r.notes) },
];

export function DocumentsPanel({ vehicle }: { vehicle: VehicleDetail }) {
  const ctx = useFormatCtx(vehicle.usageUnit);
  const docs = useDocuments(vehicle.serial);
  return (
    <ReadOnlyTable
      kind="documents"
      vehicle={vehicle}
      columns={DOC_COLUMNS}
      rows={asRows(docs.data?.items ?? [])}
      pending={docs.isPending}
      ctx={ctx}
    />
  );
}

const QUOTE_COLUMNS: Column[] = [
  { key: 'date', header: 'records.col.date', kind: 'date', value: (r) => date(r.date) },
  { key: 'supplier', header: 'records.col.supplier', kind: 'text', value: (r) => str(r.supplier) },
  {
    key: 'status',
    header: 'records.col.quoteStatus',
    kind: 'text',
    value: (r) => str(r.status),
    text: (r, ctx) => ctx.t(`records.quoteStatus.${str(r.status) ?? 'REQUESTED'}` as never),
  },
  { key: 'lineCount', header: 'records.col.lines', kind: 'number', value: (r) => num(r.lineCount) },
  {
    key: 'total',
    header: 'records.col.total',
    kind: 'money',
    value: (r) => num(r.total),
    numFmt: '#,##0.00 "₪"',
  },
  {
    key: 'validUntil',
    header: 'records.col.validUntil',
    kind: 'date',
    value: (r) => date(r.validUntil),
  },
];

export function QuotesPanel({ vehicle }: { vehicle: VehicleDetail }) {
  const ctx = useFormatCtx(vehicle.usageUnit);
  const quotes = useQuotes(vehicle.serial);
  return (
    <ReadOnlyTable
      kind="quotes"
      vehicle={vehicle}
      columns={QUOTE_COLUMNS}
      rows={asRows(quotes.data?.items ?? [])}
      pending={quotes.isPending}
      ctx={ctx}
    />
  );
}

// ---------- Ownership & warranty ----------

const OWNERSHIP_COLUMNS: Column[] = [
  {
    key: 'purchaseDate',
    header: 'vehicle.ownership.purchaseDate',
    kind: 'date',
    value: (r) => date(r.purchaseDate),
  },
  {
    key: 'supplier',
    header: 'records.col.supplier',
    kind: 'text',
    value: (r) => str(r.supplierName),
  },
  {
    key: 'purchasePrice',
    header: 'records.col.purchasePrice',
    kind: 'money',
    value: (r) => num(r.purchasePrice),
    numFmt: '#,##0.00 "₪"',
  },
  {
    key: 'warrantyTerms',
    header: 'records.col.warrantyTerms',
    kind: 'long',
    value: (r) => str(r.warrantyTerms),
  },
  {
    key: 'warrantyExpiry',
    header: 'vehicle.ownership.warrantyExpiry',
    kind: 'date',
    value: (r) => date(r.warrantyExpiry),
  },
];

const ownershipRow = (o: Ownership): RecordRow => ({
  id: o.id,
  createdById: null,
  createdBy: null,
  attachments: o.attachments,
  purchaseDate: o.purchaseDate,
  supplierName: o.supplier?.name ?? null,
  purchasePrice: o.purchasePrice,
  warrantyTerms: o.warrantyTerms,
  warrantyExpiry: o.warrantyExpiry,
});

export function OwnershipPanel({ vehicle, reduced }: { vehicle: VehicleDetail; reduced: boolean }) {
  const { t } = useTranslation();
  const ctx = useFormatCtx(vehicle.usageUnit);
  const { data: user } = useSession();
  const ownership = useOwnership(vehicle.serial);
  const exporter = useExport();
  const [editing, setEditing] = useState(false);
  const canEdit = !!user && hasRole(user.role, 'EDITOR');

  if (ownership.isPending)
    return <Loader2 aria-hidden className="text-muted mx-auto my-8 size-5 animate-spin" />;
  if (!ownership.data)
    return (
      <p role="alert" className="text-bad py-6 text-center text-sm">
        {t('records.error.load')}
      </p>
    );
  const o = ownership.data;
  const row = ownershipRow(o);

  return (
    <div className="space-y-3" data-testid="records-ownership">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={exporter.busy}
          onClick={() =>
            exporter.run({
              serial: vehicle.serial,
              kind: 'ownership',
              vehicle,
              columns: OWNERSHIP_COLUMNS,
              ctx,
              rows: [row],
            })
          }
          data-testid="export"
        >
          <FileSpreadsheet aria-hidden />
          {t('records.export')}
        </Button>
        {canEdit && (
          <Button size="sm" onClick={() => setEditing(true)} data-testid="edit-ownership">
            <Pencil aria-hidden />
            {t('records.edit')}
          </Button>
        )}
      </div>
      <dl className="grid gap-3 sm:grid-cols-2">
        {OWNERSHIP_COLUMNS.map((c) => (
          <div key={c.key} className={cn(c.kind === 'long' && 'sm:col-span-2')}>
            <dt className="text-muted text-xs">{t(c.header as never)}</dt>
            <dd className={cn('text-sm', c.kind === 'money' && 'num')}>
              {cellText(c, row, ctx) || t('dashboard.notSet')}
            </dd>
          </div>
        ))}
      </dl>
      <AttachmentList serial={vehicle.serial} items={o.attachments} canEdit={canEdit} />
      {editing && (
        <OwnershipForm
          serial={vehicle.serial}
          ownership={o}
          reduced={reduced}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}

function OwnershipForm({
  serial,
  ownership: o,
  reduced,
  onClose,
}: {
  serial: string;
  ownership: Ownership;
  reduced: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const save = useSaveOwnership(serial);
  const qc = useQueryClient();
  const [values, setValues] = useState({
    purchaseDate: o.purchaseDate ? localDay(new Date(o.purchaseDate)) : '',
    supplierId: o.supplier?.id ?? '',
    purchasePrice: o.purchasePrice === null ? '' : String(o.purchasePrice),
    warrantyTerms: o.warrantyTerms ?? '',
    warrantyExpiry: o.warrantyExpiry ? localDay(new Date(o.warrantyExpiry)) : '',
  });
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof values, v: string) => setValues((s) => ({ ...s, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const body = {
      purchaseDate: values.purchaseDate || null,
      supplierId: values.supplierId || null,
      purchasePrice: values.purchasePrice === '' ? null : Number(values.purchasePrice),
      warrantyTerms: values.warrantyTerms,
      warrantyExpiry: values.warrantyExpiry || null,
    };
    if (!ownershipBody.safeParse(body).success) {
      setError('records.error.invalid');
      return;
    }
    try {
      await save.mutateAsync(body);
      if (files.length) {
        await uploadFiles('Vehicle', o.id, files);
        await refreshAfterWrite(qc, serial);
      }
      onClose();
    } catch {
      setError('records.error.save');
    }
  };

  const input =
    'border-border-strong bg-surface h-9 w-full rounded-md border px-2.5 text-sm focus-visible:outline-2 focus-visible:outline-[var(--fh-accent)]';
  return (
    <Sheet
      title={t('records.editTitle', { record: t('vehicle.records.ownership') })}
      onClose={onClose}
      reduced={reduced}
      footer={
        <div className="flex items-center gap-2">
          {error && (
            <p role="alert" className="text-bad me-auto text-xs">
              {t(error as never)}
            </p>
          )}
          <Button variant="ghost" className="ms-auto" type="button" onClick={onClose}>
            {t('records.cancel')}
          </Button>
          <Button type="submit" form="ownership-form" disabled={save.isPending}>
            {t('records.save')}
          </Button>
        </div>
      }
    >
      <form id="ownership-form" onSubmit={submit} noValidate className="space-y-4">
        <label className="block space-y-1 text-xs font-medium">
          <span>{t('vehicle.ownership.purchaseDate')}</span>
          <input
            type="date"
            className={cn(input, 'num')}
            value={values.purchaseDate}
            onChange={(e) => set('purchaseDate', e.target.value)}
          />
        </label>
        <label className="block space-y-1 text-xs font-medium">
          <span>{t('records.col.supplier')}</span>
          <select
            className={input}
            value={values.supplierId}
            onChange={(e) => set('supplierId', e.target.value)}
          >
            <option value="">{t('records.choose')}</option>
            {o.suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 text-xs font-medium">
          <span>{t('records.col.purchasePrice')}</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            className={cn(input, 'num')}
            value={values.purchasePrice}
            onChange={(e) => set('purchasePrice', e.target.value)}
          />
        </label>
        <label className="block space-y-1 text-xs font-medium">
          <span>{t('records.col.warrantyTerms')}</span>
          <textarea
            rows={3}
            className={cn(input, 'h-auto py-2')}
            value={values.warrantyTerms}
            onChange={(e) => set('warrantyTerms', e.target.value)}
          />
        </label>
        <label className="block space-y-1 text-xs font-medium">
          <span>{t('vehicle.ownership.warrantyExpiry')}</span>
          <input
            type="date"
            className={cn(input, 'num')}
            value={values.warrantyExpiry}
            onChange={(e) => set('warrantyExpiry', e.target.value)}
          />
        </label>
        <fieldset className="space-y-2">
          <legend className="mb-1 text-xs font-medium">{t('records.files')}</legend>
          <FilePicker files={files} onChange={setFiles} />
        </fieldset>
      </form>
    </Sheet>
  );
}
