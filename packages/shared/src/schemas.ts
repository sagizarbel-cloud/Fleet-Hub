import { z } from 'zod';
import { MALFUNCTION_SEVERITIES, MALFUNCTION_STATES, ROLES, VEHICLE_STATUSES } from './enums';
import { INSPECTION_KINDS, RECORD_KINDS, SORT_DIRS, type RecordKind } from './records';
import { DETAIL_VIEWS, VITAL_KEYS } from './vitals';
import { ALL_FLEET_COLUMNS, FLEET_GROUP_BY, FLEET_GROUPS } from './fleet';
import {
  DOCUMENT_KINDS,
  ITEM_KINDS,
  LINE_CONDITIONS,
  QUOTE_STATUSES,
  QUOTE_VISIBILITIES,
  RECEIPT_STATES,
} from './money';

export const loginBody = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(200),
});
export type LoginBody = z.infer<typeof loginBody>;

export const sessionUser = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  role: z.enum(ROLES),
  canViewStartCodes: z.boolean(),
});
export type SessionUser = z.infer<typeof sessionUser>;

export const lookupItem = z.object({
  id: z.string(),
  code: z.string(),
  nameEn: z.string(),
  nameHe: z.string(),
});
export type LookupItem = z.infer<typeof lookupItem>;

export const listQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListQuery = z.infer<typeof listQuery>;

export const preferencesBody = z.object({
  pinnedVitals: z
    .array(z.enum(VITAL_KEYS))
    .max(VITAL_KEYS.length)
    .refine((keys) => new Set(keys).size === keys.length, 'duplicate')
    .optional(),
  detailView: z.enum(DETAIL_VIEWS).optional(),
  /** The saved view the fleet table opens with; null for the built-in one. */
  fleetViewId: z.string().min(1).max(40).nullable().optional(),
  /** Defaults that follow the user to every device; null = this device decides. */
  language: z.enum(['en', 'he']).nullable().optional(),
  theme: z.enum(['dark', 'light']).nullable().optional(),
});
export type PreferencesBody = z.infer<typeof preferencesBody>;

export const serialParam = z.object({ serial: z.string().min(1).max(40) });
export const idParam = z.object({ id: z.string().min(1).max(40) });

export const assignItemBody = z.object({ vehicle: z.string().min(1).max(40) });

// ---------- Records (SPEC 5.3) ----------

const DAY_MS = 86_400_000;
/** A calendar day or timestamp; a record can't be dated more than a day ahead (time zones). */
const day = z.coerce.date().refine((d) => d.getTime() <= Date.now() + DAY_MS, 'future');
const anyDay = z.coerce.date();
const nullable = <T extends z.ZodType>(s: T) => s.nullish().transform((v) => v ?? null);
/** Optional free text: blank becomes null. */
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));
const text = (max: number) => z.string().trim().min(1).max(max);
const money = nullable(z.number().min(0).max(100_000_000));
const reading = nullable(z.number().int().min(0).max(100_000_000));
const code = z.string().min(1).max(40);

export const serviceBody = z.object({
  date: day,
  odometerKm: reading,
  engineHours: reading,
  description: text(500),
  vendor: optText(120),
  cost: money,
  // Written to the vehicle's next-service fields when given.
  nextServiceDate: nullable(anyDay),
  nextServiceKm: reading,
  nextServiceHours: reading,
});

export const malfunctionBody = z
  .object({
    reportedAt: day,
    severity: z.enum(MALFUNCTION_SEVERITIES),
    state: z.enum(MALFUNCTION_STATES),
    isAccident: z.boolean().default(false),
    description: text(1000),
    downtimeHours: nullable(z.number().int().min(0).max(100_000)),
    cost: money,
    resolvedAt: nullable(day),
  })
  .refine((m) => !m.resolvedAt || m.resolvedAt >= m.reportedAt, {
    path: ['resolvedAt'],
    message: 'before_reported',
  });

export const fluidBody = z.object({
  date: day,
  fluidType: code,
  liters: z.number().gt(0).max(10_000),
  notes: optText(500),
});

export const fuelBody = z.object({
  date: day,
  liters: z.number().gt(0).max(5_000),
  odometerKm: reading,
  engineHours: reading,
  cost: money,
});

