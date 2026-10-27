import {
  DEFAULT_FLEET_VIEW,
  DUE_SOON_DAYS,
  FLEET_COLUMNS,
  FLEET_GROUPS,
  type FleetColumn,
  type FleetGroup,
  type FleetSort,
  type FleetViewSettings,
  type UsageUnit,
  type VehicleCategory,
  type VehicleStatus,
} from '@fleet-hub/shared';
import { lookupName, type Lookups } from '@/fleet/data';
import type { Cell, Column, FormatCtx } from '@/vehicle/records/kinds';
import type { RecordRow } from '@/vehicle/records/api';

/** One vehicle as GET /api/fleet/table returns it. Never carries a start code. */
export interface FleetRow {
  serial: string;
  vin: string | null;
  licenseNo: string | null;
  make: string;
  model: string;
  year: number | null;
  operatorName: string | null;
  odometerKm: number | null;
  engineHours: number | null;
  nextServiceKm: number | null;
  nextServiceHours: number | null;
  nextServiceDate: string | null;
  readinessPct: number;
  annualTestExpiry: string | null;
  insuranceExpiry: string | null;
  safetyCheckExpiry: string | null;
  status: VehicleStatus;
  statusOverride: VehicleStatus | null;
  purchaseDate: string | null;
  purchasePrice: number | null;
  warrantyExpiry: string | null;
  supplier: string | null;
  type: string;
  category: VehicleCategory;
  usageUnit: UsageUnit;
  department: string | null;
  location: string | null;
  items: string[];
  openIssues: number;
  lastActivity: string | null;
  lastService: string | null;
  services12m: number;
  economy30: number | null;
  lastFuel: { date: string; liters: number } | null;
  costs: Record<
    'maintenance12m' | 'fuel12m' | 'total12m' | 'maintenance3m' | 'fuel3m' | 'total3m',
    number
  >;
}

const DAY_MS = 86_400_000;
const date = (v: string | null | undefined) => (v ? new Date(v) : null);
const STATUS_RANK: Record<VehicleStatus, number> = { RED: 0, AMBER: 1, GREEN: 2 };

/** Whole days from today to `iso` (negative when overdue). */
export function daysUntil(iso: string, now = new Date()) {
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((day(new Date(iso)) - day(now)) / DAY_MS);
}

/** The soonest of the three compliance expiries. */
export function nextExpiry(r: FleetRow): { kind: string; date: string } | null {
  const all = [
    { kind: 'ANNUAL_TEST', date: r.annualTestExpiry },
    { kind: 'INSURANCE', date: r.insuranceExpiry },
    { kind: 'SAFETY_CHECK', date: r.safetyCheckExpiry },
  ].filter((e): e is { kind: string; date: string } => !!e.date);
  return all.sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
}

export interface FleetColumnDef extends Column {
  key: FleetColumn;
  group: FleetGroup;
  /** Width in px; the table uses fixed widths so virtual rows never shift columns. */
  width: number;
  /** Comparable value for sorting; empty values always sort last. */
  sortValue: (r: FleetRow, ctx: FormatCtx) => string | number | null;
  /** Shown as a countdown coloured by how close it is. */
  due?: (r: FleetRow) => string | null;
  /** Columns that replace this one in Excel, e.g. usage → odometer and engine hours. */
  excel?: Column[];
}

const row = (r: RecordRow) => r as unknown as FleetRow;
const name = (list: keyof Lookups, code: string | null, ctx: FormatCtx) =>
  code
    ? (lookupName(
        ctx.lookups?.[list].find((i) => i.code === code),
        ctx.lang,
      ) ?? code)
    : null;
const units = (r: FleetRow, value: number, ctx: FormatCtx) =>
  ctx.t(r.usageUnit === 'KM' ? 'vehicle.units.km' : 'vehicle.units.hours', {
    value: ctx.number(value),
  });

function def(
  key: FleetColumn,
  group: FleetGroup,
  width: number,
  kind: Column['kind'],
  value: (r: FleetRow, ctx: FormatCtx) => Cell,
  extra: Partial<FleetColumnDef> = {},
): FleetColumnDef {
  const raw = (r: RecordRow, ctx: FormatCtx) => value(row(r), ctx);
  return {
    key,
    group,
    width,
    kind,
    header: `fleet.col.${key}`,
    value: raw,
    sortValue: (r, ctx) => {
      const v = value(r, ctx);
      if (v instanceof Date) return v.getTime();
      if (typeof v === 'boolean') return v ? 1 : 0;
      return v === '' ? null : v;
    },
    ...extra,
  };
}

const plain = (key: string, header: string, kind: Column['kind'], value: Column['value']) =>
  ({ key, header, kind, value }) satisfies Column;

