import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { LOOKUP_KINDS, lookupBody, type LookupBody, type LookupKind } from '@fleet-hub/shared';
import { Sheet } from '@/components/Sheet';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { prefersReducedMotion } from '@/lib/motion';
import { errorProps, INPUT, issuesToErrors, Labeled, type Errors } from '@/money/form';
import {
  useAdminLookups,
  useDeleteLookup,
  useReorderLookups,
  useSaveLookup,
  type AdminLookup,
} from './api';
import { SettingsSkeleton } from './SettingsPage';

// The first column stays put while the table scrolls sideways on phones (SPEC A10).
const STICKY = 'bg-surface-strong sticky start-0 z-[1]';
const LTR = { dir: 'ltr' } as const;
const RTL = { dir: 'rtl' } as const;
const CODE_MESSAGES = {
  code: 'settings.lists.error.code',
  taken: 'settings.lists.error.taken',
  inUse: 'settings.lists.error.inUse',
};

/** The bilingual lists (SPEC 5.9). Values in use can be hidden, renamed and reordered, never deleted. */
export function ListsEditor() {
  const { t, i18n } = useTranslation();
  const lists = useAdminLookups();
  const [kind, setKind] = useState<LookupKind>('departments');
  const [editing, setEditing] = useState<AdminLookup | 'new' | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [reduced] = useState(prefersReducedMotion);
  const reorder = useReorderLookups(kind);
  const remove = useDeleteLookup(kind);
  const save = useSaveLookup(kind);
  const he = i18n.language === 'he';

  const rows = lists.data?.[kind] ?? [];
  const move = (i: number, by: -1 | 1) => {
    const ids = rows.map((r) => r.id);
    [ids[i], ids[i + by]] = [ids[i + by]!, ids[i]!];
    reorder.mutate(ids);
  };
  const toggle = (row: AdminLookup) =>
    save.mutate({ id: row.id, body: { ...bodyOf(row), active: !row.active } });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div
          role="tablist"
          aria-label={t('settings.lists.choose')}
          className="flex flex-wrap gap-1"
        >
          {LOOKUP_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={k === kind}
              onClick={() => {
                setKind(k);
                setConfirming(null);
              }}
              className={cn(
                'rounded-full border px-3 py-1 text-sm transition-colors',
                k === kind
                  ? 'border-accent bg-accent/15 text-text'
                  : 'border-border-strong text-muted hover:text-text',
              )}
            >
              {t(`settings.lists.kinds.${k}`)}
              {lists.data && (
                <span className="text-muted ms-1.5 text-xs">{lists.data[k].length}</span>
              )}
            </button>
          ))}
        </div>
        <Button size="sm" className="ms-auto" onClick={() => setEditing('new')}>
          <Plus aria-hidden />
          {t('settings.lists.add')}
        </Button>
      </div>

      {lists.isPending ? (
        <SettingsSkeleton />
      ) : lists.isError ? (
        <div className="glass grid gap-3 p-6 text-center">
          <p>{t('settings.loadFailed')}</p>
          <Button
            variant="outline"
            size="sm"
            className="mx-auto"
            onClick={() => void lists.refetch()}
          >
            {t('dashboard.retry')}
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <div className="glass grid gap-3 p-8 text-center">
          <p className="text-muted">{t('settings.lists.empty')}</p>
          <Button size="sm" className="mx-auto" onClick={() => setEditing('new')}>
            <Plus aria-hidden />
            {t('settings.lists.add')}
          </Button>
        </div>
      ) : (
        <div className="glass overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm" data-testid="lookup-table">
            <thead className="text-muted text-xs">
              <tr className="border-border border-b">
                <th className={cn(STICKY, 'px-3 py-2 text-start font-medium')}>
                  {t('settings.lists.nameEn')}
                </th>
                <th className="px-3 py-2 text-start font-medium">{t('settings.lists.nameHe')}</th>
                <th className="px-3 py-2 text-start font-medium">{t('settings.lists.code')}</th>
                {kind === 'vehicleTypes' && (
                  <th className="px-3 py-2 text-start font-medium">{t('settings.lists.unit')}</th>
                )}
                <th className="px-3 py-2 text-end font-medium">{t('settings.lists.inUse')}</th>
                <th className="px-3 py-2 text-start font-medium">{t('settings.lists.shown')}</th>
                <th className="px-3 py-2 text-end font-medium">
                  <span className="sr-only">{t('settings.lists.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const name = he ? row.nameHe : row.nameEn;
                return (
                  <tr
                    key={row.id}
                    className={cn(
                      'border-border border-b last:border-0',
                      !row.active && 'text-muted',
                    )}
                  >
                    <td className={cn(STICKY, 'px-3 py-1.5')} lang="en">
                      {row.nameEn}
                    </td>
                    <td className="px-3 py-1.5" lang="he" dir="rtl">
                      {row.nameHe}
                    </td>
                    <td className="px-3 py-1.5">
                      <bdi dir="ltr" className="num text-xs">
                        {row.code}
                      </bdi>
                    </td>
                    {kind === 'vehicleTypes' && (
                      <td className="px-3 py-1.5 text-xs">
                        {row.category && t(`settings.lists.category.${row.category}`)}
                        {row.usageUnit && ` · ${t(`settings.lists.usage.${row.usageUnit}`)}`}
                      </td>
                    )}
                    <td className="num px-3 py-1.5 text-end">{row.inUse}</td>
                    <td className="px-3 py-1.5">
                      <label className="inline-flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={row.active}
                          onChange={() => toggle(row)}
                          className="accent-[var(--fh-accent)]"
                          aria-label={t('settings.lists.showName', { name })}
                        />
                        {t(row.active ? 'settings.lists.visible' : 'settings.lists.hidden')}
                      </label>
                    </td>
                    <td className="px-2 py-1">
                      {confirming === row.id ? (
                        <div className="flex items-center justify-end gap-1" role="group">
                          <span className="text-xs">
                            {t('settings.lists.confirmDelete', { name })}
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-bad/50 bg-bad/10 text-bad"
                            onClick={() =>
                              remove.mutate(row.id, { onSettled: () => setConfirming(null) })
                            }
                          >
                            {t('settings.lists.delete')}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                            {t('records.cancel')}
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-0.5">
                          <IconButton
                            label={t('vehicle.vitals.moveUp', { name })}
                            disabled={i === 0}
                            onClick={() => move(i, -1)}
                          >
                            <ArrowUp aria-hidden />
                          </IconButton>
                          <IconButton
                            label={t('vehicle.vitals.moveDown', { name })}
                            disabled={i === rows.length - 1}
                            onClick={() => move(i, 1)}
                          >
                            <ArrowDown aria-hidden />
                          </IconButton>
                          <IconButton
                            label={t('settings.lists.editName', { name })}
                            onClick={() => setEditing(row)}
                          >
                            <Pencil aria-hidden />
                          </IconButton>
                          <IconButton
                            label={
                              row.inUse
                                ? t('settings.lists.cantDelete', { count: row.inUse })
                                : t('settings.lists.deleteName', { name })
                            }
                            disabled={row.inUse > 0}
                            onClick={() => setConfirming(row.id)}
                          >
                            <Trash2 aria-hidden />
                          </IconButton>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-muted text-xs">{t('settings.lists.hint')}</p>

      {editing && (
        <LookupForm
          kind={kind}
          row={editing === 'new' ? null : editing}
          reduced={reduced}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function IconButton({
  label,
  children,
  ...props
}: { label: string; children: React.ReactNode } & React.ComponentProps<'button'>) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-8"
      aria-label={label}
      title={label}
      {...props}
    >
      {children}
    </Button>
  );
}

const bodyOf = (row: AdminLookup): LookupBody => ({
  code: row.code,
  nameEn: row.nameEn,
  nameHe: row.nameHe,
  active: row.active,
  ...(row.category ? { category: row.category } : {}),
  ...(row.usageUnit ? { usageUnit: row.usageUnit } : {}),
});

function LookupForm({
  kind,
  row,
  reduced,
  onClose,
}: {
  kind: LookupKind;
  row: AdminLookup | null;
  reduced: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const save = useSaveLookup(kind);
  const [values, setValues] = useState({
    code: row?.code ?? '',
    nameEn: row?.nameEn ?? '',
    nameHe: row?.nameHe ?? '',
    category: row?.category ?? 'EQUIPMENT',
    usageUnit: row?.usageUnit ?? 'HOURS',
  });
  const [errors, setErrors] = useState<Errors>({});
  const [failed, setFailed] = useState<string | null>(null);
  const set = (k: keyof typeof values, v: string) => setValues((s) => ({ ...s, [k]: v }));
  // A code in use stays fixed: imports and drawings refer to it.
  const codeLocked = !!row && row.inUse > 0;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFailed(null);
    const body = {
      code: values.code,
      nameEn: values.nameEn,
      nameHe: values.nameHe,
      active: row?.active ?? true,
      ...(kind === 'vehicleTypes'
        ? { category: values.category, usageUnit: values.usageUnit }
        : {}),
    };
    const parsed = lookupBody.safeParse(body);
    if (!parsed.success) {
      setErrors(
        issuesToErrors(
          parsed.error.issues,
          (f) => values[f as keyof typeof values] === '',
          CODE_MESSAGES,
        ),
      );
      return;
    }
    try {
      await save.mutateAsync({ id: row?.id, body: parsed.data });
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.issues.length) {
        setErrors(
          Object.fromEntries(
            err.issues.map((i) => [
              i.path,
              CODE_MESSAGES[i.code as keyof typeof CODE_MESSAGES] ?? 'records.error.invalid',
            ]),
          ),
        );
      } else
        setFailed(
          err instanceof ApiError && err.status === 403
            ? 'records.error.forbidden'
            : 'records.error.save',
        );
    }
  };

  const text = (
    key: 'nameEn' | 'nameHe' | 'code',
    opts: { dir?: 'ltr' | 'rtl'; hint?: string } = {},
  ) => (
    <Labeled
      id={`lk-${key}`}
      label={t(`settings.lists.${key}`)}
      required
      error={errors[key]}
      hint={opts.hint}
    >
      <input
        {...errorProps(`lk-${key}`, errors[key])}
        value={values[key]}
        dir={opts.dir}
        disabled={key === 'code' && codeLocked}
        onChange={(e) => set(key, e.target.value)}
        className={INPUT}
      />
    </Labeled>
  );

  const fields = {
    nameEn: text('nameEn', LTR),
    nameHe: text('nameHe', RTL),
    code: text('code', {
      ...LTR,
      hint: t(codeLocked ? 'settings.lists.codeLocked' : 'settings.lists.codeHint'),
    }),
  };

  return (
    <Sheet
      title={t(row ? 'settings.lists.editTitle' : 'settings.lists.addTitle', {
        list: t(`settings.lists.kinds.${kind}`),
      })}
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
          <Button type="submit" form="lookup-form" disabled={save.isPending}>
            {t('records.save')}
          </Button>
        </div>
      }
    >
      <form id="lookup-form" onSubmit={onSubmit} className="space-y-3" noValidate>
        {fields.nameEn}
        {fields.nameHe}
        {fields.code}
        {kind === 'vehicleTypes' && (
          <div className="grid grid-cols-2 gap-3">
            <Labeled id="lk-category" label={t('settings.lists.categoryLabel')} required>
              <select
                id="lk-category"
                value={values.category}
                onChange={(e) => set('category', e.target.value)}
                className={INPUT}
              >
                {(['EQUIPMENT', 'ROAD'] as const).map((c) => (
                  <option key={c} value={c}>
                    {t(`settings.lists.category.${c}`)}
                  </option>
                ))}
              </select>
            </Labeled>
            <Labeled id="lk-unit" label={t('settings.lists.unit')} required>
              <select
                id="lk-unit"
                value={values.usageUnit}
                onChange={(e) => set('usageUnit', e.target.value)}
                className={INPUT}
              >
                {(['HOURS', 'KM'] as const).map((u) => (
                  <option key={u} value={u}>
                    {t(`settings.lists.usage.${u}`)}
                  </option>
                ))}
              </select>
            </Labeled>
          </div>
        )}
      </form>
    </Sheet>
  );
}
