import type { TFunction } from 'i18next';
import {
  INSPECTION_KINDS,
  MALFUNCTION_SEVERITIES,
  MALFUNCTION_STATES,
  type RecordKind,
  type UsageUnit,
} from '@fleet-hub/shared';
import { lookupName, type Lookups } from '@/fleet/data';
import type { RecordFilters, RecordRow } from './api';

/** Everything a cell or an export value needs to format itself in the active language. */
export interface FormatCtx {
  t: TFunction;
  lang: string;
  lookups: Lookups | undefined;
  unit: UsageUnit;
  date: (iso: string) => string;
  number: (n: number, digits?: number) => string;
  money: (n: number) => string;
}

export type Cell = string | number | Date | boolean | null;

export interface Column {
  key: string;
  /** i18n key of the header, also used as the Excel header. */
  header: string;
  /** Server sort key, when the column is sortable. */
  sort?: string;
  kind: 'date' | 'text' | 'number' | 'money' | 'bool' | 'long';
  /** The raw value: a Date, number, string or boolean; formatted by `kind` on screen. */
  value: (row: RecordRow, ctx: FormatCtx) => Cell;
  /** Overrides the on-screen text (e.g. enum labels). */
  text?: (row: RecordRow, ctx: FormatCtx) => string;
  /** Excel number format for numbers, e.g. '0.0'. */
  numFmt?: string;
  /** Hidden on phones' row cards. */
  minor?: boolean;
}

export type FieldType =
  'date' | 'number' | 'money' | 'text' | 'textarea' | 'select' | 'bool' | 'reading';

export interface Field {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  /** For selects: the values, and how each is labelled. */
  options?: (ctx: FormatCtx) => { value: string; label: string }[];
  /** Shown only when this returns true for the current form values. */
  when?: (values: FormValues) => boolean;
  /** Only when adding a record (e.g. "set next service"). */
  createOnly?: boolean;
  /** Decimal places allowed for numbers. */
  step?: number;
  hint?: string;
}

export type FormValues = Record<string, string | boolean>;

export interface Filter {
  key: keyof RecordFilters;
  label: string;
  type: 'select' | 'toggle';
  options?: (ctx: FormatCtx) => { value: string; label: string }[];
}

export interface KindUi {
  ownerType: string;
  dateKey: string;
  fields: Field[];
  columns: Column[];
  filters: Filter[];
  /** The text search is offered only when the server searches some column. */
  searchable: boolean;
  /** Blank form for a new record. */
  defaults: (ctx: { unit: UsageUnit; location: string | null }) => FormValues;
}

