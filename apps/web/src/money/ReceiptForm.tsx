import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  DOCUMENT_KINDS,
  hasRole,
  receiptBody,
  type DocumentKind,
  type ReceiptBody,
  type RecordKind,
} from '@fleet-hub/shared';
import { useSession } from '@/auth/session';
import { Sheet } from '@/components/Sheet';
import { Button } from '@/components/ui/button';
import { lookupName, useLookups } from '@/fleet/data';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { AttachmentList, FilePicker } from '@/vehicle/records/Attachments';
import type { RecordPage } from '@/vehicle/records/api';
import { localDay } from '@/vehicle/records/kinds';
import { useSaveReceipt, type Receipt } from './api';
import { errorProps, INPUT, issuesToErrors, Labeled, type Errors } from './form';
import { VehiclePicker } from './VehiclePicker';

const ID = {
  amount: 'receipt-amount',
  category: 'receipt-category',
  date: 'receipt-date',
  notes: 'receipt-notes',
  vendor: 'receipt-vendor',
} as const;

/** Records a receipt can point at, and how each is named in the list. */
const LINKABLE = ['service', 'malfunctions', 'inspections', 'fuel'] as const satisfies RecordKind[];

const DATE = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

function LinkedRecord({
  serial,
  value,
  onChange,
}: {
  serial: string;
  value: { kind: RecordKind; id: string } | null;
  onChange: (v: { kind: RecordKind; id: string } | null) => void;
}) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<RecordKind | ''>(value?.kind ?? '');
  const rows = useQuery({
    queryKey: ['records', serial, kind, 'linkable'],
    queryFn: () =>
      api<RecordPage>(`/vehicles/${encodeURIComponent(serial)}/records/${kind}?limit=30`),
    enabled: !!kind,
  });
  const label = (r: Record<string, unknown>) => {
    const when = String(r.date ?? r.reportedAt ?? '');
    const what =
      typeof r.description === 'string'
        ? r.description
        : typeof r.kind === 'string'
          ? t(`inspection.${r.kind}` as never)
          : typeof r.liters === 'number'
            ? t('records.liters', { value: r.liters })
            : '';
    return `${when ? DATE.format(new Date(when)) : ''} · ${what}`;
  };
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <Labeled id="receipt-link-kind" label={t('receipts.linkKind')}>
        <select
          id="receipt-link-kind"
          className={INPUT}
          value={kind}
          onChange={(e) => {
            setKind(e.target.value as RecordKind | '');
            onChange(null);
          }}
        >
          <option value="">{t('receipts.noLink')}</option>
          {LINKABLE.map((k) => (
            <option key={k} value={k}>
              {t(`vehicle.records.one.${k}`)}
            </option>
          ))}
        </select>
      </Labeled>
      {kind && (
        <Labeled id="receipt-link" label={t('receipts.linkRecord')}>
          <select
            id="receipt-link"
            className={INPUT}
            value={value?.id ?? ''}
            onChange={(e) => onChange(e.target.value ? { kind, id: e.target.value } : null)}
          >
            <option value="">{t('records.choose')}</option>
            {rows.data?.items.map((r) => (
              <option key={r.id} value={r.id}>
                {label(r)}
              </option>
            ))}
          </select>
        </Labeled>
      )}
    </div>
  );
}

/**
 * Add or edit a receipt (SPEC 5.5). Several files can become one receipt each, or one receipt
 * with several pages. A viewer's receipt is saved as a suggestion for an editor to approve.
 */
