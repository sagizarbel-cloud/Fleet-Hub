import type { TFunction } from 'i18next';
import {
  type CustomFieldDef,
  type FuelDetailField,
  INSPECTION_KINDS,
  MALFUNCTION_SEVERITIES,
  MALFUNCTION_STATES,
  type RecordKind,
  type UsageUnit,
  WIGGLE_ITEMS,
  WORK_PERFORMERS,
  WORK_TYPES,
  wiggleFailed,
  type WiggleItem,
} from '@fleet-hub/shared';
import { dateFormat, localeOf } from '@/lib/intl';
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
  /** Shown only in the record report and the export, not as a table column. */
  report?: boolean;
  /** A header typed by an admin (extra fields), shown as is instead of `header`. */
  title?: (lang: string) => string;
}

/** A column's header text in the active language. */
export const colTitle = (col: Column, t: TFunction, lang: string) =>
  col.title ? col.title(lang) : (t(col.header as never) as string);

/** Columns for the extra fields an admin defined (Revisions 1); values live in `row.custom`. */
export function customColumns(defs: readonly CustomFieldDef[]): Column[] {
  return defs.map((f) => {
    const raw = (r: RecordRow) => {
      const c = r.custom as Record<string, unknown> | null | undefined;
      return c?.[f.key];
    };
    return {
      key: `custom.${f.key}`,
      header: 'records.col.extra',
      title: (lang: string) => (lang === 'he' ? f.labelHe : f.labelEn),
      kind: f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text',
      value: (r) => (f.type === 'number' ? n(raw(r)) : f.type === 'date' ? d(raw(r)) : s(raw(r))),
      minor: true,
    } satisfies Column;
  });
}

export type FieldType =
  | 'date'
  | 'number'
  | 'money'
  | 'text'
  | 'textarea'
  | 'select'
  | 'bool'
  | 'reading'
  /** The vehicle's approved receipts to link (work cards); the value is comma-separated ids. */
  | 'receipts'
  /** The vehicle's services a work card gathers; the value is comma-separated ids. */
  | 'services'
  /** A wiggle test's V / X items; the values are `results.<item>` = PASS or FAIL. */
  | 'checklist';

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
  /** A label typed by an admin (extra fields), shown as is instead of `label`. */
  title?: string;
  /** A fuel detail an admin can make mandatory (Revisions 1). */
  adminRequired?: FuelDetailField;
  /** Typed text with suggestions: which suggestion list feeds it. */
  suggest?: 'place' | 'fueledBy' | 'provider';
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
  /** Blank form for a new record. `last` is the newest record of this kind on the vehicle. */
  defaults: (ctx: DefaultsCtx) => FormValues;
}

export interface DefaultsCtx {
  unit: UsageUnit;
  location: string | null;
  /** The vehicle's location in the active language, for typed place fields. */
  locationName?: string | null;
  last?: RecordRow;
}