/** A local calendar day as YYYY-MM-DD, the value of a date input. */
export const localDay = (date: Date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const today = () => localDay();
const s = (v: unknown) => (typeof v === 'string' ? v : null);
const n = (v: unknown) => (typeof v === 'number' ? v : null);
const d = (v: unknown) => (typeof v === 'string' ? new Date(v) : null);

const lookupOptions = (list: 'locations' | 'fluidTypes') => (ctx: FormatCtx) =>
  (ctx.lookups?.[list] ?? []).map((i) => ({
    value: i.code,
    label: lookupName(i, ctx.lang) ?? i.code,
  }));
const lookupText = (list: 'locations' | 'fluidTypes', code: unknown, ctx: FormatCtx) =>
  typeof code === 'string'
    ? (lookupName(
        ctx.lookups?.[list].find((i) => i.code === code),
        ctx.lang,
      ) ?? code)
    : '';
const enumOptions =
  (values: readonly string[], prefix: 'severity' | 'malfunctionState' | 'inspection') =>
  (ctx: FormatCtx) =>
    values.map((value) => ({
      value,
      label: label(ctx.t, prefix, value),
    }));
function label(t: TFunction, prefix: string, value: string) {
  // Severity labels are lower case for use mid-sentence; capitalise for lists and cells.
  const text = t(`${prefix}.${value}` as never) as string;
  return prefix === 'severity' ? text.charAt(0).toLocaleUpperCase() + text.slice(1) : text;
}

const readingKey = (unit: UsageUnit) => (unit === 'KM' ? 'odometerKm' : 'engineHours');

// ---------- Shared columns ----------

const dateCol = (key: string, header: string, sort = key): Column => ({
  key,
  header,
  sort,
  kind: 'date',
  value: (r) => d(r[key]),
});
const textCol = (key: string, header: string, extra: Partial<Column> = {}): Column => ({
  key,
  header,
  kind: 'text',
  value: (r) => s(r[key]),
  ...extra,
});
const moneyCol = (key = 'cost', header = 'records.col.cost'): Column => ({
  key,
  header,
  sort: key,
  kind: 'money',
  value: (r) => n(r[key]),
  numFmt: '#,##0.00 "₪"',
});
const readingCol: Column = {
  key: 'reading',
  header: 'records.col.reading',
  kind: 'number',
  value: (r, ctx) => n(r[readingKey(ctx.unit)]),
  text: (r, ctx) => {
    const v = n(r[readingKey(ctx.unit)]);
    return v === null
      ? ''
      : ctx.t(ctx.unit === 'KM' ? 'vehicle.units.km' : 'vehicle.units.hours', {
          value: ctx.number(v),
        });
  },
  numFmt: '#,##0',
};
const litersCol: Column = {
  key: 'liters',
  header: 'records.col.liters',
  sort: 'liters',
  kind: 'number',
  value: (r) => n(r.liters),
  text: (r, ctx) => ctx.t('records.liters', { value: ctx.number(n(r.liters) ?? 0, 1) }),
  numFmt: '0.0',
};

// ---------- Shared fields ----------

const dateField = (key = 'date', labelKey = 'records.col.date'): Field => ({
  key,
  label: labelKey,
  type: 'date',
  required: true,
});
const costField: Field = { key: 'cost', label: 'records.col.cost', type: 'money', step: 2 };
const readingField: Field = { key: 'reading', label: 'records.col.reading', type: 'reading' };
const notesField: Field = { key: 'notes', label: 'records.col.notes', type: 'textarea' };

export const KIND_UI: Record<RecordKind, KindUi> = {
  service: {
    ownerType: 'ServiceRecord',
    dateKey: 'date',
    searchable: true,
    fields: [
      dateField(),
      readingField,
      { key: 'description', label: 'records.col.description', type: 'textarea', required: true },
      { key: 'vendor', label: 'records.col.vendor', type: 'text' },
      costField,
      {
        key: 'nextServiceDate',
        label: 'records.field.nextServiceDate',
        type: 'date',
        createOnly: true,
      },
      {
        key: 'nextServiceReading',
        label: 'records.field.nextServiceReading',
        type: 'reading',
        createOnly: true,
      },
    ],
    columns: [
      dateCol('date', 'records.col.date'),
      readingCol,
      textCol('description', 'records.col.description', { kind: 'long' }),
      textCol('vendor', 'records.col.vendor', { sort: 'vendor', minor: true }),
      moneyCol(),
    ],
    filters: [],
    defaults: () => ({ date: today() }),
  },
  malfunctions: {
    ownerType: 'Malfunction',
    dateKey: 'reportedAt',
    searchable: true,
    fields: [
      dateField('reportedAt', 'records.col.reportedAt'),
      {
        key: 'severity',
        label: 'records.col.severity',
        type: 'select',
        required: true,
        options: enumOptions(MALFUNCTION_SEVERITIES, 'severity'),
      },
      {
        key: 'state',
        label: 'records.col.state',
        type: 'select',
        required: true,
        options: enumOptions(MALFUNCTION_STATES, 'malfunctionState'),
      },
      {
        key: 'resolvedAt',
        label: 'records.col.resolvedAt',
        type: 'date',
        when: (v) => v.state === 'RESOLVED',
        hint: 'records.field.resolvedHint',
      },
      { key: 'isAccident', label: 'records.col.accident', type: 'bool' },
      { key: 'description', label: 'records.col.description', type: 'textarea', required: true },
      { key: 'downtimeHours', label: 'records.col.downtime', type: 'number' },
      costField,
    ],
    columns: [
      dateCol('reportedAt', 'records.col.reportedAt'),
      {
        key: 'severity',
        header: 'records.col.severity',
        sort: 'severity',
        kind: 'text',
        value: (r) => s(r.severity),
        text: (r, ctx) => label(ctx.t, 'severity', s(r.severity) ?? ''),
      },
      {
        key: 'state',
        header: 'records.col.state',
        sort: 'state',
        kind: 'text',
        value: (r) => s(r.state),
        text: (r, ctx) => label(ctx.t, 'malfunctionState', s(r.state) ?? ''),
      },
      {
        key: 'isAccident',
        header: 'records.col.accident',
        kind: 'bool',
        value: (r) => r.isAccident === true,
        minor: true,
      },
      textCol('description', 'records.col.description', { kind: 'long' }),
      {
        key: 'downtimeHours',
        header: 'records.col.downtime',
        sort: 'downtimeHours',
        kind: 'number',
        value: (r) => n(r.downtimeHours),
        text: (r, ctx) => {
          const v = n(r.downtimeHours);
          return v === null ? '' : ctx.t('vehicle.units.hours', { value: ctx.number(v) });
        },
        minor: true,
      },
      moneyCol(),
      { ...dateCol('resolvedAt', 'records.col.resolvedAt'), sort: undefined, minor: true },
    ],
    filters: [
      {
        key: 'state',
        label: 'records.col.state',
        type: 'select',
        options: enumOptions(MALFUNCTION_STATES, 'malfunctionState'),
      },
      {
        key: 'severity',
        label: 'records.col.severity',
        type: 'select',
        options: enumOptions(MALFUNCTION_SEVERITIES, 'severity'),
      },
      { key: 'accident', label: 'records.filter.accidents', type: 'toggle' },
    ],
    defaults: () => ({
      reportedAt: today(),
      severity: 'MEDIUM',
      state: 'OPEN',
      isAccident: false,
    }),
  },
  fluids: {
    ownerType: 'FluidAddition',
    dateKey: 'date',
    searchable: true,
    fields: [
      dateField(),
      {
        key: 'fluidType',
        label: 'records.col.fluid',
        type: 'select',
        required: true,
        options: lookupOptions('fluidTypes'),
      },
      { key: 'liters', label: 'records.col.liters', type: 'number', required: true, step: 1 },
      notesField,
    ],
    columns: [
      dateCol('date', 'records.col.date'),
      {
        key: 'fluidType',
        header: 'records.col.fluid',
        kind: 'text',
        value: (r, ctx) => lookupText('fluidTypes', r.fluidType, ctx),
      },
      litersCol,
      textCol('notes', 'records.col.notes', { kind: 'long', minor: true }),
    ],
    filters: [
      {
        key: 'fluid',
        label: 'records.col.fluid',
        type: 'select',
        options: lookupOptions('fluidTypes'),
      },
    ],
    defaults: () => ({ date: today() }),
  },
  fuel: {
    ownerType: 'FuelEntry',
    dateKey: 'date',
    searchable: false,
    fields: [
      dateField(),
      { key: 'liters', label: 'records.col.liters', type: 'number', required: true, step: 1 },
      { ...readingField, hint: 'records.field.readingHint' },
      costField,
    ],
    columns: [
      dateCol('date', 'records.col.date'),
      litersCol,
      readingCol,
      {
        key: 'economy',
        header: 'records.col.economy',
        kind: 'number',
        value: (r) => n(r.economy),
        text: (r, ctx) => {
          const v = n(r.economy);
          return v === null
            ? ''
            : ctx.t(ctx.unit === 'KM' ? 'vehicle.units.KM_PER_L' : 'vehicle.units.L_PER_HOUR', {
                value: ctx.number(v, 1),
              });
        },
        numFmt: '0.00',
      },
      {
        key: 'drop',
        header: 'records.col.drop',
        kind: 'bool',
        value: (r) => r.drop === true,
        minor: true,
      },
      moneyCol(),
    ],
    filters: [{ key: 'drops', label: 'records.filter.drops', type: 'toggle' }],
    defaults: () => ({ date: today() }),
  },
  movements: {
    ownerType: 'Movement',
    dateKey: 'date',
    searchable: true,
    fields: [
      dateField(),
      {
        key: 'fromLocation',
        label: 'records.col.from',
        type: 'select',
        options: lookupOptions('locations'),
      },
      {
        key: 'toLocation',
        label: 'records.col.to',
        type: 'select',
        required: true,
        options: lookupOptions('locations'),
      },
      notesField,
    ],
    columns: [
      dateCol('date', 'records.col.date'),
      {
        key: 'fromLocation',
        header: 'records.col.from',
        kind: 'text',
        value: (r, ctx) => lookupText('locations', r.fromLocation, ctx),
      },
      {
        key: 'toLocation',
        header: 'records.col.to',
        kind: 'text',
        value: (r, ctx) => lookupText('locations', r.toLocation, ctx),
      },
      textCol('notes', 'records.col.notes', { kind: 'long', minor: true }),
    ],
    filters: [
      {
        key: 'location',
        label: 'records.filter.location',
        type: 'select',
        options: lookupOptions('locations'),
      },
    ],
    defaults: ({ location }) => ({ date: today(), fromLocation: location ?? '' }),
  },
  inspections: {
    ownerType: 'Inspection',
    dateKey: 'date',
    searchable: true,
    fields: [
      {
        key: 'kind',
        label: 'records.col.inspectionKind',
        type: 'select',
        required: true,
        options: enumOptions(INSPECTION_KINDS, 'inspection'),
      },
      dateField(),
      { key: 'validUntil', label: 'records.col.validUntil', type: 'date', required: true },
      { key: 'passed', label: 'records.col.passed', type: 'bool' },
      { key: 'inspector', label: 'records.col.inspector', type: 'text' },
      costField,
      notesField,
    ],
    columns: [
      {
        key: 'kind',
        header: 'records.col.inspectionKind',
        sort: 'kind',
        kind: 'text',
        value: (r) => s(r.kind),
        text: (r, ctx) => label(ctx.t, 'inspection', s(r.kind) ?? ''),
      },
      dateCol('date', 'records.col.date'),
      dateCol('validUntil', 'records.col.validUntil'),
      {
        key: 'passed',
        header: 'records.col.passed',
        kind: 'bool',
        value: (r) => r.passed === true,
      },
      textCol('inspector', 'records.col.inspector', { minor: true }),
      moneyCol(),
    ],
    filters: [
      {
        key: 'inspection',
        label: 'records.col.inspectionKind',
        type: 'select',
        options: enumOptions(INSPECTION_KINDS, 'inspection'),
      },
    ],
    defaults: () => ({ kind: 'ANNUAL_TEST', date: today(), passed: true }),
  },
  notes: {
    ownerType: 'Note',
    dateKey: 'createdAt',
    searchable: true,
    fields: [{ key: 'body', label: 'records.col.note', type: 'textarea', required: true }],
    columns: [
      dateCol('createdAt', 'records.col.date', 'createdAt'),
      textCol('body', 'records.col.note', { kind: 'long' }),
      textCol('createdBy', 'records.col.createdBy'),
    ],
    filters: [{ key: 'mine', label: 'records.filter.mine', type: 'toggle' }],
    defaults: () => ({}),
  },
};

/** The column "Added by" and the attachment list, shown or exported for every kind. */
export const createdByCol: Column = textCol('createdBy', 'records.col.createdBy');

/** Form values → the request body the shared schema expects. */
export function toBody(kind: RecordKind, values: FormValues, unit: UsageUnit, isNew: boolean) {
  const ui = KIND_UI[kind];
  const body: Record<string, unknown> = {};
  for (const f of ui.fields) {
    if (f.createOnly && !isNew) continue;
    if (f.when && !f.when(values)) continue;
    const raw = values[f.key];
    if (f.type === 'bool') {
      body[f.key] = raw === true;
      continue;
    }
    const str = typeof raw === 'string' ? raw.trim() : '';
    if (f.type === 'reading') {
      const value = str === '' ? null : Number(str);
      const [km, hours] =
        f.key === 'reading' ? ['odometerKm', 'engineHours'] : ['nextServiceKm', 'nextServiceHours'];
      body[km!] = unit === 'KM' ? value : null;
      body[hours!] = unit === 'HOURS' ? value : null;
      continue;
    }
    if (f.type === 'number' || f.type === 'money') body[f.key] = str === '' ? null : Number(str);
    else body[f.key] = str === '' ? null : str;
  }
  return body;
}

/** A stored row → form values for editing. */
export function toForm(kind: RecordKind, row: RecordRow, unit: UsageUnit): FormValues {
  const values: FormValues = {};
  for (const f of KIND_UI[kind].fields) {
    if (f.createOnly) continue;
    const raw = f.type === 'reading' ? row[readingKey(unit)] : row[f.key];
    if (f.type === 'bool') values[f.key] = raw === true;
    else if (f.type === 'date')
      values[f.key] = typeof raw === 'string' ? localDay(new Date(raw)) : '';
    else values[f.key] = raw === null || raw === undefined ? '' : String(raw);
  }
  return values;
}

/** Which form field a server or schema issue path belongs to. */
export function fieldOfPath(path: string) {
  if (path === 'odometerKm' || path === 'engineHours') return 'reading';
  if (path === 'nextServiceKm' || path === 'nextServiceHours') return 'nextServiceReading';
  return path;
}
