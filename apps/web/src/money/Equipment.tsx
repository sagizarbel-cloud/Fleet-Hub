import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Archive,
  ArchiveRestore,
  FileSpreadsheet,
  Loader2,
  Pencil,
  Plus,
  Unlink,
} from 'lucide-react';
import { hasRole, ITEM_KINDS, itemBody, type ItemKind } from '@fleet-hub/shared';
import { useSession } from '@/auth/session';
import { Sheet } from '@/components/Sheet';
import { Button } from '@/components/ui/button';
import { useDashboard } from '@/fleet/data';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { prefersReducedMotion } from '@/lib/motion';
import type { RecordRow } from '@/vehicle/records/api';
import { useFormatCtx } from '@/vehicle/records/format';
import { localDay, type Column } from '@/vehicle/records/kinds';
import {
  useItem,
  useItemMove,
  useItems,
  useSaveItem,
  type Item,
  type ItemDetail,
  type ItemFilters,
} from './api';
import { errorProps, INPUT, issuesToErrors, Labeled, type Errors } from './form';
import { Badge, CONTROL, FilterSelect, PageHeader, SearchBox, useFilters } from './ui';
import { VehicleTagChip } from './VehiclePicker';

const FIELD = { name: 'name', model: 'model', serial: 'serial', spec: 'spec' } as const;
const FILTER_KEYS = ['q', 'kind', 'vehicle', 'where', 'retired'] as const;

const str = (v: unknown) => (typeof v === 'string' ? v : null);
const day = (v: unknown) => (typeof v === 'string' ? new Date(v) : null);

const ITEM_COLUMNS: Column[] = [
  {
    key: 'kind',
    header: 'equipment.kind',
    kind: 'text',
    value: (r) => str(r.kind),
    text: (r, ctx) => ctx.t(`equipment.kinds.${str(r.kind) ?? 'other'}` as never),
  },
  { key: 'name', header: 'vehicle.items.item', kind: 'text', value: (r) => str(r.name) },
  { key: 'model', header: 'vehicle.items.model', kind: 'text', value: (r) => str(r.model) },
  { key: 'spec', header: 'vehicle.items.spec', kind: 'text', value: (r) => str(r.spec) },
  { key: 'serial', header: 'vehicle.items.serial', kind: 'text', value: (r) => str(r.serial) },
  {
    key: 'vehicle',
    header: 'equipment.vehicle',
    kind: 'text',
    value: (r) => (r.vehicle as Item['vehicle'])?.serial ?? null,
  },
  { key: 'since', header: 'vehicle.items.since', kind: 'date', value: (r) => day(r.since) },
];
const HISTORY_COLUMNS: Column[] = [
  { key: 'name', header: 'vehicle.items.item', kind: 'text', value: (r) => str(r.name) },
  {
    key: 'itemSerial',
    header: 'vehicle.items.serial',
    kind: 'text',
    value: (r) => str(r.itemSerial),
  },
  { key: 'serial', header: 'equipment.vehicle', kind: 'text', value: (r) => str(r.serial) },
  { key: 'assignedAt', header: 'records.col.from', kind: 'date', value: (r) => day(r.assignedAt) },
  { key: 'removedAt', header: 'records.col.to', kind: 'date', value: (r) => day(r.removedAt) },
];
const asRows = (items: object[]) =>
  items.map(
    (i, n) =>
      ({ id: String(n), attachments: [], createdById: null, createdBy: null, ...i }) as RecordRow,
  );

