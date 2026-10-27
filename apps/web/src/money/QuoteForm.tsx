import { useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import {
  LINE_CONDITIONS,
  QUOTE_VISIBILITIES,
  quoteBody,
  type LineCondition,
  type QuoteBody,
  type QuoteVisibility,
} from '@fleet-hub/shared';
import { useSession } from '@/auth/session';
import { Sheet } from '@/components/Sheet';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { AttachmentList, FilePicker } from '@/vehicle/records/Attachments';
import { useFormatCtx } from '@/vehicle/records/format';
import { localDay } from '@/vehicle/records/kinds';
import { useSaveQuote, useSuppliers, type Quote } from './api';
import { errorProps, INPUT, issuesToErrors, Labeled, type Errors } from './form';
import { VehiclePicker } from './VehiclePicker';

const F = {
  item: 'item',
  partNo: 'partNo',
  condition: 'condition',
  quantity: 'quantity',
  unitPrice: 'unitPrice',
} as const;
type LineField = (typeof F)[keyof typeof F];

interface LineValues {
  key: number;
  item: string;
  partNo: string;
  condition: LineCondition;
  quantity: string;
  unitPrice: string;
}

let lineSeq = 0;
const emptyLine = (): LineValues => ({
  key: ++lineSeq,
  item: '',
  partNo: '',
  condition: 'NEW',
  quantity: '1',
  unitPrice: '',
});

const ID = {
  date: 'quote-date',
  notes: 'quote-notes',
  supplier: 'quote-supplier',
  valid: 'quote-valid',
} as const;

/** Add or edit a price quote: supplier, dates, line items, vehicles and its PDF (SPEC 5.6). */
export function QuoteForm({
  quote,
  vehicles: initialVehicles = [],
  reduced,
  onClose,
  onSaved,
}: {
  quote?: Quote;
  vehicles?: string[];
  reduced: boolean;
  onClose: () => void;
  onSaved?: (q: Quote) => void;
}) {
  const { t } = useTranslation();
  const { data: user } = useSession();
  const suppliers = useSuppliers();
  const save = useSaveQuote();
  const ctx = useFormatCtx('KM');
  const listId = useId();
  const isAdmin = user?.role === 'ADMIN';
  const [values, setValues] = useState({
    supplier: quote?.supplier.name ?? '',
    date: localDay(quote ? new Date(quote.date) : new Date()),
    validUntil: quote?.validUntil ? localDay(new Date(quote.validUntil)) : '',
    notes: quote?.notes ?? '',
  });
  const [visibility, setVisibility] = useState<QuoteVisibility>(quote?.visibility ?? 'STANDARD');
  const [lines, setLines] = useState<LineValues[]>(
    quote?.lines.map((l) => ({
      key: ++lineSeq,
      item: l.item,
      partNo: l.partNo ?? '',
      condition: l.condition,
      quantity: String(l.quantity),
      unitPrice: String(l.unitPrice),
    })) ?? [emptyLine()],
  );
  const [vehicles, setVehicles] = useState<string[]>(
    quote?.vehicles.map((v) => v.serial) ?? initialVehicles,
  );
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<Errors>({});
  const [failed, setFailed] = useState<string | null>(null);

  const set = (k: keyof typeof values, v: string) => {
    setValues((s) => ({ ...s, [k]: v }));
    setErrors(({ [k]: _gone, ...rest }) => rest);
  };
  const setLine = (i: number, patch: Partial<LineValues>) => {
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
    setErrors((e) =>
      Object.fromEntries(Object.entries(e).filter(([k]) => !k.startsWith(`lines.${i}.`))),
    );
  };
  const lineTotal = (l: LineValues) => (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0);
  const total = lines.reduce((s, l) => s + lineTotal(l), 0);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFailed(null);
    const known = suppliers.data?.items.find(
      (s) => s.name.toLowerCase() === values.supplier.trim().toLowerCase(),
    );
    const body: QuoteBody = {
      supplier: known ? { id: known.id } : { name: values.supplier },
      date: values.date,
      validUntil: values.validUntil || null,
      notes: values.notes,
      lines: lines.map((l) => ({
        item: l.item,
        partNo: l.partNo,
        condition: l.condition,
        quantity: l.quantity === '' ? Number.NaN : Number(l.quantity),
        unitPrice: l.unitPrice === '' ? Number.NaN : Number(l.unitPrice),
      })),
      vehicles,
      ...(isAdmin ? { visibility } : {}),
    };
    const parsed = quoteBody.safeParse(body);
    if (!parsed.success) {
      setErrors(
        issuesToErrors(
          parsed.error.issues.map((i) => ({
            ...i,
            // "supplier.name" is the supplier field.
            path: i.path[0] === 'supplier' ? ['supplier'] : i.path,
          })),
          (f) => {
            const [head, idx, key] = f.split('.');
            if (head === 'lines' && key) {
              return lines[Number(idx)]?.[key as keyof LineValues] === '';
            }
            return values[head as keyof typeof values] === '';
          },
          { before_date: 'quotes.error.validUntil' },
        ),
      );
      return;
    }
    try {
      const saved = await save.mutateAsync({ id: quote?.id, body, files });
      onSaved?.(saved);
      onClose();
    } catch (err) {
      setFailed(
        err instanceof ApiError && err.status === 403
          ? 'records.error.forbidden'
          : 'records.error.save',
      );
    }
  };

  return (
    <Sheet
      title={t(quote ? 'quotes.editTitle' : 'quotes.addTitle')}
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
            form="quote-form"
            disabled={save.isPending}
            data-testid="quote-save"
          >
            {t('records.save')}
          </Button>
        </div>
      }
    >
      <form id="quote-form" noValidate onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Labeled
            id="quote-supplier"
            label={t('records.col.supplier')}
            required
            error={errors.supplier}
            className="sm:col-span-2"
            hint={t('quotes.supplierHint')}
          >
            <input
              {...errorProps(ID.supplier, errors.supplier)}
              className={INPUT}
              list={listId}
              maxLength={120}
              value={values.supplier}
              onChange={(e) => set('supplier', e.target.value)}
              data-testid="quote-supplier"
            />
            <datalist id={listId}>
              {suppliers.data?.items.map((s) => (
                <option key={s.id} value={s.name} />
              ))}
            </datalist>
          </Labeled>
          <Labeled id="quote-date" label={t('records.col.date')} required error={errors.date}>
            <input
              {...errorProps(ID.date, errors.date)}
              type="date"
              className={cn(INPUT, 'num')}
              value={values.date}
              onChange={(e) => set('date', e.target.value)}
            />
          </Labeled>
          <Labeled id="quote-valid" label={t('records.col.validUntil')} error={errors.validUntil}>
            <input
              {...errorProps(ID.valid, errors.validUntil)}
              type="date"
              className={cn(INPUT, 'num')}
              value={values.validUntil}
              onChange={(e) => set('validUntil', e.target.value)}
            />
          </Labeled>
        </div>

        <fieldset className="space-y-2">
          <legend className="mb-1 text-xs font-medium">{t('quotes.lines')}</legend>
          {errors.lines && <p className="text-bad text-xs">{t(errors.lines as never)}</p>}
          <ol className="space-y-3">
            {lines.map((l, i) => {
              const err = (k: LineField) => errors[`lines.${i}.${k}`];
              const id = (k: LineField) => `line-${l.key}-${k}`;
              return (
                <li
                  key={l.key}
                  className="border-border grid grid-cols-2 gap-2 rounded-lg border p-2 sm:grid-cols-[2fr_1.2fr_1.3fr_0.7fr_1fr_auto]"
                  data-testid="quote-line"
                >
                  <Labeled
                    id={id(F.item)}
                    label={t('quotes.item')}
                    required
                    error={err(F.item)}
                    className="col-span-2 sm:col-span-1"
                  >
                    <input
                      {...errorProps(id(F.item), err(F.item))}
                      className={INPUT}
                      maxLength={120}
                      value={l.item}
                      onChange={(e) => setLine(i, { item: e.target.value })}
                      data-testid="line-item"
                    />
                  </Labeled>
                  <Labeled id={id(F.partNo)} label={t('quotes.partNo')} error={err(F.partNo)}>
                    <input
                      {...errorProps(id(F.partNo), err(F.partNo))}
                      dir="ltr"
                      className={cn(INPUT, 'num')}
                      maxLength={60}
                      value={l.partNo}
                      onChange={(e) => setLine(i, { partNo: e.target.value })}
                      data-testid="line-partno"
                    />
                  </Labeled>
                  <Labeled id={id(F.condition)} label={t('quotes.condition')}>
                    <select
                      id={id(F.condition)}
                      className={INPUT}
                      value={l.condition}
                      onChange={(e) => setLine(i, { condition: e.target.value as LineCondition })}
                    >
                      {LINE_CONDITIONS.map((c) => (
                        <option key={c} value={c}>
                          {t(`quotes.conditions.${c}`)}
                        </option>
                      ))}
                    </select>
                  </Labeled>
                  <Labeled
                    id={id(F.quantity)}
                    label={t('quotes.quantity')}
                    required
                    error={err(F.quantity)}
                  >
                    <input
                      {...errorProps(id(F.quantity), err(F.quantity))}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      step={1}
                      className={cn(INPUT, 'num')}
                      value={l.quantity}
                      onChange={(e) => setLine(i, { quantity: e.target.value })}
                      data-testid="line-qty"
                    />
                  </Labeled>
                  <Labeled
                    id={id(F.unitPrice)}
                    label={t('quotes.unitPrice')}
                    required
                    error={err(F.unitPrice)}
                  >
                    <input
                      {...errorProps(id(F.unitPrice), err(F.unitPrice))}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      className={cn(INPUT, 'num')}
                      value={l.unitPrice}
                      onChange={(e) => setLine(i, { unitPrice: e.target.value })}
                      data-testid="line-price"
                    />
                  </Labeled>
                  <div className="flex items-end justify-between gap-2 sm:flex-col sm:items-end">
                    <span className="num text-muted pb-2 text-xs">{ctx.money(lineTotal(l))}</span>
                    <button
                      type="button"
                      disabled={lines.length === 1}
                      onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
                      className="text-muted hover:text-bad grid size-9 place-items-center rounded-md disabled:opacity-30"
                      aria-label={t('quotes.removeLine', { n: i + 1 })}
                      title={t('quotes.removeLine', { n: i + 1 })}
                    >
                      <Trash2 aria-hidden className="size-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={lines.length >= 100}
              onClick={() => setLines((ls) => [...ls, emptyLine()])}
              data-testid="add-line"
            >
              <Plus aria-hidden />
              {t('quotes.addLine')}
            </Button>
            <p className="text-sm">
              <span className="text-muted me-2">{t('records.col.total')}</span>
              <span className="num font-semibold" data-testid="quote-form-total">
                {ctx.money(total)}
              </span>
            </p>
          </div>
        </fieldset>

        <VehiclePicker label={t('quotes.vehicles')} value={vehicles} onChange={setVehicles} />

        {isAdmin && (
          <Labeled id="quote-visibility" label={t('quotes.visibility')}>
            <select
              id="quote-visibility"
              className={INPUT}
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as QuoteVisibility)}
            >
              {QUOTE_VISIBILITIES.map((v) => (
                <option key={v} value={v}>
                  {t(`quotes.levels.${v}`)} · {t(`quotes.levelHint.${v}`)}
                </option>
              ))}
            </select>
          </Labeled>
        )}

        <Labeled id="quote-notes" label={t('records.col.notes')} error={errors.notes}>
          <textarea
            {...errorProps(ID.notes, errors.notes)}
            rows={2}
            maxLength={1000}
            className={cn(INPUT, 'h-auto py-2')}
            value={values.notes}
            onChange={(e) => set('notes', e.target.value)}
          />
        </Labeled>
        <fieldset className="space-y-2">
          <legend className="mb-1 text-xs font-medium">{t('quotes.file')}</legend>
          {quote && <AttachmentList serial="" items={quote.attachments} canEdit={quote.canEdit} />}
          <FilePicker files={files} onChange={setFiles} busy={save.isPending} />
        </fieldset>
      </form>
    </Sheet>
  );
}
