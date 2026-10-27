import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Check,
  ChevronDown,
  Columns3,
  Download,
  Loader2,
  Minimize2,
  Maximize2,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import {
  FLEET_COLUMNS,
  FLEET_GROUP_BY,
  FLEET_GROUPS,
  VEHICLE_STATUSES,
  type FleetColumn,
  type FleetGroup,
  type FleetViewSettings,
} from '@fleet-hub/shared';
import { Popover } from '@/components/Popover';
import { Sheet } from '@/components/Sheet';
import { cn } from '@/lib/cn';
import { prefersReducedMotion } from '@/lib/motion';
import { lookupName, useLookups, type LookupItem } from '@/fleet/data';
import { STATUS_ICON } from '@/fleet/statusIcon';
import { Chip } from '@/fleet/Timeline';

const EXPORT_SCOPES = ['view', 'fleet'] as const;

type Patch = (patch: Partial<FleetViewSettings>) => void;

const CONTROL =
  'border-border-strong bg-surface h-8 rounded-md border px-2 text-xs focus-visible:outline-2 focus-visible:outline-[var(--fh-accent)]';
const MENU_ITEM =
  'hover:bg-border/50 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-sm';

const toggle = <T,>(list: T[], value: T) =>
  list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

export const hasFilters = (s: FleetViewSettings) =>
  !!(
    s.q ||
    s.status.length ||
    s.types.length ||
    s.departments.length ||
    s.locations.length ||
    s.due ||
    s.issues
  );

function MultiSelect({
  label,
  items,
  value,
  onChange,
  testId,
}: {
  label: string;
  items: LookupItem[];
  value: string[];
  onChange: (v: string[]) => void;
  testId: string;
}) {
  const { i18n } = useTranslation();
  return (
    <Popover
      label={label}
      align="start"
      panelClassName="w-60 max-h-80 overflow-y-auto"
      trigger={
        <span className="inline-flex items-center gap-1" data-testid={testId}>
          {label}
          {value.length > 0 && (
            <span className="bg-accent text-accent-contrast num rounded-full px-1.5 text-[0.65rem]">
              {value.length}
            </span>
          )}
          <ChevronDown aria-hidden className="size-3.5" />
        </span>
      }
    >
      {() => (
        <ul className="space-y-0.5">
          {items.map((item) => (
            <li key={item.code}>
              <label className={MENU_ITEM}>
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--fh-accent)]"
                  checked={value.includes(item.code)}
                  onChange={() => onChange(toggle(value, item.code))}
                />
                {lookupName(item, i18n.language)}
              </label>
            </li>
          ))}
        </ul>
      )}
    </Popover>
  );
}

