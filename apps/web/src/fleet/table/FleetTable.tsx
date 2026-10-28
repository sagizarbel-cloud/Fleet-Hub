import { useEffect, useMemo, useRef, useState } from 'react';
import { useMatch, useNavigate, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDown, ArrowUp, ChevronRight, Loader2 } from 'lucide-react';
import {
  DEFAULT_FLEET_VIEW,
  DUE_SOON_DAYS,
  FLEET_GROUPS,
  type FleetGroup,
  type FleetSort,
  type FleetViewSettings,
} from '@fleet-hub/shared';
import { Button } from '@/components/ui/button';
import { drawingFor } from '@/drawings/registry';
import { VehicleVisual } from '@/drawings/VehicleVisual';
import { cn } from '@/lib/cn';
import { fade } from '@/lib/motion';
import { STATUS_ICON } from '@/fleet/statusIcon';
import { usePreferences } from '@/vehicle/data';
import { cellText, useFormatCtx } from '@/vehicle/records/format';
import type { FormatCtx } from '@/vehicle/records/kinds';
import type { RecordRow } from '@/vehicle/records/api';
import { useFleetTable, useSavedViews, type SavedView } from './data';
import {
  daysUntil,
  decodeSettings,
  nextExpiry,
  encodeSettings,
  filterRows,
  groupRows,
  normalizeSettings,
  sameSettings,
  sortRows,
  visibleColumns,
  type FleetColumnDef,
  type FleetRow,
} from './model';
import { RowDetail } from './RowDetail';
import { ColumnsMenu, ExportMenu, Filters, GroupBySelect, GroupMenu, SearchBox } from './Toolbar';
import { ViewsMenu } from './ViewsMenu';

const STICKY_WIDTH = { wide: 210, phone: 168 };
const PHONE = '(max-width: 639px)';