/** A local calendar day as YYYY-MM-DD, the value of a date input. */
export const localDay = (date: Date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const today = () => localDay();
const s = (v: unknown) => (typeof v === 'string' ? v : null);
const n = (v: unknown) => (typeof v === 'number' ? v : null);
const d = (v: unknown) => (typeof v === 'string' ? new Date(v) : null);

type ListKey = 'locations' | 'fluidTypes' | 'fuelTypes';
const lookupOptions = (list: ListKey) => (ctx: FormatCtx) =>
  (ctx.lookups?.[list] ?? []).map((i) => ({
    value: i.code,
    label: lookupName(i, ctx.lang) ?? i.code,
  }));
const lookupText = (list: ListKey, code: unknown, ctx: FormatCtx) =>
  typeof code === 'string'
    ? (lookupName(
        ctx.lookups?.[list].find((i) => i.code === code),
        ctx.lang,
      ) ?? code)
    : '';
const enumOptions =
  (
    values: readonly string[],
    prefix: 'severity' | 'malfunctionState' | 'inspection' | 'workCard.type' | 'workCard.performer',
  ) =>
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

// ---------- Wiggle tests (Sagi, 2026-11-08) ----------

const resultsOf = (r: RecordRow) =>
  (r.results && typeof r.results === 'object' ? r.results : {}) as Partial<Record<string, string>>;
/** "3 items: Cameras, LiDARs" style list of what failed, in the active language. */
export function wiggleFailedText(r: RecordRow, ctx: FormatCtx) {
  return new Intl.ListFormat(ctx.lang === 'he' ? 'he' : 'en', { type: 'conjunction' }).format(
    wiggleFailed(resultsOf(r)).map((i) => ctx.t(`wiggle.item.${i}`)),
  );
}
const wiggleResultText = (r: RecordRow, ctx: FormatCtx) => {
  const count = n(r.failCount) ?? 0;
  return count ? ctx.t('wiggle.failedCount', { count }) : ctx.t('wiggle.allOk');
};
/** One column per checklist item (report and Excel only), shown as V or X. */
export const wiggleItemColumns: Column[] = WIGGLE_ITEMS.map((item: WiggleItem) => ({
  key: `results.${item}`,
  header: `wiggle.item.${item}`,
  kind: 'text',
  value: (r, ctx) => {
    const v = resultsOf(r)[item];
    return v === 'PASS' ? ctx.t('wiggle.pass') : v === 'FAIL' ? ctx.t('wiggle.fail') : null;
  },
  report: true,
}));
/** Date and time, since several tests can be done on one day. */
const doneAtText = (r: RecordRow, ctx: FormatCtx) => {
  const v = s(r.date);
  if (!v) return '';
  const time = dateFormat(localeOf(ctx.lang), { hour: '2-digit', minute: '2-digit' });
  return `${ctx.date(v)} ${time.format(new Date(v))}`;
};

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
    searchable: true,
    fields: [
      dateField(),
      { key: 'liters', label: 'records.col.liters', type: 'number', required: true, step: 1 },
      {
        key: 'fuelType',
        label: 'records.col.fuelType',
        type: 'select',
        options: lookupOptions('fuelTypes'),
        adminRequired: 'fuelType',
      },
      { ...readingField, hint: 'records.field.readingHint' },
      costField,
      {
        key: 'place',
        label: 'records.col.place',
        type: 'text',
        suggest: 'place',
        adminRequired: 'place',
      },
      {
        key: 'fueledBy',
        label: 'records.col.fueledBy',
        type: 'text',
        suggest: 'fueledBy',
        adminRequired: 'fueledBy',
      },
      {
        key: 'provider',
        label: 'records.col.provider',
        type: 'text',
        suggest: 'provider',
        adminRequired: 'provider',
      },
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
      {
        key: 'fuelType',
        header: 'records.col.fuelType',
        kind: 'text',
        value: (r, ctx) => lookupText('fuelTypes', r.fuelType, ctx),
        minor: true,
      },
      textCol('place', 'records.col.place'),
      textCol('fueledBy', 'records.col.fueledBy', { minor: true, report: true }),
      textCol('provider', 'records.col.provider', { minor: true, report: true }),
    ],
    filters: [
      {
        key: 'fuelType',
        label: 'records.col.fuelType',
        type: 'select',
        options: lookupOptions('fuelTypes'),
      },
      { key: 'drops', label: 'records.filter.drops', type: 'toggle' },
    ],
    // A new fill-up starts where the vehicle is, with the fuel and provider it had last time.
    defaults: ({ locationName, last }) => ({
      date: today(),
      place: locationName ?? '',
      fuelType: s(last?.fuelType) ?? '',
      provider: s(last?.provider) ?? '',
    }),
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
      {
        key: 'contractor',
        label: 'records.col.contractor',
        type: 'text',
        suggest: 'provider',
        hint: 'records.field.contractorHint',
      },
      costField,
      { key: 'durationHours', label: 'records.col.duration', type: 'number', step: 1 },
      { key: 'distanceKm', label: 'records.col.distance', type: 'number' },
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
      textCol('contractor', 'records.col.contractor'),
      moneyCol(),
      {
        key: 'durationHours',
        header: 'records.col.duration',
        kind: 'number',
        value: (r) => n(r.durationHours),
        text: (r, ctx) => {
          const v = n(r.durationHours);
          return v === null ? '' : ctx.t('vehicle.units.hours', { value: ctx.number(v, 1) });
        },
        minor: true,
      },
      {
        key: 'distanceKm',
        header: 'records.col.distance',
        kind: 'number',
        value: (r) => n(r.distanceKm),
        text: (r, ctx) => {
          const v = n(r.distanceKm);
          return v === null ? '' : ctx.t('vehicle.units.km', { value: ctx.number(v) });
        },
        numFmt: '#,##0',
        minor: true,
        report: true,
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
  workCards: {
    ownerType: 'WorkCard',
    dateKey: 'date',
    searchable: true,
    fields: [
      dateField(),
      {
        key: 'workType',
        label: 'records.col.workType',
        type: 'select',
        required: true,
        options: enumOptions(WORK_TYPES, 'workCard.type'),
      },
      {
        key: 'performedBy',
        label: 'records.col.performedBy',
        type: 'select',
        required: true,
        options: enumOptions(WORK_PERFORMERS, 'workCard.performer'),
      },
      { key: 'description', label: 'records.col.workDone', type: 'textarea', required: true },
      {
        key: 'doneBy',
        label: 'records.col.doneBy',
        type: 'text',
        suggest: 'provider',
        hint: 'records.field.doneByHint',
      },
      { key: 'place', label: 'records.col.workPlace', type: 'text', suggest: 'place' },
      { key: 'laborHours', label: 'records.col.laborHours', type: 'number', step: 1 },
      readingField,
      costField,
      notesField,
      { key: 'serviceIds', label: 'records.col.services', type: 'services' },
      { key: 'receiptIds', label: 'records.col.receipts', type: 'receipts' },
    ],
    columns: [
      dateCol('date', 'records.col.date'),
      {
        key: 'workType',
        header: 'records.col.workType',
        kind: 'text',
        value: (r) => s(r.workType),
        text: (r, ctx) => label(ctx.t, 'workCard.type', s(r.workType) ?? ''),
        minor: true,
      },
      {
        key: 'performedBy',
        header: 'records.col.performedBy',
        kind: 'text',
        value: (r) => s(r.performedBy),
        text: (r, ctx) => label(ctx.t, 'workCard.performer', s(r.performedBy) ?? ''),
      },
      textCol('description', 'records.col.workDone', { kind: 'long' }),
      textCol('doneBy', 'records.col.doneBy'),
      textCol('place', 'records.col.workPlace', { minor: true }),
      {
        key: 'laborHours',
        header: 'records.col.laborHours',
        sort: 'laborHours',
        kind: 'number',
        value: (r) => n(r.laborHours),
        text: (r, ctx) => {
          const v = n(r.laborHours);
          return v === null ? '' : ctx.t('vehicle.units.hours', { value: ctx.number(v, 1) });
        },
        minor: true,
        report: true,
      },
      { ...readingCol, minor: true, report: true },
      moneyCol(),
      textCol('notes', 'records.col.notes', { kind: 'long', minor: true, report: true }),
    ],
    filters: [
      {
        key: 'performedBy',
        label: 'records.col.performedBy',
        type: 'select',
        options: enumOptions(WORK_PERFORMERS, 'workCard.performer'),
      },
      {
        key: 'workType',
        label: 'records.col.workType',
        type: 'select',
        options: enumOptions(WORK_TYPES, 'workCard.type'),
      },
    ],
    defaults: () => ({ date: today(), workType: 'MECHANICAL', performedBy: 'IN_HOUSE' }),
  },
  wiggleTests: {
    ownerType: 'WiggleTest',
    dateKey: 'date',
    searchable: true,
    fields: [
      { key: 'results', label: 'wiggle.checklist', type: 'checklist', required: true },
      {
        key: 'notes',
        label: 'wiggle.otherProblems',
        type: 'textarea',
        hint: 'wiggle.otherProblemsHint',
      },
    ],
    columns: [
      {
        ...dateCol('date', 'wiggle.doneAt'),
        text: doneAtText,
        numFmt: 'dd/mm/yyyy hh:mm',
      },
      {
        key: 'result',
        header: 'wiggle.result',
        sort: 'failCount',
        kind: 'text',
        value: (r, ctx) => wiggleResultText(r, ctx),
      },
      {
        key: 'failed',
        header: 'wiggle.failedItems',
        kind: 'long',
        value: (r, ctx) => wiggleFailedText(r, ctx) || null,
      },
      textCol('notes', 'wiggle.otherProblems', { kind: 'long' }),
      textCol('createdBy', 'wiggle.doneBy'),
      ...wiggleItemColumns,
    ],
    filters: [{ key: 'failed', label: 'wiggle.withIssues', type: 'toggle' }],
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
    if (f.type === 'checklist') {
      const prefix = `${f.key}.`;
      body[f.key] = Object.fromEntries(
        Object.entries(values)
          .filter(([k, v]) => k.startsWith(prefix) && (v === 'PASS' || v === 'FAIL'))
          .map(([k, v]) => [k.slice(prefix.length), v]),
      );
      continue;
    }
    if (f.type === 'bool') {
      body[f.key] = raw === true;
      continue;
    }
    const str = typeof raw === 'string' ? raw.trim() : '';
    if (f.type === 'receipts' || f.type === 'services') {
      body[f.key] = str ? str.split(',') : [];
      continue;
    }
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
    if (f.type === 'checklist') {
      for (const [item, v] of Object.entries(resultsOf(row)))
        if (typeof v === 'string') values[`${f.key}.${item}`] = v;
      continue;
    }
    if (f.type === 'receipts' || f.type === 'services') {
      const list = f.type === 'receipts' ? row.receipts : row.services;
      const linked = Array.isArray(list) ? (list as { id: string }[]) : [];
      values[f.key] = linked.map((r) => r.id).join(',');
    } else if (f.type === 'bool') values[f.key] = raw === true;
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
  if (path.startsWith('results')) return 'results';
  return path;
}