export const movementBody = z
  .object({
    date: day,
    fromLocation: nullable(code),
    toLocation: code,
    notes: optText(500),
  })
  .refine((m) => m.fromLocation !== m.toLocation, { path: ['toLocation'], message: 'same' });

export const inspectionBody = z
  .object({
    kind: z.enum(INSPECTION_KINDS),
    date: day,
    validUntil: anyDay,
    inspector: optText(120),
    passed: z.boolean().default(true),
    cost: money,
    notes: optText(500),
  })
  .refine((i) => i.validUntil > i.date, { path: ['validUntil'], message: 'before_date' });

export const noteBody = z.object({ body: text(4000) });

export const RECORD_BODIES = {
  service: serviceBody,
  malfunctions: malfunctionBody,
  fluids: fluidBody,
  fuel: fuelBody,
  movements: movementBody,
  inspections: inspectionBody,
  notes: noteBody,
} satisfies Record<RecordKind, z.ZodType>;
export type RecordBody<K extends RecordKind> = z.input<(typeof RECORD_BODIES)[K]>;
export type RecordInput<K extends RecordKind> = z.output<(typeof RECORD_BODIES)[K]>;

export const recordParams = z.object({
  serial: z.string().min(1).max(40),
  kind: z.enum(RECORD_KINDS),
});
export const recordIdParams = recordParams.extend({ id: z.string().min(1).max(40) });

const flag = z
  .enum(['1', '0', 'true', 'false'])
  .optional()
  .transform((v) => v === '1' || v === 'true');

export const recordsQuery = z.object({
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  /** Every matching row, for the Excel export (capped). */
  all: flag,
  sort: z.string().max(40).optional(),
  dir: z.enum(SORT_DIRS).default('desc'),
  q: z.string().trim().max(100).optional(),
  from: anyDay.optional(),
  to: anyDay.optional(),
  state: z.enum(MALFUNCTION_STATES).optional(),
  severity: z.enum(MALFUNCTION_SEVERITIES).optional(),
  accident: flag,
  fluid: code.optional(),
  location: code.optional(),
  inspection: z.enum(INSPECTION_KINDS).optional(),
  drops: flag,
  mine: flag,
});
export type RecordsQuery = z.input<typeof recordsQuery>;

export const ownershipBody = z.object({
  purchaseDate: nullable(anyDay),
  supplierId: nullable(z.string().min(1).max(40)),
  purchasePrice: money,
  warrantyTerms: optText(500),
  warrantyExpiry: nullable(anyDay),
});

export const statusOverrideBody = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('set'), status: z.enum(VEHICLE_STATUSES), reason: text(300) }),
  z.object({ mode: z.literal('clear') }),
]);

export const ATTACHMENT_OWNERS = [
  'ServiceRecord',
  'Malfunction',
  'FluidAddition',
  'FuelEntry',
  'Movement',
  'Inspection',
  'Note',
  'Vehicle',
  'Document',
  'Quote',
] as const;
export type AttachmentOwner = (typeof ATTACHMENT_OWNERS)[number];
export const attachmentQuery = z.object({
  ownerType: z.enum(ATTACHMENT_OWNERS),
  ownerId: z.string().min(1).max(40),
});

const unique = <T extends z.ZodType>(item: T, max: number) =>
  z
    .array(item)
    .max(max)
    .refine((list) => new Set(list).size === list.length, 'duplicate');
const codes = unique(code, 50);

export const fleetViewSettings = z.object({
  columns: unique(z.enum(ALL_FLEET_COLUMNS as [string, ...string[]]), ALL_FLEET_COLUMNS.length),
  collapsed: unique(z.enum(FLEET_GROUPS), FLEET_GROUPS.length),
  sort: z
    .array(
      z.object({
        id: z.enum(['serial', ...ALL_FLEET_COLUMNS] as [string, ...string[]]),
        desc: z.boolean(),
      }),
    )
    .max(3),
  groupBy: z.enum(FLEET_GROUP_BY),
  q: z.string().trim().max(100),
  status: unique(z.enum(VEHICLE_STATUSES), VEHICLE_STATUSES.length),
  types: codes,
  departments: codes,
  locations: codes,
  due: z.boolean(),
  issues: z.boolean(),
});

