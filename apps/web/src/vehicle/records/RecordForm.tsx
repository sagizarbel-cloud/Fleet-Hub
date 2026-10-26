import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { RECORD_BODIES, type RecordKind, type UsageUnit } from '@fleet-hub/shared';
import { Sheet } from '@/components/Sheet';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useQueryClient } from '@tanstack/react-query';
import { refreshAfterWrite, uploadFiles, useSaveRecord, type RecordRow } from './api';
import { AttachmentList, FilePicker } from './Attachments';
import { useFormatCtx } from './format';
import { fieldOfPath, KIND_UI, toBody, toForm, type Field, type FormValues } from './kinds';

type Errors = Record<string, string>;

/** Turns a schema or server issue into a message key for its field. */
function issueMessage(issue: { code: string; message?: string }, empty: boolean) {
  if (empty) return 'records.error.required';
  switch (issue.message) {
    case 'future':
    case 'before_reported':
    case 'before_date':
    case 'same':
      return `records.error.${issue.message}`;
  }
  if (issue.code === 'too_small') return 'records.error.tooSmall';
  if (issue.code === 'too_big') return 'records.error.tooBig';
  return 'records.error.invalid';
}

export function RecordForm({
  serial,
  kind,
  unit,
  location,
  row,
  canEdit,
  reduced,
  onClose,
  onSaved,
}: {
  serial: string;
  kind: RecordKind;
  unit: UsageUnit;
  location: string | null;
  /** The record being edited; absent when adding. */
  row?: RecordRow;
  canEdit: boolean;
  reduced: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const { t } = useTranslation();
  const ctx = useFormatCtx(unit);
  const ui = KIND_UI[kind];
  const isNew = !row;
  const [values, setValues] = useState<FormValues>(() =>
    row ? toForm(kind, row, unit) : ui.defaults({ unit, location }),
  );
  const [errors, setErrors] = useState<Errors>({});
  const [files, setFiles] = useState<File[]>([]);
  const [failed, setFailed] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  // Set once a new record is saved, so a retry after a failed upload doesn't add it twice.
  const [savedId, setSavedId] = useState<string | null>(null);
  const save = useSaveRecord(serial, kind);
  const qc = useQueryClient();

  const set = (key: string, value: string | boolean) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors(({ [key]: _gone, ...rest }) => rest);
  };
  const visible = ui.fields.filter((f) => (!f.createOnly || isNew) && (!f.when || f.when(values)));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFailed(null);
    const body = toBody(kind, values, unit, isNew);
    // The same rules the server applies, so mistakes show by the field before saving.
    const parsed = RECORD_BODIES[kind].safeParse(body);
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const field = fieldOfPath(issue.path.join('.'));
        const raw = values[field];
        next[field] ??= issueMessage(issue, raw === '' || raw === undefined);
      }
      setErrors(next);
      return;
    }
    try {
      const { item } = await save.mutateAsync({ id: row?.id ?? savedId ?? undefined, body });
      setSavedId(item.id);
      if (files.length) {
        setUploading(true);
        try {
          await uploadFiles(ui.ownerType, item.id, files);
          await refreshAfterWrite(qc, serial);
        } catch (err) {
          setUploading(false);
          // The record is saved; only the files failed. Keep the sheet open on the saved record.
          setFailed(
            err instanceof ApiError && err.status === 413
              ? 'records.error.fileTooBig'
              : err instanceof ApiError && err.status === 415
                ? 'records.error.fileType'
                : 'records.error.upload',
          );
          return;
        }
      }
      onSaved(t(isNew ? 'records.added' : 'records.saved'));
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) setFailed('records.error.forbidden');
      else setFailed('records.error.save');
    }
  };

  const title = t(isNew ? 'records.addTitle' : 'records.editTitle', {
    record: t(`vehicle.records.one.${kind}`),
  });

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
          <Button variant="ghost" className="ms-auto" onClick={onClose} type="button">
            {t('records.cancel')}
          </Button>
          <Button type="submit" form="record-form" disabled={save.isPending || uploading}>
            {t('records.save')}
          </Button>
        </div>
      }
    >
      <form id="record-form" noValidate onSubmit={submit} className="space-y-4" data-kind={kind}>
        {visible.map((f) => (
          <FieldInput
            key={f.key}
            field={f}
            value={values[f.key]}
            error={errors[f.key]}
            unit={unit}
            options={f.options?.(ctx)}
            onChange={(v) => set(f.key, v)}
          />
        ))}
        <fieldset className="space-y-2">
          <legend className="mb-1 text-xs font-medium">{t('records.files')}</legend>
          {row && <AttachmentList serial={serial} items={row.attachments} canEdit={canEdit} />}
          <FilePicker files={files} onChange={setFiles} busy={uploading} />
        </fieldset>
      </form>
    </Sheet>
  );
}

const INPUT =
  'border-border-strong bg-surface w-full rounded-md border px-2.5 text-sm focus-visible:outline-2 focus-visible:outline-[var(--fh-accent)]';

function FieldInput({
  field,
  value,
  error,
  unit,
  options,
  onChange,
}: {
  field: Field;
  value: string | boolean | undefined;
  error: string | undefined;
  unit: UsageUnit;
  options?: { value: string; label: string }[];
  onChange: (value: string | boolean) => void;
}) {
  const { t } = useTranslation();
  const id = `field-${field.key}`;
  const label =
    field.type === 'reading'
      ? t(field.label as never, { unit: t(`vehicle.info.usage_${unit}`) })
      : t(field.label as never);
  const described = [error && `${id}-error`, field.hint && `${id}-hint`].filter(Boolean).join(' ');
  const common = {
    id,
    name: field.key,
    'aria-invalid': !!error || undefined,
    'aria-describedby': described || undefined,
    'aria-required': field.required || undefined,
  };

  if (field.type === 'bool') {
    return (
      <label className="flex items-center gap-2 text-sm">
        <input
          {...common}
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
          className="accent-[var(--fh-accent)] size-4"
        />
        {label}
      </label>
    );
  }

  const str = typeof value === 'string' ? value : '';
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-xs font-medium">
        {label}
        {field.required && (
          <span aria-hidden className="text-bad ms-0.5">
            *
          </span>
        )}
      </label>
      {field.type === 'textarea' ? (
        <textarea
          {...common}
          rows={3}
          value={str}
          onChange={(e) => onChange(e.target.value)}
          className={cn(INPUT, 'py-2')}
        />
      ) : field.type === 'select' ? (
        <select
          {...common}
          value={str}
          onChange={(e) => onChange(e.target.value)}
          className={cn(INPUT, 'h-9')}
        >
          <option value="">{t('records.choose')}</option>
          {options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          {...common}
          type={field.type === 'date' ? 'date' : field.type === 'text' ? 'text' : 'number'}
          inputMode={
            field.type === 'money' || field.step
              ? 'decimal'
              : field.type === 'text'
                ? undefined
                : 'numeric'
          }
          step={
            field.type === 'money'
              ? '0.01'
              : field.step
                ? '0.1'
                : field.type === 'date'
                  ? undefined
                  : '1'
          }
          min={field.type === 'date' || field.type === 'text' ? undefined : 0}
          value={str}
          onChange={(e) => onChange(e.target.value)}
          className={cn(INPUT, 'h-9', field.type !== 'text' && 'num')}
        />
      )}
      {field.hint && !error && (
        <p id={`${id}-hint`} className="text-muted text-xs">
          {t(field.hint as never)}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-bad text-xs">
          {t(error as never)}
        </p>
      )}
    </div>
  );
}