/** Status chips, list filters and the two "needs attention" toggles. */
function FilterControls({ settings, update }: { settings: FleetViewSettings; update: Patch }) {
  const { t } = useTranslation();
  const { data: lookups } = useLookups();
  return (
    <>
      <div role="group" aria-label={t('fleet.filter.status')} className="flex flex-wrap gap-1.5">
        {VEHICLE_STATUSES.map((s) => {
          const { icon: Icon, tone } = STATUS_ICON[s];
          return (
            <Chip
              key={s}
              pressed={settings.status.includes(s)}
              onClick={() => update({ status: toggle(settings.status, s) })}
            >
              <Icon aria-hidden className={cn('size-3.5', tone)} />
              {t(`status.${s}`)}
            </Chip>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <MultiSelect
          label={t('fleet.filter.type')}
          testId="filter-types"
          items={lookups?.vehicleTypes ?? []}
          value={settings.types}
          onChange={(types) => update({ types })}
        />
        <MultiSelect
          label={t('fleet.filter.department')}
          testId="filter-departments"
          items={lookups?.departments ?? []}
          value={settings.departments}
          onChange={(departments) => update({ departments })}
        />
        <MultiSelect
          label={t('fleet.filter.location')}
          testId="filter-locations"
          items={lookups?.locations ?? []}
          value={settings.locations}
          onChange={(locations) => update({ locations })}
        />
      </div>
      <div className="flex flex-wrap gap-3">
        <label className="flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            className="size-4 accent-[var(--fh-accent)]"
            checked={settings.due}
            onChange={(e) => update({ due: e.target.checked })}
          />
          {t('fleet.filter.due')}
        </label>
        <label className="flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            className="size-4 accent-[var(--fh-accent)]"
            checked={settings.issues}
            onChange={(e) => update({ issues: e.target.checked })}
          />
          {t('fleet.filter.issues')}
        </label>
      </div>
    </>
  );
}

export function GroupBySelect({
  settings,
  update,
}: {
  settings: FleetViewSettings;
  update: Patch;
}) {
  const { t } = useTranslation();
  return (
    <label className="flex items-center gap-1.5 text-xs">
      <span className="text-muted">{t('fleet.groupBy.label')}</span>
      <select
        className={CONTROL}
        value={settings.groupBy}
        onChange={(e) => update({ groupBy: e.target.value as FleetViewSettings['groupBy'] })}
      >
        {FLEET_GROUP_BY.map((g) => (
          <option key={g} value={g}>
            {t(`fleet.groupBy.${g}`)}
          </option>
        ))}
      </select>
    </label>
  );
}

export function SearchBox({ settings, update }: { settings: FleetViewSettings; update: Patch }) {
  const { t } = useTranslation();
  return (
    <label className="relative min-w-44 flex-1 sm:max-w-72">
      <span className="sr-only">{t('fleet.search')}</span>
      <Search aria-hidden className="text-muted absolute start-2 top-2 size-4" />
      <input
        type="search"
        value={settings.q}
        onChange={(e) => update({ q: e.target.value })}
        placeholder={t('fleet.search')}
        className={cn(CONTROL, 'w-full ps-8')}
        data-testid="fleet-search"
      />
    </label>
  );
}

/** Inline filters on wide screens; a Filters button with a sheet on phones. */
export function Filters({ settings, update }: { settings: FleetViewSettings; update: Patch }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const active = hasFilters({ ...settings, q: '' });
  const clear = () =>
    update({
      status: [],
      types: [],
      departments: [],
      locations: [],
      due: false,
      issues: false,
      q: '',
    });
  return (
    <>
      <div
        className="hidden flex-wrap items-center gap-3 lg:flex"
        role="group"
        aria-label={t('fleet.filter.label')}
      >
        <FilterControls settings={settings} update={update} />
        {hasFilters(settings) && (
          <button
            type="button"
            onClick={clear}
            className="text-muted hover:text-text inline-flex items-center gap-1 text-xs"
          >
            <X aria-hidden className="size-3.5" />
            {t('fleet.filter.clear')}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(CONTROL, 'inline-flex items-center gap-1.5 lg:hidden')}
        data-testid="filters-button"
      >
        <SlidersHorizontal aria-hidden className="size-4" />
        {t('fleet.filter.label')}
        {active && <span aria-hidden className="bg-accent size-2 rounded-full" />}
      </button>
      {open && (
        <Sheet
          title={t('fleet.filter.label')}
          onClose={() => setOpen(false)}
          reduced={prefersReducedMotion()}
          footer={
            <div className="flex justify-between gap-2">
              <button type="button" onClick={clear} className={CONTROL}>
                {t('fleet.filter.clear')}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="bg-accent text-accent-contrast h-8 rounded-md px-3 text-xs font-medium"
              >
                {t('fleet.filter.done')}
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            <FilterControls settings={settings} update={update} />
            <GroupBySelect settings={settings} update={update} />
          </div>
        </Sheet>
      )}
    </>
  );
}

function ColumnChecks({
  group,
  settings,
  update,
}: {
  group: FleetGroup;
  settings: FleetViewSettings;
  update: Patch;
}) {
  const { t } = useTranslation();
  const setColumn = (id: FleetColumn, on: boolean) => {
    const shown = new Set(settings.columns);
    if (on) shown.add(id);
    else shown.delete(id);
    // Keep the saved list in table order.
    const columns = FLEET_GROUPS.flatMap((g) => FLEET_COLUMNS[g]).filter((c) => shown.has(c));
    update({ columns, collapsed: settings.collapsed.filter((g) => g !== group) });
  };
  return (
    <ul className="space-y-0.5">
      {FLEET_COLUMNS[group].map((id) => (
        <li key={id}>
          <label className={MENU_ITEM}>
            <input
              type="checkbox"
              className="size-4 accent-[var(--fh-accent)]"
              checked={settings.columns.includes(id)}
              onChange={(e) => setColumn(id, e.target.checked)}
            />
            {t(`fleet.col.${id}`)}
          </label>
        </li>
      ))}
    </ul>
  );
}

/** The dropdown on a column group's header: expand, collapse to one column, or pick columns. */
export function GroupMenu({
  group,
  collapsed,
  onCollapse,
  settings,
  update,
}: {
  group: FleetGroup;
  collapsed: boolean;
  onCollapse: (collapsed: boolean) => void;
  settings: FleetViewSettings;
  update: Patch;
}) {
  const { t } = useTranslation();
  const title = t(`fleet.group.${group}`);
  return (
    <Popover
      label={t('fleet.groupMenu', { group: title })}
      align="start"
      className="inline-block"
      panelClassName="w-64 font-normal normal-case tracking-normal"
      trigger={
        <span className="inline-flex items-center gap-1" data-testid={`group-${group}`}>
          {title}
          <ChevronDown aria-hidden className="size-3.5" />
        </span>
      }
    >
      {(close) => (
        <div className="space-y-1">
          <button
            type="button"
            className={MENU_ITEM}
            onClick={() => {
              onCollapse(!collapsed);
              close();
            }}
          >
            {collapsed ? (
              <Maximize2 aria-hidden className="size-4" />
            ) : (
              <Minimize2 aria-hidden className="size-4" />
            )}
            {t(collapsed ? 'fleet.expandGroup' : 'fleet.collapseGroup')}
          </button>
          <div className="border-border border-t pt-1">
            <ColumnChecks group={group} settings={settings} update={update} />
          </div>
        </div>
      )}
    </Popover>
  );
}

/** Every group and column in one place, including groups with nothing shown. */
export function ColumnsMenu({
  settings,
  update,
  onReset,
}: {
  settings: FleetViewSettings;
  update: Patch;
  onReset: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Popover
      label={t('fleet.columns')}
      panelClassName="w-72 max-h-[70vh] overflow-y-auto"
      trigger={
        <span className="inline-flex items-center gap-1" data-testid="columns-menu">
          <Columns3 aria-hidden className="size-4" />
          <span className="hidden sm:inline">{t('fleet.columns')}</span>
        </span>
      }
    >
      {() => (
        <div className="space-y-2">
          {FLEET_GROUPS.map((g) => (
            <section key={g}>
              <h3 className="text-muted px-2 pt-1 text-xs font-semibold">
                {t(`fleet.group.${g}`)}
              </h3>
              <ColumnChecks group={g} settings={settings} update={update} />
            </section>
          ))}
          <button type="button" className={cn(MENU_ITEM, 'text-muted')} onClick={onReset}>
            <Check aria-hidden className="size-4" />
            {t('fleet.resetColumns')}
          </button>
        </div>
      )}
    </Popover>
  );
}

export function ExportMenu({
  busy,
  error,
  onExport,
}: {
  busy: boolean;
  error: boolean;
  onExport: (scope: 'view' | 'fleet') => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2">
      {error && (
        <span role="alert" className="text-bad text-xs">
          {t('records.error.export')}
        </span>
      )}
      <Popover
        label={t('records.export')}
        panelClassName="w-64"
        trigger={
          <span className="inline-flex items-center gap-1" data-testid="export-menu">
            {busy ? (
              <Loader2 aria-hidden className="size-4 animate-spin" />
            ) : (
              <Download aria-hidden className="size-4" />
            )}
            <span className="hidden sm:inline">{t('records.export')}</span>
          </span>
        }
      >
        {(close) => (
          <div className="space-y-0.5">
            {EXPORT_SCOPES.map((scope) => (
              <button
                key={scope}
                type="button"
                disabled={busy}
                className={cn(MENU_ITEM, 'flex-col items-start gap-0')}
                data-testid={`export-${scope}`}
                onClick={() => {
                  onExport(scope);
                  close();
                }}
              >
                <span>{t(`fleet.export.${scope}`)}</span>
                <span className="text-muted text-xs">{t(`fleet.export.${scope}Hint`)}</span>
              </button>
            ))}
          </div>
        )}
      </Popover>
    </div>
  );
}