export const fleetViewBody = z.object({
  name: text(60),
  settings: fleetViewSettings,
});
export type FleetViewBody = z.infer<typeof fleetViewBody>;
export const fleetViewParams = z.object({ id: z.string().min(1).max(40) });

// ---------- Receipts, quotes and equipment (SPEC 5.5–5.7) ----------

const serial = z.string().min(1).max(40);
const id = z.string().min(1).max(40);
const serials = (min: number, max: number) =>
  unique(serial, max).refine((l) => l.length >= min, 'required');
const page = {
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  /** Every matching row, for the Excel export (capped). */
  all: flag,
  q: z.string().trim().max(100).optional(),
  from: anyDay.optional(),
  to: anyDay.optional(),
};

export const receiptBody = z.object({
  vehicles: serials(1, 20),
  kind: z.enum(DOCUMENT_KINDS).default('RECEIPT'),
  date: day,
  vendor: optText(120),
  amount: money,
  category: nullable(code),
  /** Optional link to one record of a tagged vehicle, e.g. the service this receipt paid for. */
  linked: nullable(z.object({ kind: z.enum(RECORD_KINDS), id })),
  notes: optText(500),
});
export type ReceiptBody = z.input<typeof receiptBody>;

export const receiptsQuery = z.object({
  ...page,
  vehicle: serial.optional(),
  category: code.optional(),
  state: z.enum(RECEIPT_STATES).optional(),
  min: z.coerce.number().min(0).optional(),
  max: z.coerce.number().min(0).optional(),
  sort: z.enum(['date', 'amount', 'vendor']).default('date'),
  dir: z.enum(SORT_DIRS).default('desc'),
});
export type ReceiptsQuery = z.input<typeof receiptsQuery>;

export const reviewBody = z.object({ approve: z.boolean() });

const quoteLine = z.object({
  item: text(120),
  partNo: optText(60),
  condition: z.enum(LINE_CONDITIONS).default('NEW'),
  quantity: z.number().int().min(1).max(100_000),
  unitPrice: z.number().min(0).max(100_000_000),
});

export const quoteBody = z
  .object({
    /** An existing supplier, or a new name to add. */
    supplier: z.union([z.object({ id }), z.object({ name: text(120) })]),
    date: day,
    validUntil: nullable(anyDay),
    notes: optText(1000),
    lines: z.array(quoteLine).min(1).max(100),
    vehicles: serials(0, 50),
    /** Admins only; anyone else sending a level other than STANDARD gets 403. */
    visibility: z.enum(QUOTE_VISIBILITIES).optional(),
  })
  .refine((q) => !q.validUntil || q.validUntil >= q.date, {
    path: ['validUntil'],
    message: 'before_date',
  });
export type QuoteBody = z.input<typeof quoteBody>;

export const quoteStatusBody = z.object({ status: z.enum(QUOTE_STATUSES) });
export const quoteVisibilityBody = z.object({ visibility: z.enum(QUOTE_VISIBILITIES) });
export const quoteVehiclesBody = z.object({ vehicles: serials(0, 50) });

export const quotesQuery = z.object({
  ...page,
  status: z.enum(QUOTE_STATUSES).optional(),
  supplier: id.optional(),
  vehicle: serial.optional(),
  visibility: z.enum(QUOTE_VISIBILITIES).optional(),
});
export type QuotesQuery = z.input<typeof quotesQuery>;

/** Compare one part across quotes (by part no., else by name), or two to four whole quotes. */
export const compareQuery = z.union([
  z.object({ part: z.string().trim().min(1).max(120) }),
  z.object({
    ids: z
      .string()
      .max(200)
      .transform((s) => s.split(',').filter(Boolean))
      .pipe(unique(id, 4).refine((l) => l.length >= 2, 'too_few')),
  }),
]);

export const itemBody = z.object({
  kind: z.enum(ITEM_KINDS),
  name: text(120),
  model: optText(80),
  spec: optText(300),
  serial: optText(60),
});
export type ItemBody = z.input<typeof itemBody>;

export const itemsQuery = z.object({
  q: z.string().trim().max(100).optional(),
  kind: z.enum(ITEM_KINDS).optional(),
  vehicle: serial.optional(),
  /** "yard" lists items on no vehicle. */
  where: z.enum(['yard', 'assigned']).optional(),
  retired: flag,
});
