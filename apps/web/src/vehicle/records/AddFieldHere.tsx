import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import {
  CUSTOM_FIELD_KEYS,
  CUSTOM_FIELD_TYPES,
  customFieldList,
  type CustomFieldDef,
  type RecordKind,
} from '@fleet-hub/shared';
import { Button } from '@/components/ui/button';
import { codeFor } from '@/settings/CardFields';
import { useAppSettings, useSaveAppSettings } from './api';

const INPUT =
  'border-border-strong bg-surface h-9 w-full rounded-md border px-2.5 text-sm focus-visible:outline-2 focus-visible:outline-[var(--fh-accent)]';

/**
 * Admins add a field to this card right where it should sit in the form (Sagi, 2026-11-23), so
 * they see it among the others before saving. It goes in after `after`, in the table too.
 */
export function AddFieldHere({ kind, after }: { kind: RecordKind; after: string }) {
  const { t } = useTranslation();
  const { data: settings } = useAppSettings();
  const save = useSaveAppSettings();
  const [open, setOpen] = useState(false);
  const [labelEn, setLabelEn] = useState('');
  const [labelHe, setLabelHe] = useState('');
  const [type, setType] = useState<CustomFieldDef['type']>('text');
  const [choices, setChoices] = useState('');
  const [failed, setFailed] = useState<string | null>(null);
  const fields = settings?.recordFields[kind] ?? [];
  const key = CUSTOM_FIELD_KEYS.find((k) => !fields.some((f) => f.key === k));

  if (!key) return null;
  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="border-border-strong text-muted hover:text-text hover:border-accent flex w-full items-center justify-center gap-1 rounded-md border border-dashed py-1 text-xs"
        data-testid={`add-field-after-${after}`}
      >
        <Plus aria-hidden className="size-3.5" />
        {t('records.addField.here')}
      </button>
    );

  const submit = () => {
    if (!settings) return;
    const en = labelEn.trim() || labelHe.trim();
    const he = labelHe.trim() || labelEn.trim();
    const taken: string[] = [];
    const options =
      type === 'list'
        ? choices
            .split('\n')
            .map((c) => c.trim())
            .filter(Boolean)
            .map((c) => {
              const code = codeFor(c, taken);
              taken.push(code);
              return { code, labelEn: c, labelHe: c };
            })
        : undefined;
    const def: CustomFieldDef = { key, labelEn: en, labelHe: he, type, after, options };
    const next = [...fields, def];
    if (!en) return setFailed('records.addField.nameRequired');
    if (!customFieldList.safeParse(next).success) return setFailed('settings.extra.invalid');
    save.mutate(
      { ...settings, recordFields: { ...settings.recordFields, [kind]: next } },
      { onSuccess: () => setOpen(false), onError: () => setFailed('settings.required.saveFailed') },
    );
  };

  return (
    <fieldset
      className="border-accent space-y-2 rounded-lg border border-dashed p-2"
      data-testid="add-field-inline"
    >
      <legend className="px-1 text-xs font-medium">{t('records.addField.title')}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          dir="ltr"
          lang="en"
          maxLength={40}
          value={labelEn}
          autoFocus
          aria-label={t('settings.extra.labelEn')}
          placeholder={t('settings.extra.labelEn')}
          onChange={(e) => {
            setLabelEn(e.target.value);
            setFailed(null);
          }}
          className={INPUT}
        />
        <input
          dir="rtl"
          lang="he"
          maxLength={40}
          value={labelHe}
          aria-label={t('settings.extra.labelHe')}
          placeholder={t('settings.extra.labelHe')}
          onChange={(e) => {
            setLabelHe(e.target.value);
            setFailed(null);
          }}
          className={INPUT}
        />
      </div>
      <select
        value={type}
        aria-label={t('settings.extra.type')}
        onChange={(e) => setType(e.target.value as CustomFieldDef['type'])}
        className={INPUT}
      >
        {CUSTOM_FIELD_TYPES.map((ty) => (
          <option key={ty} value={ty}>
            {t(`settings.extra.types.${ty}`)}
          </option>
        ))}
      </select>
      {type === 'list' && (
        <textarea
          rows={3}
          value={choices}
          aria-label={t('records.addField.choices')}
          placeholder={t('records.addField.choices')}
          onChange={(e) => setChoices(e.target.value)}
          className={`${INPUT} h-auto py-2`}
        />
      )}
      <p className="text-muted text-xs">{t('records.addField.hint')}</p>
      {failed && (
        <p role="alert" className="text-bad text-xs">
          {t(failed as never)}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          onClick={submit}
          disabled={save.isPending}
          data-testid="add-field-save"
        >
          {t('records.addField.save')}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          {t('records.cancel')}
        </Button>
      </div>
    </fieldset>
  );
}