/** Every fleet-table column, by id (SPEC 5.4). */
export const FLEET_COLUMN_DEFS: Record<FleetColumn, FleetColumnDef> = {
  // Identity
  type: def('type', 'identity', 150, 'text', (r, ctx) => name('vehicleTypes', r.type, ctx)),
  make: def('make', 'identity', 120, 'text', (r) => r.make),
  model: def('model', 'identity', 120, 'text', (r) => r.model),
  year: def('year', 'identity', 70, 'number', (r) => r.year, { numFmt: '0' }),
  vin: def('vin', 'identity', 190, 'text', (r) => r.vin),
  licenseNo: def('licenseNo', 'identity', 120, 'text', (r) => r.licenseNo),
  department: def('department', 'identity', 130, 'text', (r, ctx) =>
    name('departments', r.department, ctx),
  ),
  location: def('location', 'identity', 150, 'text', (r, ctx) =>
    name('locations', r.location, ctx),
  ),
  operator: def('operator', 'identity', 140, 'text', (r) => r.operatorName),
  // Status & readiness
  status: def('status', 'status', 140, 'text', (r) => r.status, {
    text: (r, ctx) => ctx.t(`status.${row(r).status}`),
    sortValue: (r) => STATUS_RANK[r.status],
  }),
  readiness: def('readiness', 'status', 100, 'number', (r) => r.readinessPct, {
    numFmt: '0"%"',
    text: (r, ctx) => `${ctx.number(row(r).readinessPct)}%`,
  }),
  openIssues: def('openIssues', 'status', 110, 'number', (r) => r.openIssues),
  lastActivity: def('lastActivity', 'status', 120, 'date', (r) => date(r.lastActivity)),
  // Usage
  usage: def(
    'usage',
    'usage',
    150,
    'number',
    (r) => (r.usageUnit === 'KM' ? r.odometerKm : r.engineHours),
    {
      text: (r, ctx) => {
        const v = row(r).usageUnit === 'KM' ? row(r).odometerKm : row(r).engineHours;
        return v === null ? '' : units(row(r), v, ctx);
      },
      excel: [
        plain('odometerKm', 'fleet.col.odometerKm', 'number', (r) => row(r).odometerKm),
        plain('engineHours', 'fleet.col.engineHours', 'number', (r) => row(r).engineHours),
      ],
    },
  ),
  economy30: def('economy30', 'usage', 130, 'number', (r) => r.economy30, {
    text: (r, ctx) =>
      row(r).economy30 === null
        ? ''
        : ctx.t(row(r).usageUnit === 'KM' ? 'vehicle.units.KM_PER_L' : 'vehicle.units.L_PER_HOUR', {
            value: ctx.number(row(r).economy30!, 1),
          }),
    excel: [
      plain('economyKm', 'fleet.col.economyKm', 'number', (r) =>
        row(r).usageUnit === 'KM' ? row(r).economy30 : null,
      ),
      plain('economyHours', 'fleet.col.economyHours', 'number', (r) =>
        row(r).usageUnit === 'HOURS' ? row(r).economy30 : null,
      ),
    ],
  }),
  lastFuel: def('lastFuel', 'usage', 150, 'date', (r) => date(r.lastFuel?.date), {
    text: (r, ctx) => {
      const f = row(r).lastFuel;
      return f
        ? ctx.t('vehicle.info.lastFuelValue', {
            liters: ctx.number(f.liters, 1),
            date: ctx.date(f.date),
          })
        : '';
    },
    excel: [
      plain('lastFuelDate', 'fleet.col.lastFuelDate', 'date', (r) => date(row(r).lastFuel?.date)),
      plain('lastFuelLiters', 'fleet.col.lastFuelLiters', 'number', (r) =>
        row(r).lastFuel ? row(r).lastFuel!.liters : null,
      ),
    ],
  }),
  // Maintenance
  nextService: def('nextService', 'maintenance', 160, 'date', (r) => date(r.nextServiceDate), {
    text: (r, ctx) => {
      const v = row(r);
      const at = v.usageUnit === 'KM' ? v.nextServiceKm : v.nextServiceHours;
      const parts = [
        v.nextServiceDate ? ctx.date(v.nextServiceDate) : null,
        at !== null ? units(v, at, ctx) : null,
      ];
      return parts.filter(Boolean).join(' · ');
    },
    due: (r) => r.nextServiceDate,
    excel: [
      plain('nextServiceDate', 'fleet.col.nextServiceDate', 'date', (r) =>
        date(row(r).nextServiceDate),
      ),
      plain('nextServiceKm', 'fleet.col.nextServiceKm', 'number', (r) => row(r).nextServiceKm),
      plain(
        'nextServiceHours',
        'fleet.col.nextServiceHours',
        'number',
        (r) => row(r).nextServiceHours,
      ),
    ],
  }),
  lastService: def('lastService', 'maintenance', 120, 'date', (r) => date(r.lastService)),
  services12m: def('services12m', 'maintenance', 120, 'number', (r) => r.services12m),
  // Compliance
  nextExpiry: def('nextExpiry', 'compliance', 190, 'date', (r) => date(nextExpiry(r)?.date), {
    due: (r) => nextExpiry(r)?.date ?? null,
    text: (r, ctx) => {
      const e = nextExpiry(row(r));
      return e ? `${ctx.t(`inspection.${e.kind}` as never)} · ${ctx.date(e.date)}` : '';
    },
  }),
  annualTest: def('annualTest', 'compliance', 120, 'date', (r) => date(r.annualTestExpiry), {
    due: (r) => r.annualTestExpiry,
  }),
  insurance: def('insurance', 'compliance', 120, 'date', (r) => date(r.insuranceExpiry), {
    due: (r) => r.insuranceExpiry,
  }),
  safetyCheck: def('safetyCheck', 'compliance', 150, 'date', (r) => date(r.safetyCheckExpiry), {
    due: (r) => r.safetyCheckExpiry,
  }),
  // Ownership & warranty
  warrantyExpiry: def('warrantyExpiry', 'ownership', 130, 'date', (r) => date(r.warrantyExpiry)),
  purchaseDate: def('purchaseDate', 'ownership', 120, 'date', (r) => date(r.purchaseDate)),
  supplier: def('supplier', 'ownership', 150, 'text', (r) => r.supplier),
  purchasePrice: def('purchasePrice', 'ownership', 130, 'money', (r) => r.purchasePrice),
  // Equipment
  items: def('items', 'equipment', 200, 'text', (r) => r.items.join(', '), {
    sortValue: (r) => r.items.length,
  }),
  // Costs
  total12m: def('total12m', 'costs', 120, 'money', (r) => r.costs.total12m),
  maintenance12m: def('maintenance12m', 'costs', 130, 'money', (r) => r.costs.maintenance12m),
  fuel12m: def('fuel12m', 'costs', 120, 'money', (r) => r.costs.fuel12m),
  total3m: def('total3m', 'costs', 120, 'money', (r) => r.costs.total3m),
  maintenance3m: def('maintenance3m', 'costs', 130, 'money', (r) => r.costs.maintenance3m),
  fuel3m: def('fuel3m', 'costs', 120, 'money', (r) => r.costs.fuel3m),
};