function ItemForm({
  item,
  reduced,
  onClose,
}: {
  item?: Item;
  reduced: boolean;
  onClose: (saved?: Item) => void;
}) {
  const { t } = useTranslation();
  const save = useSaveItem();
  const [values, setValues] = useState({
    kind: (item?.kind ?? 'bucket') as ItemKind,
    name: item?.name ?? '',
    model: item?.model ?? '',
    spec: item?.spec ?? '',
    serial: item?.serial ?? '',
  });
  const [errors, setErrors] = useState<Errors>({});
  const [failed, setFailed] = useState<string | null>(null);
  const set = (k: keyof typeof values, v: string) => {
    setValues((s) => ({ ...s, [k]: v }));
    setErrors(({ [k]: _gone, ...rest }) => rest);
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = itemBody.safeParse(values);
    if (!parsed.success) {
      setErrors(
        issuesToErrors(parsed.error.issues, (f) => values[f as keyof typeof values] === ''),
      );
      return;
    }
    try {
      onClose(await save.mutateAsync({ id: item?.id, body: values }));
    } catch (err) {
      if (err instanceof ApiError && err.code === 'serial_taken')
        setErrors({ serial: 'equipment.serialTaken' });
      else setFailed('records.error.save');
    }
  };
  const field = (
    k: 'name' | 'model' | 'spec' | 'serial',
    label: string,
    max: number,
    required = false,
  ) => (
    <Labeled id={`item-${k}`} label={label} required={required} error={errors[k]}>
      <input
        {...errorProps(`item-${k}`, errors[k])}
        className={cn(INPUT, k === 'serial' && 'num')}
        dir={k === 'serial' ? 'ltr' : undefined}
        maxLength={max}
        value={values[k]}
        onChange={(e) => set(k, e.target.value)}
        data-testid={`item-${k}`}
      />
    </Labeled>
  );
  return (
    <Sheet
      title={t(item ? 'equipment.editTitle' : 'equipment.addTitle')}
      onClose={() => onClose()}
      reduced={reduced}
      footer={
        <div className="flex items-center gap-2">
          {failed && (
            <p role="alert" className="text-bad me-auto text-xs">
              {t(failed as never)}
            </p>
          )}
          <Button variant="ghost" className="ms-auto" type="button" onClick={() => onClose()}>
            {t('records.cancel')}
          </Button>
          <Button type="submit" form="item-form" disabled={save.isPending} data-testid="item-save">
            {t('records.save')}
          </Button>
        </div>
      }
    >
      <form id="item-form" noValidate onSubmit={submit} className="space-y-4">
        <Labeled id="item-kind" label={t('equipment.kind')} required>
          <select
            id="item-kind"
            className={INPUT}
            value={values.kind}
            onChange={(e) => set('kind', e.target.value)}
          >
            {ITEM_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`equipment.kinds.${k}`)}
              </option>
            ))}
          </select>
        </Labeled>
        {field(FIELD.name, t('vehicle.items.item'), 120, true)}
        <div className="grid gap-4 sm:grid-cols-2">
          {field(FIELD.model, t('vehicle.items.model'), 80)}
          {field(FIELD.serial, t('vehicle.items.serial'), 60)}
        </div>
        {field(FIELD.spec, t('vehicle.items.spec'), 300)}
      </form>
    </Sheet>
  );
}