export function ReceiptForm({
  receipt,
  vehicles: initialVehicles = [],
  files: initialFiles = [],
  reduced,
  onClose,
  onSaved,
}: {
  receipt?: Receipt;
  vehicles?: string[];
  files?: File[];
  reduced: boolean;
  onClose: () => void;
  onSaved?: (message: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const { data: user } = useSession();
  const { data: lookups } = useLookups();
  const save = useSaveReceipt();
  const isNew = !receipt;
  const [vehicles, setVehicles] = useState<string[]>(
    receipt?.vehicles.map((v) => v.serial) ?? initialVehicles,
  );
  const [values, setValues] = useState({
    kind: (receipt?.kind ?? 'RECEIPT') as DocumentKind,
    date: receipt ? localDay(new Date(receipt.date)) : localDay(new Date()),
    vendor: receipt?.vendor ?? '',
    amount: receipt?.amount === null || !receipt ? '' : String(receipt.amount),
    category: receipt?.category ?? '',
    notes: receipt?.notes ?? '',
  });
  const [linked, setLinked] = useState(receipt?.linked ?? null);
  const [files, setFiles] = useState<File[]>(initialFiles);
  const [perFile, setPerFile] = useState(true);
  const [errors, setErrors] = useState<Errors>({});
  const [failed, setFailed] = useState<string | null>(null);
  const suggesting = !!user && !hasRole(user.role, 'EDITOR');

  const set = (k: keyof typeof values, v: string) => {
    setValues((s) => ({ ...s, [k]: v }));
    setErrors(({ [k]: _gone, ...rest }) => rest);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFailed(null);
    const body: ReceiptBody = {
      vehicles,
      kind: values.kind,
      date: values.date,
      vendor: values.vendor,
      amount: values.amount === '' ? null : Number(values.amount),
      category: values.category || null,
      linked: vehicles.length === 1 ? linked : null,
      notes: values.notes,
    };
    const parsed = receiptBody.safeParse(body);
    if (!parsed.success) {
      setErrors(
        issuesToErrors(parsed.error.issues, (f) =>
          f === 'vehicles' ? vehicles.length === 0 : values[f as keyof typeof values] === '',
        ),
      );
      return;
    }
    try {
      // One receipt per file, or all the files on one receipt.
      const batches = isNew && perFile && files.length > 1 ? files.map((f) => [f]) : [files];
      for (const batch of batches) await save.mutateAsync({ id: receipt?.id, body, files: batch });
      onSaved?.(
        t(suggesting ? 'receipts.suggestedSaved' : 'receipts.saved', { count: batches.length }),
      );
      onClose();
    } catch (err) {
      setFailed(
        err instanceof ApiError && err.status === 403
          ? 'records.error.forbidden'
          : err instanceof ApiError && err.status === 413
            ? 'records.error.fileTooBig'
            : 'records.error.save',
      );
    }
  };

  const title = t(isNew ? 'receipts.addTitle' : 'receipts.editTitle');
  return (
    <Sheet
      title={title}
      onClose={onClose}
      reduced={reduced}
      footer={
        <div className="flex items-center gap-2">
          {failed && (
            <p role="alert" className="text-bad me-auto text-xs">
              {t(failed as never)}
            </p>
          )}
          <Button variant="ghost" className="ms-auto" type="button" onClick={onClose}>
            {t('records.cancel')}
          </Button>
          <Button
            type="submit"
            form="receipt-form"
            disabled={save.isPending}
            data-testid="receipt-save"
          >
            {suggesting ? t('receipts.suggest') : t('records.save')}
          </Button>
        </div>
      }
    >
      <form id="receipt-form" noValidate onSubmit={submit} className="space-y-4">
        {suggesting && isNew && (
          <p className="bg-warn/10 text-warn rounded-lg px-3 py-2 text-xs">
            {t('receipts.suggestHint')}
          </p>
        )}
        <fieldset className="space-y-2">
          <legend className="mb-1 text-xs font-medium">{t('records.files')}</legend>
          {receipt && (
            <AttachmentList serial="" items={receipt.attachments} canEdit={receipt.canEdit} />
          )}
          <FilePicker files={files} onChange={setFiles} busy={save.isPending} />
          {isNew && files.length > 1 && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={perFile}
                onChange={(e) => setPerFile(e.target.checked)}
                className="size-4 accent-[var(--fh-accent)]"
              />
              {t('receipts.perFile', { count: files.length })}
            </label>
          )}
        </fieldset>
        <VehiclePicker
          label={t('receipts.vehicles')}
          value={vehicles}
          onChange={(v) => {
            setVehicles(v);
            setErrors(({ vehicles: _gone, ...rest }) => rest);
          }}
          invalid={!!errors.vehicles}
        />
        {errors.vehicles && <p className="text-bad -mt-2 text-xs">{t(errors.vehicles as never)}</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Labeled id="receipt-date" label={t('records.col.date')} required error={errors.date}>
            <input
              {...errorProps(ID.date, errors.date)}
              type="date"
              className={cn(INPUT, 'num')}
              value={values.date}
              onChange={(e) => set('date', e.target.value)}
            />
          </Labeled>
          <Labeled id="receipt-amount" label={t('receipts.amount')} error={errors.amount}>
            <input
              {...errorProps(ID.amount, errors.amount)}
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              className={cn(INPUT, 'num')}
              value={values.amount}
              onChange={(e) => set('amount', e.target.value)}
              data-testid="receipt-amount"
            />
          </Labeled>
          <Labeled id="receipt-vendor" label={t('records.col.vendor')} error={errors.vendor}>
            <input
              {...errorProps(ID.vendor, errors.vendor)}
              className={INPUT}
              maxLength={120}
              value={values.vendor}
              onChange={(e) => set('vendor', e.target.value)}
              data-testid="receipt-vendor"
            />
          </Labeled>
          <Labeled id="receipt-category" label={t('records.col.category')} error={errors.category}>
            <select
              {...errorProps(ID.category, errors.category)}
              className={INPUT}
              value={values.category}
              onChange={(e) => set('category', e.target.value)}
              data-testid="receipt-category"
            >
              <option value="">{t('records.choose')}</option>
              {lookups?.receiptCategories.map((c) => (
                <option key={c.code} value={c.code}>
                  {lookupName(c, i18n.language)}
                </option>
              ))}
            </select>
          </Labeled>
          <Labeled id="receipt-kind" label={t('records.col.documentKind')}>
            <select
              id="receipt-kind"
              className={INPUT}
              value={values.kind}
              onChange={(e) => set('kind', e.target.value)}
            >
              {DOCUMENT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`records.documentKind.${k}`)}
                </option>
              ))}
            </select>
          </Labeled>
        </div>
        {vehicles.length === 1 && (
          <LinkedRecord serial={vehicles[0]!} value={linked} onChange={setLinked} />
        )}
        <Labeled id="receipt-notes" label={t('records.col.notes')} error={errors.notes}>
          <textarea
            {...errorProps(ID.notes, errors.notes)}
            rows={2}
            maxLength={500}
            className={cn(INPUT, 'h-auto py-2')}
            value={values.notes}
            onChange={(e) => set('notes', e.target.value)}
          />
        </Labeled>
      </form>
    </Sheet>
  );
}