export const SERIAL_COLUMN: Column = {
  key: 'serial',
  header: 'fleet.col.serial',
  kind: 'text',
  value: (r) => row(r).serial,
};

/** The visible columns of each group, in group order. A collapsed group keeps its first column. */
export function visibleColumns(settings: FleetViewSettings) {
  const shown = new Set(settings.columns);
  const out: { group: FleetGroup; columns: FleetColumnDef[] }[] = [];
  for (const group of FLEET_GROUPS) {
    let ids: FleetColumn[] = FLEET_COLUMNS[group].filter((c) => shown.has(c));
    if (!ids.length) continue;
    if (settings.collapsed.includes(group)) ids = ids.slice(0, 1);
    out.push({ group, columns: ids.map((id) => FLEET_COLUMN_DEFS[id]) });
  }
  return out;
}

/** True when a service or an expiry falls within the next DUE_SOON_DAYS days, or is overdue. */
export function isDueSoon(r: FleetRow, now = new Date()) {
  const dates = [r.nextServiceDate, r.annualTestExpiry, r.insuranceExpiry, r.safetyCheckExpiry];
  if (dates.some((d) => d && daysUntil(d, now) <= DUE_SOON_DAYS)) return true;
  if (r.nextServiceKm !== null && r.odometerKm !== null && r.odometerKm >= r.nextServiceKm)
    return true;
  return (
    r.nextServiceHours !== null && r.engineHours !== null && r.engineHours >= r.nextServiceHours
  );
}

const fold = (s: string) => s.toLocaleLowerCase().normalize('NFKC');

/** Search and filters (SPEC 5.4). Search looks in serial, plate, VIN, make, model and operator. */
export function filterRows(rows: FleetRow[], s: FleetViewSettings, now = new Date()) {
  const q = fold(s.q.trim());
  return rows.filter((r) => {
    if (s.status.length && !s.status.includes(r.status)) return false;
    if (s.types.length && !s.types.includes(r.type)) return false;
    if (s.departments.length && !s.departments.includes(r.department ?? '')) return false;
    if (s.locations.length && !s.locations.includes(r.location ?? '')) return false;
    if (s.issues && r.openIssues === 0) return false;
    if (s.due && !isDueSoon(r, now)) return false;
    if (!q) return true;
    return [r.serial, r.licenseNo, r.vin, r.make, r.model, r.operatorName].some(
      (v) => v && fold(v).includes(q),
    );
  });
}