function usePhone() {
  const [phone, setPhone] = useState(() => window.matchMedia(PHONE).matches);
  useEffect(() => {
    const mq = window.matchMedia(PHONE);
    const on = () => setPhone(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return phone;
}
const VISUAL_HEIGHT = 40;
const SIZE = { group: 36, row: 52, detail: 200 } as const;

type Item =
  | { kind: 'group'; key: string; label: string; count: number; closed: boolean }
  | { kind: 'row'; row: FleetRow }
  | { kind: 'detail'; row: FleetRow };

const SERIAL = 'serial';
const asRecord = (r: FleetRow) => r as unknown as RecordRow;

/** A date with a countdown: red when overdue, orange within DUE_SOON_DAYS. */
function DueCell({ iso, note, ctx }: { iso: string; note?: string; ctx: FormatCtx }) {
  const days = daysUntil(iso);
  const tone = days < 0 ? 'text-bad' : days <= DUE_SOON_DAYS ? 'text-warn' : 'text-muted';
  const when =
    days < 0
      ? ctx.t('fleet.due.overdue', { count: -days })
      : days === 0
        ? ctx.t('fleet.due.today')
        : ctx.t('fleet.due.inDays', { count: days });
  return (
    <span className="flex min-w-0 flex-col leading-tight">
      <span className="num">{ctx.date(iso)}</span>
      <span className="truncate text-xs">
        <span className={tone}>{when}</span>
        {note && <span className="text-muted"> · {note}</span>}
      </span>
    </span>
  );
}

function Cell({ col, row, ctx }: { col: FleetColumnDef; row: FleetRow; ctx: FormatCtx }) {
  if (col.key === 'status') {
    const { icon: Icon, tone } = STATUS_ICON[row.status];
    return (
      <span className="inline-flex items-center gap-1.5">
        <Icon aria-hidden className={cn('size-4', tone)} />
        {ctx.t(`status.${row.status}`)}
        {row.statusOverride && (
          <span className="text-muted text-xs">({ctx.t('vehicle.override.manual')})</span>
        )}
      </span>
    );
  }
  const due = col.due?.(row);
  if (due) {
    let note: string | undefined;
    if (col.key === 'nextExpiry') note = ctx.t(`inspection.${nextExpiry(row)!.kind}` as never);
    if (col.key === 'nextService') {
      const at = row.usageUnit === 'KM' ? row.nextServiceKm : row.nextServiceHours;
      if (at !== null)
        note = ctx.t(row.usageUnit === 'KM' ? 'vehicle.units.km' : 'vehicle.units.hours', {
          value: ctx.number(at),
        });
    }
    return <DueCell iso={due} note={note} ctx={ctx} />;
  }
  const text = cellText(col, asRecord(row), ctx);
  if (!text) return <span className="text-muted">—</span>;
  const isId = col.key === 'vin' || col.key === 'licenseNo';
  return (
    <span
      className={cn(
        'block truncate',
        (col.kind === 'number' || col.kind === 'money' || col.kind === 'date') && 'num',
      )}
      title={text}
    >
      {isId ? <bdi dir="ltr">{text}</bdi> : col.kind === 'text' ? <bdi>{text}</bdi> : text}
    </span>
  );
}

/** The page's settings: a saved view (?view=) with any changes on top (?s=). */
function useViewState() {
  const onTable = useMatch('/fleet') !== null;
  const [params, setParams] = useSearchParams();
  const { data: views } = useSavedViews();
  const prefs = usePreferences();
  // While a vehicle is open over the table the URL is the vehicle's: keep the last settings.
  const [search, setSearch] = useState(() => params.toString());
  if (onTable && params.toString() !== search) setSearch(params.toString());
  const current = new URLSearchParams(search);
  const viewId = current.get('view');
  const view = views?.find((v) => v.id === viewId) ?? null;
  const base = view ? normalizeSettings(view.settings) : DEFAULT_FLEET_VIEW;
  const settings = decodeSettings(current.get('s')) ?? base;

  // First visit with a bare URL: open the user's default view.
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || !onTable || !prefs.data) return;
    opened.current = true;
    const id = prefs.data.fleetViewId;
    if (id && !params.has('view') && !params.has('s')) setParams({ view: id }, { replace: true });
  }, [onTable, prefs.data, params, setParams]);

  const pending = useRef<{ search: string; settings: FleetViewSettings } | null>(null);
  const write = (nextView: SavedView | null, next: FleetViewSettings | null) => {
    const p = new URLSearchParams();
    if (nextView) p.set('view', nextView.id);
    const viewBase = nextView ? normalizeSettings(nextView.settings) : DEFAULT_FLEET_VIEW;
    if (next && !sameSettings(next, viewBase)) p.set('s', encodeSettings(next));
    setParams(p, { replace: true });
  };

  return {
    settings,
    view,
    loadingView: !!viewId && !views,
    modified: !sameSettings(settings, base),
    update: (patch: Partial<FleetViewSettings>) => {
      // URL changes render in a transition, so a second change before that render (typing,
      // then clicking a filter) builds on the first one rather than on the old URL.
      const cur = pending.current?.search === search ? pending.current.settings : settings;
      const next = { ...cur, ...patch };
      pending.current = { search, settings: next };
      write(view, next);
    },
    pick: (v: SavedView | null) => {
      pending.current = null;
      write(v, null);
    },
    resetColumns: () =>
      write(view, { ...settings, columns: base.columns, collapsed: base.collapsed }),
  };
}

/**
 * The fleet table (SPEC 5.4): every vehicle, every field, with column groups, search,
 * filters, sorting, grouping, saved views and Excel export. Rows are virtualized; clicking
 * one opens the vehicle with the same fly-in as the dashboard.
 */
