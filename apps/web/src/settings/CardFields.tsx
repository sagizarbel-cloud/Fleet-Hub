import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Plus, Trash2, X } from 'lucide-react';
import {
  CUSTOM_FIELD_KEYS,
  CUSTOM_FIELD_TYPES,
  customFieldList,
  EDIT_LEVELS,
  RECORD_KINDS,
  type CustomFieldDef,
  type RecordKind,
} from '@fleet-hub/shared';
import { Button } from '@/components/ui/button';
import { useAppSettings, useSaveAppSettings } from '@/vehicle/records/api';
import { Panel } from './MySettings';

const INPUT =
  'border-border-strong bg-surface h-9 w-full rounded-md border px-2.5 text-sm focus-visible:outline-2 focus-visible:outline-[var(--fh-accent)] disabled:opacity-60';

/** Makes a code for a new list choice from its English name, unique within the field. */
function codeFor(name: string, taken: string[]) {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 30) || 'option';
  let code = base;
  for (let i = 2; taken.includes(code); i++) code = `${base}_${i}`;
  return code;
}

/**
 * The extra fields of one card (Revisions 1 for location changes; every card since Sagi's
 * 2026-11-22 list), each named by an admin in English and Hebrew: text, a number, a date or a
 * list of choices. One may be the card's header (it leads the table and names each record), and
 * one may be limited to admins. They show in the form, the table, the report and the exports.
 */