export function sortRows(rows: FleetRow[], sort: FleetSort[], ctx: FormatCtx) {
  const keys = sort.length ? sort : DEFAULT_FLEET_VIEW.sort;
  const collator = new Intl.Collator(ctx.lang, { numeric: true, sensitivity: 'base' });
  const value = (r: FleetRow, id: FleetSort['id']) =>
    id === 'serial' ? r.serial : FLEET_COLUMN_DEFS[id].sortValue(r, ctx);
  return [...rows].sort((a, b) => {
    for (const { id, desc } of keys) {
      const x = value(a, id);
      const y = value(b, id);
      if (x === y) continue;
      // Empty values go last whichever way the column sorts.
      if (x === null) return 1;
      if (y === null) return -1;
      const c =
        typeof x === 'number' && typeof y === 'number'
          ? x - y
          : collator.compare(String(x), String(y));
      if (c !== 0) return desc ? -c : c;
    }
    return collator.compare(a.serial, b.serial);
  });
}

export interface RowGroup {
  key: string;
  label: string;
  rows: FleetRow[];
}

/** Groups by type or department, ordered by name; vehicles without a department go last. */
export function groupRows(rows: FleetRow[], s: FleetViewSettings, ctx: FormatCtx): RowGroup[] {
  if (s.groupBy === 'none') return [{ key: '', label: '', rows }];
  const list = s.groupBy === 'type' ? 'vehicleTypes' : 'departments';
  const map = new Map<string, FleetRow[]>();
  for (const r of rows) {
    const key = (s.groupBy === 'type' ? r.type : r.department) ?? '';
    map.set(key, [...(map.get(key) ?? []), r]);
  }
  const collator = new Intl.Collator(ctx.lang);
  return [...map.entries()]
    .map(([key, groupRows]) => ({
      key,
      label: key ? (name(list, key, ctx) ?? key) : ctx.t('fleet.noDepartment'),
      rows: groupRows,
    }))
    .sort((a, b) => (!a.key ? 1 : !b.key ? -1 : collator.compare(a.label, b.label)));
}

/** Columns as Excel writes them: unit-dependent columns split into one column per unit. */
export function excelColumns(columns: FleetColumnDef[]): Column[] {
  return [SERIAL_COLUMN, ...columns.flatMap((c) => c.excel ?? [c])];
}

// ---------- Settings in the URL ----------

const toBase64Url = (s: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(s)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const fromBase64Url = (s: string) =>
  new TextDecoder().decode(
    Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)),
  );

export function encodeSettings(s: FleetViewSettings) {
  return toBase64Url(JSON.stringify(s));
}

/** Reads settings from the URL, keeping only what is valid so an old or edited link still opens. */
export function decodeSettings(raw: string | null): FleetViewSettings | null {
  if (!raw) return null;
  try {
    return normalizeSettings(JSON.parse(fromBase64Url(raw)));
  } catch {
    return null;
  }
}

const strings = (v: unknown) =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string'))] : [];

export function normalizeSettings(v: unknown): FleetViewSettings {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const d = DEFAULT_FLEET_VIEW;
  const columnIds = new Set<string>(Object.keys(FLEET_COLUMN_DEFS));
  const sortIds = new Set<string>(['serial', ...columnIds]);
  return {
    columns: Array.isArray(o.columns)
      ? (strings(o.columns).filter((c) => columnIds.has(c)) as FleetColumn[])
      : d.columns,
    collapsed: strings(o.collapsed).filter((g) =>
      (FLEET_GROUPS as readonly string[]).includes(g),
    ) as FleetGroup[],
    sort: Array.isArray(o.sort)
      ? (o.sort as unknown[])
          .filter(
            (x): x is FleetSort =>
              !!x &&
              typeof x === 'object' &&
              sortIds.has(String((x as FleetSort).id)) &&
              typeof (x as FleetSort).desc === 'boolean',
          )
          .slice(0, 3)
      : d.sort,
    groupBy: o.groupBy === 'type' || o.groupBy === 'department' ? o.groupBy : 'none',
    q: typeof o.q === 'string' ? o.q.slice(0, 100) : '',
    status: strings(o.status).filter((x) => x in STATUS_RANK),
    types: strings(o.types),
    departments: strings(o.departments),
    locations: strings(o.locations),
    due: o.due === true,
    issues: o.issues === true,
  };
}

export const sameSettings = (a: FleetViewSettings, b: FleetViewSettings) =>
  JSON.stringify(normalizeSettings(a)) === JSON.stringify(normalizeSettings(b));
