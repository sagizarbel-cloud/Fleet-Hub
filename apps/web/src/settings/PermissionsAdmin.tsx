import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import {
  cardLevel,
  DEFAULT_CARD_LEVELS,
  EDIT_LEVELS,
  PERMISSION_CARDS,
  PERMISSION_FIELDS,
  RECORD_KINDS,
  type EditLevel,
  type PermissionCard,
  type PermissionField,
  type Permissions,
  type SettingChange,
} from '@fleet-hub/shared';
import { useDateFormat } from '@/fleet/FleetGrid';
import { api } from '@/lib/api';
import { localeOf } from '@/lib/intl';
import { useAppSettings, useSaveAppSettings } from '@/vehicle/records/api';
import { Panel } from './MySettings';

const SELECT =
  'border-border-strong bg-surface h-8 w-full rounded-md border px-2 text-sm sm:w-64 disabled:opacity-60';
const HISTORY_KEY = 'permissions';
const TIME: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };

const isRecordKind = (c: string) => (RECORD_KINDS as readonly string[]).includes(c);

/** The name of a card or vehicle field, in the active language. */
function useNames() {
  const { t } = useTranslation();
  return {
    card: (c: PermissionCard) =>
      isRecordKind(c) ? t(`vehicle.records.${c as 'notes'}`) : t(`permissions.card.${c as 'tool'}`),
    field: (f: PermissionField) => t(`vehicleForm.field.${f}`),
  };
}

/**
 * Who may edit what (Sagi, 2026-11-22): for each card of a vehicle page and each field of the
 * vehicle itself, viewers and up, editors and up, or admins only. Each change is saved at once
 * and kept in the history below, with who made it.
 */
export function PermissionsAdmin() {
  const { t } = useTranslation();
  const names = useNames();
  const settings = useAppSettings();
  const save = useSaveAppSettings();
  const qc = useQueryClient();
  const p = settings.data?.permissions;

  const set = (next: Permissions) => {
    if (!settings.data) return;
    save.mutate(
      { ...settings.data, permissions: next },
      { onSuccess: () => void qc.invalidateQueries({ queryKey: ['setting-history'] }) },
    );
  };
  const setCard = (c: PermissionCard, level: EditLevel) => {
    if (!p) return;
    const cards = { ...p.cards };
    if (level === DEFAULT_CARD_LEVELS[c]) delete cards[c];
    else cards[c] = level;
    set({ ...p, cards });
  };
  const setField = (f: PermissionField, level: EditLevel | '') => {
    if (!p) return;
    const fields = { ...p.fields };
    if (!level) delete fields[f];
    else fields[f] = level;
    set({ ...p, fields });
  };

  if (settings.isPlaceholderData || !p)
    return <Loader2 aria-hidden className="text-muted size-5 animate-spin" />;

  const levelOptions = EDIT_LEVELS.map((l) => (
    <option key={l} value={l}>
      {t(`permissions.level.${l}`)}
    </option>
  ));

  return (
    <div className="space-y-4">
      <Panel title={t('permissions.cardsTitle')} hint={t('permissions.cardsHint')}>
        <ul className="divide-border divide-y" data-testid="permission-cards">
          {PERMISSION_CARDS.map((c) => (
            <li
              key={c}
              className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between"
            >
              <label htmlFor={`perm-card-${c}`} className="text-sm">
                {names.card(c)}
              </label>
              <select
                id={`perm-card-${c}`}
                value={cardLevel(p, c)}
                disabled={save.isPending}
                onChange={(e) => setCard(c, e.target.value as EditLevel)}
                className={SELECT}
                data-testid={`perm-card-${c}`}
              >
                {levelOptions}
              </select>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title={t('permissions.fieldsTitle')} hint={t('permissions.fieldsHint')}>
        <ul className="divide-border divide-y" data-testid="permission-fields">
          {PERMISSION_FIELDS.map((f) => (
            <li
              key={f}
              className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between"
            >
              <label htmlFor={`perm-field-${f}`} className="text-sm">
                {names.field(f)}
              </label>
              <select
                id={`perm-field-${f}`}
                value={p.fields[f] ?? ''}
                disabled={save.isPending}
                onChange={(e) => setField(f, e.target.value as EditLevel | '')}
                className={SELECT}
                data-testid={`perm-field-${f}`}
              >
                <option value="">
                  {t('permissions.likeVehicle', {
                    level: t(`permissions.level.${cardLevel(p, 'vehicle')}`),
                  })}
                </option>
                {levelOptions}
              </select>
            </li>
          ))}
        </ul>
        <p className="text-muted min-h-5 text-xs" aria-live="polite">
          {save.isError
            ? t('settings.required.saveFailed')
            : save.isSuccess
              ? t('settings.required.saved')
              : ''}
        </p>
      </Panel>

      <History />
    </div>
  );
}

/** What changed in one save, as "Card: Editors → Admins only" lines. */
function useChanges() {
  const { t } = useTranslation();
  const names = useNames();
  const level = (l: EditLevel | undefined, fallback: string) =>
    l ? t(`permissions.level.${l}`) : fallback;
  return (before: unknown, after: unknown): string[] => {
    const b = (before ?? { cards: {}, fields: {} }) as Permissions;
    const a = (after ?? { cards: {}, fields: {} }) as Permissions;
    const out: string[] = [];
    for (const c of PERMISSION_CARDS) {
      const x = cardLevel(b, c);
      const y = cardLevel(a, c);
      if (x !== y)
        out.push(
          t('permissions.change', {
            what: names.card(c),
            from: t(`permissions.level.${x}`),
            to: t(`permissions.level.${y}`),
          }),
        );
    }
    for (const f of PERMISSION_FIELDS) {
      const x = b.fields?.[f];
      const y = a.fields?.[f];
      if (x !== y)
        out.push(
          t('permissions.change', {
            what: names.field(f),
            from: level(x, t('permissions.likeVehicleShort')),
            to: level(y, t('permissions.likeVehicleShort')),
          }),
        );
    }
    return out;
  };
}

function History() {
  const { t, i18n } = useTranslation();
  const formatDate = useDateFormat();
  const changes = useChanges();
  const history = useQuery({
    queryKey: ['setting-history', HISTORY_KEY],
    queryFn: () => api<{ items: SettingChange[] }>(`/settings/app/history?key=${HISTORY_KEY}`),
  });
  return (
    <Panel title={t('permissions.historyTitle')} hint={t('permissions.historyHint')}>
      {history.isPending ? (
        <Loader2 aria-hidden className="text-muted size-5 animate-spin" />
      ) : !history.data?.items.length ? (
        <p className="text-muted text-sm">{t('permissions.historyNone')}</p>
      ) : (
        <ol className="space-y-3" data-testid="permission-history">
          {history.data.items.map((h) => {
            const lines = changes(h.before, h.after);
            return (
              <li key={h.id} className="border-border border-s-2 ps-3">
                <p className="text-muted text-xs">
                  {formatDate(h.at)} ·{' '}
                  {new Date(h.at).toLocaleTimeString(localeOf(i18n.language), TIME)} ·{' '}
                  <bdi>{h.by ?? t('permissions.someone')}</bdi>
                </p>
                <ul className="text-sm">
                  {(lines.length ? lines : [t('permissions.noDifference')]).map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}