export function CardFields({ kind, onSaved }: { kind: RecordKind; onSaved?: () => void }) {
  const { t } = useTranslation();
  const settings = useAppSettings();
  const save = useSaveAppSettings();
  // Unsaved edits; until the first one, the saved fields show.
  const [draft, setDraft] = useState<CustomFieldDef[] | null>(null);
  const [invalid, setInvalid] = useState(false);
  const rows = draft ?? settings.data?.recordFields[kind] ?? [];
  const setRows = (fn: (r: CustomFieldDef[]) => CustomFieldDef[]) => setDraft(fn(rows));

  const update = (i: number, patch: Partial<CustomFieldDef>) =>
    setRows((r) =>
      r.map((row, j) =>
        j === i
          ? { ...row, ...patch }
          : // Only one header per card.
            patch.header
            ? { ...row, header: false }
            : row,
      ),
    );
  const add = () => {
    const key = CUSTOM_FIELD_KEYS.find((k) => !rows.some((r) => r.key === k));
    if (key) setRows((r) => [...r, { key, labelEn: '', labelHe: '', type: 'text' }]);
  };
  const submit = () => {
    if (!settings.data) return;
    // Choices get their codes from their English names; blank ones are dropped.
    const clean = rows.map((r) => {
      if (r.type !== 'list') {
        const { options: _o, ...rest } = r;
        return rest;
      }
      const taken: string[] = [];
      const options = (r.options ?? [])
        .filter((o) => o.labelEn.trim() || o.labelHe.trim())
        .map((o) => {
          const code = o.code || codeFor(o.labelEn, taken);
          taken.push(code);
          return { ...o, code };
        });
      return { ...r, options };
    });
    const ok = customFieldList.safeParse(clean).success;
    setInvalid(!ok);
    if (!ok) return;
    save.mutate(
      { ...settings.data, recordFields: { ...settings.data.recordFields, [kind]: clean } },
      {
        onSuccess: () => {
          setDraft(null);
          onSaved?.();
        },
      },
    );
  };

  if (settings.isPlaceholderData)
    return <Loader2 aria-hidden className="text-muted size-5 animate-spin" />;

  return (
    <div className="space-y-3" data-testid={`card-fields-${kind}`}>
      {rows.length === 0 && <p className="text-muted text-sm">{t('settings.extra.none')}</p>}
      {rows.map((row, i) => (
        <fieldset
          key={row.key}
          className="border-border space-y-2 rounded-lg border p-3"
          data-extra={row.key}
        >
          <legend className="sr-only">{t('settings.extra.field', { n: i + 1 })}</legend>
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_9rem_auto] sm:items-end">
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
                onChange={(e) => {
                  const type = e.target.value as CustomFieldDef['type'];
                  update(i, {
                    type,
                    options:
                      type === 'list' && !row.options?.length
                        ? [{ code: '', labelEn: '', labelHe: '' }]
                        : row.options,
                  });
                }}
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
          </div>
          {row.type === 'list' && (
            <div className="space-y-1.5" data-testid="field-options">
              <p className="text-xs font-medium">{t('settings.extra.options')}</p>
              {(row.options ?? []).map((o, j) => (
                <div key={j} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                  <input
                    dir="ltr"
                    lang="en"
                    value={o.labelEn}
                    maxLength={60}
                    aria-label={t('settings.extra.optionEn', { n: j + 1 })}
                    placeholder={t('settings.extra.labelEn')}
                    onChange={(e) =>
                      update(i, {
                        options: row.options!.map((x, k) =>
                          k === j ? { ...x, labelEn: e.target.value } : x,
                        ),
                      })
                    }
                    className={INPUT}
                  />
                  <input
                    dir="rtl"
                    lang="he"
                    value={o.labelHe}
                    maxLength={60}
                    aria-label={t('settings.extra.optionHe', { n: j + 1 })}
                    placeholder={t('settings.extra.labelHe')}
                    onChange={(e) =>
                      update(i, {
                        options: row.options!.map((x, k) =>
                          k === j ? { ...x, labelHe: e.target.value } : x,
                        ),
                      })
                    }
                    className={INPUT}
                  />
                  <button
                    type="button"
                    onClick={() => update(i, { options: row.options!.filter((_, k) => k !== j) })}
                    aria-label={t('settings.extra.removeOption')}
                    title={t('settings.extra.removeOption')}
                    className="text-muted hover:text-bad grid size-9 place-items-center rounded-md"
                  >
                    <X aria-hidden className="size-4" />
                  </button>
                </div>
              ))}
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() =>
                  update(i, {
                    options: [...(row.options ?? []), { code: '', labelEn: '', labelHe: '' }],
                  })
                }
              >
                <Plus aria-hidden />
                {t('settings.extra.addOption')}
              </Button>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={!!row.header}
                onChange={(e) => update(i, { header: e.target.checked })}
                className="accent-[var(--fh-accent)] size-4"
              />
              {t('settings.extra.header')}
            </label>
            <label className="flex items-center gap-2">
              <span>{t('settings.extra.whoFills')}</span>
              <select
                value={row.editLevel ?? ''}
                onChange={(e) =>
                  update(i, {
                    editLevel: (e.target.value || undefined) as CustomFieldDef['editLevel'],
                  })
                }
                className="border-border-strong bg-surface h-8 rounded-md border px-2"
              >
                <option value="">{t('settings.extra.likeCard')}</option>
                {EDIT_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {t(`permissions.level.${l}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </fieldset>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        {rows.length < CUSTOM_FIELD_KEYS.length && (
          <Button variant="outline" size="sm" onClick={add} type="button" data-testid="add-extra">
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
            : save.isSuccess && !draft
              ? t('settings.required.saved')
              : t('settings.extra.note')}
      </p>
    </div>
  );
}

/** Settings → Record fields: pick a card, then edit its extra fields. */
export function CardFieldsSettings() {
  const { t } = useTranslation();
  const [kind, setKind] = useState<RecordKind>('service');
  return (
    <Panel title={t('settings.extra.title')} hint={t('settings.extra.hint')}>
      <label className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">{t('settings.extra.card')}</span>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as RecordKind)}
          className="border-border-strong bg-surface h-9 rounded-md border px-2.5"
          data-testid="extra-card"
        >
          {RECORD_KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`vehicle.records.${k}`)}
            </option>
          ))}
        </select>
      </label>
      <CardFields key={kind} kind={kind} />
    </Panel>
  );
}