function ItemSheet({
  id,
  reduced,
  onClose,
}: {
  id: string;
  reduced: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { data: user } = useSession();
  const { data: dash } = useDashboard();
  const ctx = useFormatCtx('KM');
  const item = useItem(id);
  const move = useItemMove();
  const [editing, setEditing] = useState(false);
  const [target, setTarget] = useState('');
  const canEdit = !!user && hasRole(user.role, 'EDITOR');
  const i = item.data;
  if (editing && i)
    return <ItemForm item={i} reduced={reduced} onClose={() => setEditing(false)} />;
  return (
    <Sheet title={i?.name ?? t('equipment.one')} onClose={onClose} reduced={reduced}>
      {!i ? (
        <Loader2 aria-hidden className="text-muted mx-auto my-8 size-5 animate-spin" />
      ) : (
        <div className="space-y-4" data-testid="item-detail">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="accent">{t(`equipment.kinds.${i.kind}`)}</Badge>
            {i.retiredAt && <Badge tone="muted">{t('equipment.retired')}</Badge>}
            {canEdit && (
              <Button
                size="sm"
                variant="outline"
                className="ms-auto"
                onClick={() => setEditing(true)}
                data-testid="item-edit"
              >
                <Pencil aria-hidden />
                {t('records.edit')}
              </Button>
            )}
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted text-xs">{t('vehicle.items.model')}</dt>
              <dd>{i.model ? <bdi>{i.model}</bdi> : '—'}</dd>
            </div>
            <div>
              <dt className="text-muted text-xs">{t('vehicle.items.serial')}</dt>
              <dd>
                {i.serial ? (
                  <bdi dir="ltr" className="num">
                    {i.serial}
                  </bdi>
                ) : (
                  '—'
                )}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-muted text-xs">{t('vehicle.items.spec')}</dt>
              <dd>{i.spec ? <bdi>{i.spec}</bdi> : '—'}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-muted text-xs">{t('equipment.vehicle')}</dt>
              <dd className="flex items-center gap-2">
                {i.vehicle ? (
                  <>
                    <VehicleTagChip serial={i.vehicle.serial} type={i.vehicle.type} />
                    {i.since && (
                      <span className="text-muted num text-xs">
                        {t('equipment.since', { date: ctx.date(i.since) })}
                      </span>
                    )}
                  </>
                ) : (
                  t('equipment.inYard')
                )}
              </dd>
            </div>
          </dl>
          {canEdit && !i.retiredAt && (
            <div className="flex flex-wrap items-end gap-2">
              <label className="min-w-40 flex-1 space-y-1 text-xs font-medium">
                <span>{i.vehicle ? t('equipment.moveTo') : t('equipment.assignTo')}</span>
                <select
                  className={cn(CONTROL, 'h-9 w-full text-sm')}
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  data-testid="item-target"
                >
                  <option value="">{t('records.choose')}</option>
                  {(dash?.tiles ?? [])
                    .filter((v) => v.serial !== i.vehicle?.serial)
                    .map((v) => (
                      <option key={v.serial} value={v.serial}>
                        {v.serial} · {v.make} {v.model}
                      </option>
                    ))}
                </select>
              </label>
              <Button
                size="sm"
                disabled={!target || move.isPending}
                onClick={() =>
                  move.mutate(
                    { id: i.id, action: 'assign', vehicle: target },
                    { onSuccess: () => setTarget('') },
                  )
                }
                data-testid="item-assign"
              >
                {t('vehicle.items.assign')}
              </Button>
              {i.vehicle && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={move.isPending}
                  onClick={() => move.mutate({ id: i.id, action: 'remove' })}
                  data-testid="item-remove"
                >
                  <Unlink aria-hidden />
                  {t('equipment.toYard')}
                </Button>
              )}
            </div>
          )}
          {canEdit && !i.vehicle && (
            <Button
              size="sm"
              variant="ghost"
              disabled={move.isPending}
              onClick={() => move.mutate({ id: i.id, action: i.retiredAt ? 'unretire' : 'retire' })}
              data-testid="item-retire"
            >
              {i.retiredAt ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
              {t(i.retiredAt ? 'equipment.unretire' : 'equipment.retire')}
            </Button>
          )}
          <div>
            <h3 className="mb-1 text-sm font-medium">{t('equipment.history')}</h3>
            {i.history.length === 0 ? (
              <p className="text-muted text-xs">{t('equipment.noHistory')}</p>
            ) : (
              <table className="w-full text-sm" data-testid="item-history">
                <thead className="text-muted text-xs">
                  <tr className="border-border border-b">
                    <th className="px-1.5 py-2 text-start font-medium">{t('equipment.vehicle')}</th>
                    <th className="px-1.5 py-2 text-start font-medium">{t('records.col.from')}</th>
                    <th className="px-1.5 py-2 text-start font-medium">{t('records.col.to')}</th>
                    <th className="px-1.5 py-2 text-end font-medium">{t('equipment.days')}</th>
                  </tr>
                </thead>
                <tbody>
                  {i.history.map((h, n) => {
                    const end = h.removedAt ? new Date(h.removedAt) : new Date();
                    const days = Math.max(
                      0,
                      Math.round((end.getTime() - new Date(h.assignedAt).getTime()) / 86_400_000),
                    );
                    return (
                      <tr key={n} className="border-border border-b last:border-0">
                        <td className="px-1.5 py-2">
                          <bdi dir="ltr" className="num">
                            {h.serial}
                          </bdi>
                        </td>
                        <td className="num px-1.5 py-2">{ctx.date(h.assignedAt)}</td>
                        <td className="num px-1.5 py-2">
                          {h.removedAt ? ctx.date(h.removedAt) : t('equipment.now')}
                        </td>
                        <td className="num px-1.5 py-2 text-end">{ctx.number(days)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}

/** Equipment & tools (SPEC 5.7): the catalog, each item's history, and assigning. */
export function EquipmentPage() {
  const { t } = useTranslation();
  const { data: user } = useSession();
  const { data: dash } = useDashboard();
  const ctx = useFormatCtx('KM');
  const [reduced] = useState(prefersReducedMotion);
  const [filters, setFilters] = useFilters<ItemFilters>(FILTER_KEYS, true);
  const items = useItems(filters);
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [exporting, setExporting] = useState(false);
  const canEdit = !!user && hasRole(user.role, 'EDITOR');
  const title = t('nav.equipment');
  useEffect(() => {
    document.title = `${title} · ${t('app.name')}`;
  }, [title, t]);

  const exportAll = async () => {
    setExporting(true);
    try {
      const list = items.data ?? [];
      const [{ downloadWorkbook }, details] = await Promise.all([
        import('@/vehicle/records/exportXlsx'),
        Promise.all(list.map((i) => api<ItemDetail>(`/items/${encodeURIComponent(i.id)}`))),
      ]);
      const fileName = `equipment ${localDay(new Date())}.xlsx`;
      const line = t('records.exportedOn', { date: ctx.date(new Date().toISOString()) });
      await downloadWorkbook({
        fileName,
        sheets: [
          {
            title,
            lines: [line],
            columns: ITEM_COLUMNS,
            rows: asRows(list),
            ctx,
            fileName,
            files: false,
          },
          {
            title: t('equipment.history'),
            lines: [line],
            columns: HISTORY_COLUMNS,
            rows: asRows(
              details.flatMap((d) =>
                d.history.map((h) => ({ ...h, name: d.name, itemSerial: d.serial })),
              ),
            ),
            ctx,
            fileName,
            files: false,
          },
        ],
      });
    } finally {
      setExporting(false);
    }
  };

  const list = items.data ?? [];
  return (
    <section aria-labelledby="area-title" className="glass space-y-4 p-3 sm:p-5">
      <PageHeader title={title}>
        <Button
          variant="outline"
          size="sm"
          disabled={exporting || list.length === 0}
          onClick={() => void exportAll()}
          data-testid="export"
        >
          {exporting ? (
            <Loader2 aria-hidden className="animate-spin" />
          ) : (
            <FileSpreadsheet aria-hidden />
          )}
          {t('records.export')}
        </Button>
        {canEdit && (
          <Button size="sm" onClick={() => setAdding(true)} data-testid="item-add">
            <Plus aria-hidden />
            {t('equipment.add')}
          </Button>
        )}
      </PageHeader>
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox
          label={t('equipment.search')}
          value={filters.q ?? ''}
          onChange={(q) => setFilters({ q })}
          testId="item-search"
        />
        <FilterSelect
          label={t('equipment.kind')}
          value={filters.kind ?? ''}
          onChange={(v) => setFilters({ kind: v })}
          options={ITEM_KINDS.map((k) => ({ value: k, label: t(`equipment.kinds.${k}`) }))}
          testId="item-filter-kind"
        />
        <FilterSelect
          label={t('equipment.where')}
          value={filters.where ?? ''}
          onChange={(v) => setFilters({ where: v })}
          options={[
            { value: 'assigned', label: t('equipment.onVehicle') },
            { value: 'yard', label: t('equipment.inYard') },
          ]}
        />
        <FilterSelect
          label={t('equipment.vehicle')}
          value={filters.vehicle ?? ''}
          onChange={(v) => setFilters({ vehicle: v })}
          options={(dash?.tiles ?? []).map((v) => ({ value: v.serial, label: v.serial }))}
        />
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            className="size-4 accent-[var(--fh-accent)]"
            checked={filters.retired === '1'}
            onChange={(e) => setFilters({ retired: e.target.checked ? '1' : '' })}
          />
          {t('equipment.showRetired')}
        </label>
      </div>
      {items.isPending ? (
        <Loader2 aria-hidden className="text-muted mx-auto my-8 size-5 animate-spin" />
      ) : list.length === 0 ? (
        <p className="text-muted py-10 text-center text-sm">{t('equipment.empty')}</p>
      ) : (
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm" data-testid="item-table">
            <thead className="text-muted text-xs">
              <tr className="border-border border-b">
                {ITEM_COLUMNS.map((c) => (
                  <th key={c.key} scope="col" className="px-1.5 py-2 text-start font-medium">
                    {t(c.header as never)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((i) => (
                <tr
                  key={i.id}
                  className="border-border hover:bg-border/30 cursor-pointer border-b last:border-0"
                  onClick={() => setOpen(i.id)}
                  data-testid="item-row"
                >
                  <td className="px-1.5 py-2">{t(`equipment.kinds.${i.kind}`)}</td>
                  <td className="px-1.5 py-2">
                    <button
                      type="button"
                      className="text-start font-medium hover:underline"
                      onClick={() => setOpen(i.id)}
                    >
                      <bdi>{i.name}</bdi>
                    </button>
                  </td>
                  <td className="px-1.5 py-2">{i.model ? <bdi>{i.model}</bdi> : '—'}</td>
                  <td className="px-1.5 py-2">{i.spec ? <bdi>{i.spec}</bdi> : '—'}</td>
                  <td className="px-1.5 py-2">
                    {i.serial ? (
                      <bdi dir="ltr" className="num">
                        {i.serial}
                      </bdi>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-1.5 py-2">
                    {i.vehicle ? (
                      <bdi dir="ltr" className="num">
                        {i.vehicle.serial}
                      </bdi>
                    ) : (
                      <span className="text-muted">{t('equipment.inYard')}</span>
                    )}
                  </td>
                  <td className="num px-1.5 py-2">{i.since ? ctx.date(i.since) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open && <ItemSheet id={open} reduced={reduced} onClose={() => setOpen(null)} />}
      {adding && (
        <ItemForm
          reduced={reduced}
          onClose={(saved) => {
            setAdding(false);
            if (saved) setOpen(saved.id);
          }}
        />
      )}
    </section>
  );
}