export default function FleetTable({ active, away }: { active: string | null; away: boolean }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const onTable = useMatch('/fleet') !== null;
  const table = useFleetTable();
  const ctx = useFormatCtx('KM');
  const { settings, view, modified, update, pick, resetColumns, loadingView } = useViewState();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [closedGroups, setClosedGroups] = useState<Set<string>>(() => new Set());
  const [exporting, setExporting] = useState(false);
  const [exportFailed, setExportFailed] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const viewWidth = useClientWidth(scroller, !!table.data);

  useEffect(() => {
    if (onTable) document.title = `${t('nav.fleetTable')} · ${t('app.name')}`;
  }, [onTable, t]);

  // Phones start with every group collapsed to one column; opening one there isn't saved.
  const phone = usePhone();
  const [phoneOpen, setPhoneOpen] = useState<FleetGroup[]>([]);
  const isCollapsed = (g: FleetGroup) =>
    phone ? !phoneOpen.includes(g) : settings.collapsed.includes(g);
  const collapse = (g: FleetGroup, on: boolean) => {
    if (phone) setPhoneOpen((cur) => (on ? cur.filter((x) => x !== g) : [...cur, g]));
    else
      update({
        collapsed: on ? [...settings.collapsed, g] : settings.collapsed.filter((x) => x !== g),
      });
  };
  const collapsedNow = phone
    ? FLEET_GROUPS.filter((g) => !phoneOpen.includes(g))
    : settings.collapsed;
  const groups = useMemo(
    () => visibleColumns({ ...settings, collapsed: collapsedNow }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- collapsedNow is derived from these
    [settings, phone, phoneOpen],
  );
  const stickyWidth = phone ? STICKY_WIDTH.phone : STICKY_WIDTH.wide;
  const columns = groups.flatMap((g) => g.columns);
  const shown = useMemo(() => {
    const rows = table.data ?? [];
    return groupRows(sortRows(filterRows(rows, settings), settings.sort, ctx), settings, ctx);
  }, [table.data, settings, ctx]);
  const shownRows = shown.flatMap((g) => g.rows);

  const items = useMemo(() => {
    const out: Item[] = [];
    for (const g of shown) {
      const closed = closedGroups.has(g.key);
      if (settings.groupBy !== 'none')
        out.push({ kind: 'group', key: g.key, label: g.label, count: g.rows.length, closed });
      if (closed) continue;
      for (const row of g.rows) {
        out.push({ kind: 'row', row });
        if (expanded.has(row.serial)) out.push({ kind: 'detail', row });
      }
    }
    return out;
  }, [shown, closedGroups, expanded, settings.groupBy]);

  // TanStack Virtual returns fresh functions each render; the compiler skips this component.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtual = useVirtualizer({
    count: items.length,
    getScrollElement: () => scroller.current,
    estimateSize: (i) => SIZE[items[i]!.kind],
    getItemKey: (i) => {
      const it = items[i]!;
      return it.kind === 'group' ? `g:${it.key}` : `${it.kind}:${it.row.serial}`;
    },
    overscan: 10,
  });
  const virtualItems = virtual.getVirtualItems();
  const padTop = virtualItems[0]?.start ?? 0;
  const padBottom = virtual.getTotalSize() - (virtualItems.at(-1)?.end ?? 0);
  const width = stickyWidth + columns.reduce((sum, c) => sum + c.width, 0);
  const span = columns.length + 1;

  const open = (serial: string, panel?: string) =>
    navigate(
      `/vehicles/${encodeURIComponent(serial)}${panel && panel !== 'items' ? `?panel=${panel}` : ''}`,
      { state: { fromDashboard: true, from: 'fleet' } },
    );
  const toggle = (set: Set<string>, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };
  const sortBy = (id: FleetSort['id'], multi: boolean) => {
    const current = settings.sort.find((s) => s.id === id);
    const next: FleetSort[] = current
      ? current.desc
        ? settings.sort.filter((s) => s.id !== id)
        : settings.sort.map((s) => (s.id === id ? { ...s, desc: true } : s))
      : [...(multi ? settings.sort : []), { id, desc: false }].slice(-3);
    update({ sort: next });
  };

  const runExport = async (scope: 'view' | 'fleet') => {
    setExporting(true);
    setExportFailed(false);
    try {
      const mod = await import('./exportFleet');
      if (scope === 'view')
        await mod.exportView({
          rows: shownRows,
          columns,
          viewName: view?.name ?? t('fleet.views.all'),
          ctx,
        });
      else await mod.exportFleet({ rows: table.data ?? [], ctx });
    } catch {
      setExportFailed(true);
    } finally {
      setExporting(false);
    }
  };

  const sortHeader = (id: FleetSort['id'], label: string) => {
    const index = settings.sort.findIndex((s) => s.id === id);
    const s = settings.sort[index];
    return (
      <button
        type="button"
        onClick={(e) => sortBy(id, e.shiftKey)}
        className="hover:text-text inline-flex max-w-full items-center gap-1 text-start"
        title={t('fleet.sortHint')}
      >
        <span className="truncate" title={label}>
          {label}
        </span>
        {s &&
          (s.desc ? (
            <ArrowDown aria-hidden className="size-3 shrink-0" />
          ) : (
            <ArrowUp aria-hidden className="size-3 shrink-0" />
          ))}
        {s && settings.sort.length > 1 && <span className="num text-[0.6rem]">{index + 1}</span>}
      </button>
    );
  };
  const ariaSort = (id: FleetSort['id']) => {
    const s = settings.sort.find((x) => x.id === id);
    return s ? (s.desc ? 'descending' : 'ascending') : undefined;
  };

  const total = table.data?.length ?? 0;
  const stickyCell = 'bg-surface-strong sticky start-0 z-10 border-e border-border';

  return (
    <motion.section
      aria-labelledby="fleet-table-title"
      className="glass flex flex-col gap-3 p-3"
      initial={false}
      animate={{ opacity: away ? 0 : 1 }}
      transition={fade.base}
      data-testid="fleet-table"
    >
      <div className="relative z-40 flex flex-wrap items-center gap-2">
        <h1 id="fleet-table-title" className="text-lg font-semibold tracking-tight">
          {t('nav.fleetTable')}
        </h1>
        <ViewsMenu view={view} settings={settings} modified={modified} onPick={pick} />
        <span className="text-muted text-xs" data-testid="fleet-count">
          {t('fleet.count', { shown: shownRows.length, total })}
        </span>
        <div className="ms-auto flex items-center gap-2">
          <ColumnsMenu settings={settings} update={update} onReset={resetColumns} />
          <ExportMenu busy={exporting} error={exportFailed} onExport={(s) => void runExport(s)} />
        </div>
      </div>
      <div className="relative z-30 flex flex-wrap items-center gap-2">
        <SearchBox settings={settings} update={update} />
        <Filters settings={settings} update={update} />
        <div className="hidden lg:block">
          <GroupBySelect settings={settings} update={update} />
        </div>
      </div>

      {table.isPending || loadingView ? (
        <div className="text-muted grid h-64 place-items-center" role="status">
          <Loader2 aria-hidden className="size-6 animate-spin" />
          <span className="sr-only">{t('common.loading')}</span>
        </div>
      ) : table.isError ? (
        <div className="grid h-64 place-items-center gap-3 text-center">
          <p role="alert">{t('fleet.error')}</p>
          <Button variant="outline" size="sm" onClick={() => void table.refetch()}>
            {t('dashboard.retry')}
          </Button>
        </div>
      ) : (
        <div
          ref={scroller}
          className="border-border relative h-[calc(100dvh-17rem)] min-h-72 overflow-auto rounded-lg border lg:h-[calc(100dvh-17rem)]"
          data-testid="fleet-scroller"
        >
          <table
            className="border-separate border-spacing-0 text-sm"
            style={{ width, tableLayout: 'fixed' }}
            dir={i18n.dir()}
            data-testid="fleet-grid"
            aria-rowcount={shownRows.length + 2}
          >
            <colgroup>
              <col style={{ width: stickyWidth }} />
              {columns.map((c) => (
                <col key={c.key} style={{ width: c.width }} />
              ))}
            </colgroup>
            <thead className="text-muted sticky top-0 z-20 text-xs">
              <tr>
                <th
                  rowSpan={2}
                  scope="col"
                  aria-sort={ariaSort(SERIAL)}
                  className={cn(
                    stickyCell,
                    'z-30 border-b px-2 py-1.5 text-start align-bottom font-medium',
                  )}
                >
                  {sortHeader(SERIAL, t('fleet.col.serial'))}
                </th>
                {groups.map((g) => (
                  <th
                    key={g.group}
                    colSpan={g.columns.length}
                    scope="colgroup"
                    className="bg-surface-strong border-border border-e border-b px-2 py-1 text-start font-semibold"
                  >
                    <GroupMenu
                      group={g.group}
                      collapsed={isCollapsed(g.group)}
                      onCollapse={(on) => collapse(g.group, on)}
                      settings={settings}
                      update={update}
                    />
                  </th>
                ))}
              </tr>
              <tr>
                {columns.map((c) => (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={ariaSort(c.key)}
                    className="bg-surface-strong border-border border-b px-2 py-1.5 text-start font-medium"
                  >
                    {sortHeader(c.key, t(c.header as never))}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {padTop > 0 && (
                <tr aria-hidden>
                  <td colSpan={span} style={{ height: padTop, padding: 0 }} />
                </tr>
              )}
              {virtualItems.map((vi) => {
                const item = items[vi.index]!;
                if (item.kind === 'group') {
                  return (
                    <tr key={vi.key} ref={virtual.measureElement} data-index={vi.index}>
                      <th
                        scope="rowgroup"
                        colSpan={span}
                        className="bg-surface border-border border-b p-0 text-start"
                      >
                        <button
                          type="button"
                          aria-expanded={!item.closed}
                          onClick={() => setClosedGroups((s) => toggle(s, item.key))}
                          className="sticky start-0 flex h-9 items-center gap-2 px-2 text-sm font-semibold"
                          data-testid="table-group"
                        >
                          <ChevronRight
                            aria-hidden
                            className={cn(
                              'size-4 transition-transform',
                              // Open points down; closed points toward the inline end.
                              !item.closed ? 'rotate-90' : 'rtl:-scale-x-100',
                            )}
                          />
                          {item.label}
                          <span className="text-muted num text-xs font-normal">
                            {t('dashboard.sectionCount', { count: item.count })}
                          </span>
                        </button>
                      </th>
                    </tr>
                  );
                }
                if (item.kind === 'detail') {
                  return (
                    <tr key={vi.key} ref={virtual.measureElement} data-index={vi.index}>
                      <td colSpan={span} className="bg-surface border-border border-b p-0">
                        <div className="sticky start-0" style={{ width: viewWidth || undefined }}>
                          <RowDetail
                            row={item.row}
                            ctx={ctx}
                            onOpen={(panel) => open(item.row.serial, panel)}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                }
                const row = item.row;
                const { icon: Icon, tone } = STATUS_ICON[row.status];
                const isOpen = expanded.has(row.serial);
                return (
                  <tr
                    key={vi.key}
                    ref={virtual.measureElement}
                    data-index={vi.index}
                    data-row={row.serial}
                    // The second click of a double click would open the vehicle twice.
                    onClick={(e) => e.detail < 2 && open(row.serial)}
                    className="group cursor-pointer hover:[&>td:not(:first-child)]:bg-border/40"
                  >
                    <td
                      className={cn(
                        stickyCell,
                        // An inset shadow tints the opaque sticky cell, so nothing shows through it.
                        'border-b px-1 py-1 group-hover:shadow-[inset_0_0_0_100vmax_color-mix(in_srgb,var(--color-border)_40%,transparent)]',
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          aria-expanded={isOpen}
                          aria-label={t(isOpen ? 'fleet.collapseRow' : 'fleet.expandRow', {
                            serial: row.serial,
                          })}
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpanded((s) => toggle(s, row.serial));
                          }}
                          className="text-muted hover:text-text grid size-7 shrink-0 place-items-center rounded-md"
                          data-testid="expand-row"
                        >
                          <ChevronRight
                            aria-hidden
                            className={cn(
                              'size-4 transition-transform',
                              // Open points down; closed points toward the inline end.
                              isOpen ? 'rotate-90' : 'rtl:-scale-x-100',
                            )}
                          />
                        </button>
                        <Icon
                          aria-label={t(`status.${row.status}`)}
                          role="img"
                          className={cn('size-4 shrink-0', tone)}
                        />
                        <div
                          className="grid w-9 shrink-0 place-items-center"
                          style={{ height: VISUAL_HEIGHT }}
                        >
                          <div
                            data-tile-visual={row.serial}
                            style={{ opacity: active === row.serial ? 0 : 1 }}
                          >
                            <VehicleVisual
                              type={row.type}
                              view="top"
                              status={row.status}
                              size={visualSize(row.type)}
                            />
                          </div>
                        </div>
                        <button
                          type="button"
                          data-tile={row.serial}
                          onClick={(e) => {
                            e.stopPropagation();
                            open(row.serial);
                          }}
                          aria-label={t('dashboard.openVehicle', { serial: row.serial })}
                          className="min-w-0 truncate font-mono text-sm font-medium hover:underline"
                        >
                          <bdi dir="ltr">{row.serial}</bdi>
                        </button>
                      </div>
                    </td>
                    {columns.map((c) => (
                      <td key={c.key} className="border-border border-b px-2 py-1 align-middle">
                        <Cell col={c} row={row} ctx={ctx} />
                      </td>
                    ))}
                  </tr>
                );
              })}
              {padBottom > 0 && (
                <tr aria-hidden>
                  <td colSpan={span} style={{ height: padBottom, padding: 0 }} />
                </tr>
              )}
            </tbody>
          </table>
          {items.length === 0 && (
            <p className="text-muted sticky start-0 py-10 text-center text-sm">
              {t('dashboard.noVehicles')}
            </p>
          )}
        </div>
      )}
    </motion.section>
  );
}

/** Top views fit a small box in the sticky cell, like the dashboard tiles fit theirs. */
function visualSize(type: string) {
  const { top } = drawingFor(type);
  return Math.min(36, (VISUAL_HEIGHT * top.width) / top.height);
}

/** The scroller's visible width, so an opened row's details stay in view while scrolling sideways. */
function useClientWidth(ref: React.RefObject<HTMLElement | null>, ready: boolean) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, ready]);
  return width;
}
