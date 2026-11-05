import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import {
  CUSTOM_FIELD_KEYS,
  CUSTOM_FIELD_TYPES,
  customFieldDef,
  type CustomFieldDef,
} from '@fleet-hub/shared';
import { Button } from '@/components/ui/button';
import { useAppSettings, useSaveAppSettings } from '@/vehicle/records/api';
import { Panel } from './MySettings';

const INPUT =
  'border-border-strong bg-surface h-9 w-full rounded-md border px-2.5 text-sm focus-visible:outline-2 focus-visible:outline-[var(--fh-accent)]';

/**
 * Up to three extra fields on location changes (Revisions 1, fleet manager), named by an admin
 * in English and Hebrew. They show in the form, the table, the report and the exports.
 */
export function MovementFields() {
  const { t } = useTranslation();
  const settings = useAppSettings();
  const save = useSaveAppSettings();
  // Unsaved edits; until the first one, the saved fields show.
  const [draft, setDraft] = useState<CustomFieldDef[] | null>(null);
  const [invalid, setInvalid] = useState(false);
  const rows = draft ?? settings.data?.movementFields ?? [];
  const setRows = (fn: (r: CustomFieldDef[]) => CustomFieldDef[]) => setDraft(fn(rows));

  const update = (i: number, patch: Partial<CustomFieldDef>) =>
    setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  const add = () => {
    const key = CUSTOM_FIELD_KEYS.find((k) => !rows.some((r) => r.key === k));
    if (key) setRows((r) => [...r, { key, labelEn: '', labelHe: '', type: 'text' }]);
  };
  const submit = () => {
    if (!settings.data) return;
    const ok = rows.every((r) => customFieldDef.safeParse(r).success);
    setInvalid(!ok);
    if (ok) save.mutate({ ...settings.data, movementFields: rows });
  };

  return (
    <Panel title={t('settings.extra.title')} hint={t('settings.extra.hint')}>
      {settings.isPlaceholderData ? (
        <Loader2 aria-hidden className="text-muted size-5 animate-spin" />
      ) : (
        <div className="space-y-3" data-testid="movement-fields">
          {rows.length === 0 && <p className="text-muted text-sm">{t('settings.extra.none')}</p>}
          {rows.map((row, i) => (
            <fieldset
              key={row.key}
              className="border-border grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_9rem_auto] sm:items-end"
              data-extra={row.key}
            >
              <legend className="sr-only">{t('settings.extra.field', { n: i + 1 })}</legend>
              <label className="space-y-1 text-xs">
                <span className="font-medium">{t('settings.extra.labelEn')}</span>
                <input
                  dir="ltr"
                  lang="en"
                  value={row.labelEn}
                  maxLength={40}
                  onChange={(e) => update(i, { labelEn: e.target.value })}
                  className={INPUT}
                />
              </label>
              <label className="space-y-1 text-xs">
                <span className="font-medium">{t('settings.extra.labelHe')}</span>
                <input
                  dir="rtl"
                  lang="he"
                  value={row.labelHe}
                  maxLength={40}
                  onChange={(e) => update(i, { labelHe: e.target.value })}
                  className={INPUT}
                />
              </label>
              <label className="space-y-1 text-xs">
                <span className="font-medium">{t('settings.extra.type')}</span>
                <select
                  value={row.type}
                  onChange={(e) => update(i, { type: e.target.value as CustomFieldDef['type'] })}
                  className={INPUT}
                >
                  {CUSTOM_FIELD_TYPES.map((ty) => (
                    <option key={ty} value={ty}>
                      {t(`settings.extra.types.${ty}`)}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => setRows((r) => r.filter((_, j) => j !== i))}
                aria-label={t('settings.extra.remove')}
                title={t('settings.extra.remove')}
                className="text-muted hover:text-bad grid size-9 place-items-center rounded-md"
              >
                <Trash2 aria-hidden className="size-4" />
              </button>
            </fieldset>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            {rows.length < CUSTOM_FIELD_KEYS.length && (
              <Button variant="outline" size="sm" onClick={add} type="button">
                <Plus aria-hidden />
                {t('settings.extra.add')}
              </Button>
            )}
            <Button
              size="sm"
              className="ms-auto"
              onClick={submit}
              disabled={save.isPending}
              type="button"
              data-testid="save-extra"
            >
              {t('records.save')}
            </Button>
          </div>
          <p className="text-muted min-h-5 text-xs" aria-live="polite">
            {invalid
              ? t('settings.extra.invalid')
              : save.isError
                ? t('settings.required.saveFailed')
                : save.isSuccess
                  ? t('settings.required.saved')
                  : t('settings.extra.note')}
          </p>
        </div>
      )}
    </Panel>
  );
}
