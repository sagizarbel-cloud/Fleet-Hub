import { lazy, Suspense, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { FileSpreadsheet, Loader2, Pencil } from 'lucide-react';
import { hasRole, ownershipBody } from '@fleet-hub/shared';
import { useSession } from '@/auth/session';
import { Sheet } from '@/components/Sheet';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import type { VehicleDetail } from '../data';
import { useQueryClient } from '@tanstack/react-query';
import {
  refreshAfterWrite,
  uploadFiles,
  useOwnership,
  useSaveOwnership,
  type Ownership,
  type RecordRow,
} from './api';
import { AttachmentList, FilePicker } from './Attachments';
import { cellText, useFormatCtx } from './format';
import { localDay, type Column } from './kinds';
import { useExport } from './useExport';

const str = (v: unknown) => (typeof v === 'string' ? v : null);
const num = (v: unknown) => (typeof v === 'number' ? v : null);
const date = (v: unknown) => (typeof v === 'string' ? new Date(v) : null);

// The receipts and quotes screens, scoped to this vehicle (SPEC 5.5, 5.6).
const ReceiptsView = lazy(() =>
  import('@/money/Receipts').then((m) => ({ default: m.ReceiptsView })),
);
const QuotesView = lazy(() => import('@/money/Quotes').then((m) => ({ default: m.QuotesView })));
const Spinner = () => (
  <Loader2 aria-hidden className="text-muted mx-auto my-8 size-5 animate-spin" />
);

export function DocumentsPanel({ vehicle }: { vehicle: VehicleDetail }) {
  return (
    <div data-testid="records-documents">
      <Suspense fallback={<Spinner />}>
        <ReceiptsView vehicle={vehicle.serial} />
      </Suspense>
    </div>
  );
}

export function QuotesPanel({ vehicle }: { vehicle: VehicleDetail }) {
  return (
    <div data-testid="records-quotes">
      <Suspense fallback={<Spinner />}>
        <QuotesView vehicle={vehicle.serial} />
      </Suspense>
    </div>
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
              <bdi className="whitespace-pre-line">
                {cellText(c, row, ctx) || t('dashboard.notSet')}
              </bdi>
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
