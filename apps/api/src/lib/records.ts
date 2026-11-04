import { Prisma } from '@prisma/client';
import {
  economyPoints,
  hasRole,
  RECORD_SORTS,
  type EventType,
  type RecordInput,
  type RecordKind,
  type SessionUser,
  type UsageUnit,
} from '@fleet-hub/shared';
import { HttpError } from './http';
import { readAppSettings } from './app-settings';

type Tx = Prisma.TransactionClient;
type Row = Record<string, unknown> & {
  id: string;
  createdById: string | null;
  deletedAt: Date | null;
};
/** The slice of a Prisma model delegate the generic record code uses. */
interface Delegate {
  findMany(args: object): Promise<Row[]>;
  findFirst(args: object): Promise<Row | null>;
  count(args: object): Promise<number>;
  create(args: object): Promise<Row>;
  update(args: object): Promise<Row>;
}
type ModelName =
  | 'serviceRecord'
  | 'malfunction'
  | 'fluidAddition'
  | 'fuelEntry'
  | 'movement'
  | 'inspection'
  | 'note'
  | 'workCard';

export interface VehicleRef {
  id: string;
  serial: string;
  usageUnit: UsageUnit;
  odometerKm: number | null;
  engineHours: number | null;
}

interface Ctx {
  tx: Tx;
  vehicle: VehicleRef;
}

export interface ListFilters {
  q?: string;
  from?: Date;
  to?: Date;
  state?: string;
  severity?: string;
  accident: boolean;
  fluid?: string;
  fuelType?: string;
  performedBy?: string;
  workType?: string;
  location?: string;
  inspection?: string;
  mine: boolean;
}

interface KindConfig<K extends RecordKind> {
  model: ModelName;
  /** Event.sourceType and Attachment.ownerType for this kind. */
  sourceType: string;
  dateField: string;
  createType: EventType;
  /** Text columns the search box looks in. */
  search: string[];
  include?: object;
  data(input: RecordInput<K>, ctx: Ctx): Promise<object>;
  /** Template parameters of the record's main event, from the stored row. */
  params(row: Row): Prisma.InputJsonObject;
  filters?(f: ListFilters): object[];
  /** Updates the vehicle's own fields that this kind feeds (usage, location, expiries). */
  after?(ctx: Ctx, input: RecordInput<K> | null, id: string): Promise<void>;
}

const DAY_MS = 86_400_000;
const num = (v: unknown) => (v instanceof Prisma.Decimal ? v.toNumber() : v);
const code = (v: unknown) => (v as { code?: string } | null)?.code ?? null;

async function lookupId(
  tx: Tx,
  list: 'fluidType' | 'fuelType' | 'location',
  value: string,
  field: string,
): Promise<string> {
  const where = { where: { code: value }, select: { id: true } };
  const row =
    list === 'fluidType'
      ? await tx.fluidType.findUnique(where)
      : list === 'fuelType'
        ? await tx.fuelType.findUnique(where)
        : await tx.location.findUnique(where);
  if (!row) {
    const err = new HttpError(400, 'validation_failed');
    Object.assign(err, { issues: [{ path: field, code: 'unknown' }] });
    throw err;
  }
  return row.id;
}

/** Raises the vehicle's odometer or hour meter when a record carries a higher reading. */
async function bumpUsage(
  ctx: Ctx,
  input: { odometerKm: number | null; engineHours: number | null },
) {
  const data: Prisma.VehicleUpdateInput = {};
  if (input.odometerKm !== null && input.odometerKm > (ctx.vehicle.odometerKm ?? -1))
    data.odometerKm = input.odometerKm;
  if (input.engineHours !== null && input.engineHours > (ctx.vehicle.engineHours ?? -1))
    data.engineHours = input.engineHours;
  if (Object.keys(data).length)
    await ctx.tx.vehicle.update({ where: { id: ctx.vehicle.id }, data });
}

const EXPIRY_FIELD = {
  ANNUAL_TEST: 'annualTestExpiry',
  INSURANCE: 'insuranceExpiry',
  SAFETY_CHECK: 'safetyCheckExpiry',
} as const;

export const KINDS: { [K in RecordKind]: KindConfig<K> } = {
  service: {
    model: 'serviceRecord',
    sourceType: 'ServiceRecord',
    dateField: 'date',
    createType: 'SERVICE',
    search: ['description', 'vendor'],
    data: async ({ nextServiceDate: _d, nextServiceKm: _k, nextServiceHours: _h, ...rest }) => rest,
    params: (row) => ({ description: row.description as string }),
    after: async (ctx, input) => {
      if (!input) return;
      await bumpUsage(ctx, input);
      const next: Prisma.VehicleUpdateInput = {};
      if (input.nextServiceDate) next.nextServiceDate = input.nextServiceDate;
      if (input.nextServiceKm !== null) next.nextServiceKm = input.nextServiceKm;
      if (input.nextServiceHours !== null) next.nextServiceHours = input.nextServiceHours;
      if (Object.keys(next).length)
        await ctx.tx.vehicle.update({ where: { id: ctx.vehicle.id }, data: next });
    },
  },
  malfunctions: {
    model: 'malfunction',
    sourceType: 'Malfunction',
    dateField: 'reportedAt',
    createType: 'MALFUNCTION_REPORTED',
    search: ['description'],
    data: async (input) => ({
      ...input,
      // Resolving without a date means "resolved now"; reopening clears it.
      resolvedAt: input.state === 'RESOLVED' ? (input.resolvedAt ?? new Date()) : null,
    }),
    params: (row) => ({
      severity: row.severity as string,
      description: row.description as string,
    }),
    filters: (f) => [
      ...(f.state ? [{ state: f.state }] : []),
      ...(f.severity ? [{ severity: f.severity }] : []),
      ...(f.accident ? [{ isAccident: true }] : []),
    ],
  },
  fluids: {
    model: 'fluidAddition',
    sourceType: 'FluidAddition',
    dateField: 'date',
    createType: 'FLUID_ADDED',
    search: ['notes'],
    include: { fluidType: { select: { code: true } } },
    data: async ({ fluidType, ...rest }, ctx) => ({
      ...rest,
      fluidTypeId: await lookupId(ctx.tx, 'fluidType', fluidType, 'fluidType'),
    }),
    params: (row) => ({ fluid: code(row.fluidType), liters: num(row.liters) as number }),
    filters: (f) => (f.fluid ? [{ fluidType: { code: f.fluid } }] : []),
  },
  fuel: {
    model: 'fuelEntry',
    sourceType: 'FuelEntry',
    dateField: 'date',
    createType: 'FUEL_ADDED',
    search: ['place', 'fueledBy', 'provider'],
    include: { fuelType: { select: { code: true } } },
    data: async ({ fuelType, ...rest }, ctx) => ({
      ...rest,
      fuelTypeId: fuelType ? await lookupId(ctx.tx, 'fuelType', fuelType, 'fuelType') : null,
    }),
    params: (row) => ({ liters: num(row.liters) as number }),
    filters: (f) => (f.fuelType ? [{ fuelType: { code: f.fuelType } }] : []),
    after: async (ctx, input) => {
      if (input) await bumpUsage(ctx, input);
    },
  },
  movements: {
    model: 'movement',
    sourceType: 'Movement',
    dateField: 'date',
    createType: 'MOVEMENT',
    search: ['notes', 'contractor'],
    include: {
      fromLocation: { select: { code: true } },
      toLocation: { select: { code: true } },
    },
    data: async ({ fromLocation, toLocation, custom, ...rest }, ctx) => ({
      ...rest,
      custom: await keepDefinedCustom(ctx.tx, custom),
      fromLocationId: fromLocation
        ? await lookupId(ctx.tx, 'location', fromLocation, 'fromLocation')
        : null,
      toLocationId: await lookupId(ctx.tx, 'location', toLocation, 'toLocation'),
    }),
    params: (row) => ({ from: code(row.fromLocation), to: code(row.toLocation) }),
    filters: (f) =>
      f.location
        ? [
            {
              OR: [{ fromLocation: { code: f.location } }, { toLocation: { code: f.location } }],
            },
          ]
        : [],
    // The vehicle is where its latest movement took it.
    after: async (ctx) => {
      const last = await ctx.tx.movement.findFirst({
        where: { vehicleId: ctx.vehicle.id, deletedAt: null },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        select: { toLocationId: true },
      });
      if (last)
        await ctx.tx.vehicle.update({
          where: { id: ctx.vehicle.id },
          data: { locationId: last.toLocationId },
        });
    },
  },
  inspections: {
    model: 'inspection',
    sourceType: 'Inspection',
    dateField: 'date',
    createType: 'INSPECTION',
    search: ['inspector', 'notes'],
    data: async (input) => input,
    params: (row) => ({ kind: row.kind as string }),
    filters: (f) => (f.inspection ? [{ kind: f.inspection }] : []),
    // Each expiry on the vehicle is the latest passed inspection of that kind.
    after: async (ctx) => {
      const data: Prisma.VehicleUpdateInput = {};
      for (const [kind, field] of Object.entries(EXPIRY_FIELD)) {
        const latest = await ctx.tx.inspection.findFirst({
          where: {
            vehicleId: ctx.vehicle.id,
            deletedAt: null,
            passed: true,
            kind: kind as keyof typeof EXPIRY_FIELD,
          },
          orderBy: { validUntil: 'desc' },
          select: { validUntil: true },
        });
        if (latest) data[field] = latest.validUntil;
      }
      if (Object.keys(data).length)
        await ctx.tx.vehicle.update({ where: { id: ctx.vehicle.id }, data });
    },
  },
  notes: {
    model: 'note',
    sourceType: 'Note',
    dateField: 'createdAt',
    createType: 'NOTE_ADDED',
    search: ['body'],
    data: async (input) => input,
    params: () => ({}),
  },
  workCards: {
    model: 'workCard',
    sourceType: 'WorkCard',
    dateField: 'date',
    createType: 'WORK_CARD',
    search: ['description', 'doneBy', 'place', 'notes'],
    data: async ({ receiptIds: _r, ...rest }) => rest,
    params: (row) => ({
      description: row.description as string,
      performedBy: row.performedBy as string,
      doneBy: (row.doneBy as string | null) ?? null,
    }),
    filters: (f) => [
      ...(f.performedBy ? [{ performedBy: f.performedBy }] : []),
      ...(f.workType ? [{ workType: f.workType }] : []),
    ],
    after: async (ctx, input, id) => {
      if (!input) return;
      await bumpUsage(ctx, input);
      await linkReceipts(ctx, id, input.receiptIds);
    },
  },
};

/**
 * Keeps only the extra-field values an admin has defined for location changes (Revisions 1),
 * each as its defined type; nothing left is stored as no value.
 */
async function keepDefinedCustom(tx: Tx, custom: unknown) {
  if (!custom || typeof custom !== 'object') return Prisma.DbNull;
  const { movementFields } = await readAppSettings(tx);
  const out: Record<string, string | number> = {};
  for (const f of movementFields) {
    const v = (custom as Record<string, unknown>)[f.key];
    if (v === null || v === undefined || v === '') continue;
    if (f.type === 'number' && typeof v === 'number') out[f.key] = v;
    else if (f.type === 'date' && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v))
      out[f.key] = v;
    else if (f.type === 'text' && typeof v === 'string') out[f.key] = v;
    else
      throw Object.assign(new HttpError(400, 'validation_failed'), {
        issues: [{ path: `custom.${f.key}`, code: 'invalid' }],
      });
  }
  return Object.keys(out).length ? out : Prisma.DbNull;
}

/**
 * Links the given receipts of this vehicle to a work card and unlinks the card's others
 * (Revisions 1). Only approved, live receipts of the same vehicle can be linked.
 */
async function linkReceipts(ctx: Ctx, cardId: string, ids: string[]) {
  const link = { linkedRecordType: 'WorkCard', linkedRecordId: cardId };
  const usable = await ctx.tx.document.findMany({
    where: {
      id: { in: ids },
      deletedAt: null,
      approvedAt: { not: null },
      vehicles: { some: { vehicleId: ctx.vehicle.id } },
    },
    select: { id: true },
  });
  if (usable.length !== new Set(ids).size)
    throw Object.assign(new HttpError(400, 'validation_failed'), {
      issues: [{ path: 'receiptIds', code: 'unknown' }],
    });
  await ctx.tx.document.updateMany({
    where: { ...link, id: { notIn: ids } },
    data: { linkedRecordType: null, linkedRecordId: null },
  });
  if (ids.length) await ctx.tx.document.updateMany({ where: { id: { in: ids } }, data: link });
}

/** The receipts linked to each work card, newest first. */
async function receiptsFor(tx: Tx, ids: string[]) {
  if (!ids.length) return new Map<string, unknown[]>();
  const docs = await tx.document.findMany({
    where: { linkedRecordType: 'WorkCard', linkedRecordId: { in: ids }, deletedAt: null },
    orderBy: { date: 'desc' },
    select: { id: true, kind: true, date: true, vendor: true, amount: true, linkedRecordId: true },
  });
  const map = new Map<string, unknown[]>();
  for (const { linkedRecordId, amount, ...d } of docs)
    map.set(linkedRecordId!, [...(map.get(linkedRecordId!) ?? []), { ...d, amount: num(amount) }]);
  return map;
}

export const delegate = (tx: Tx, kind: RecordKind) => tx[KINDS[kind].model] as unknown as Delegate;

/** Viewers may add notes and change their own; everything else needs an editor (Sagi, 2026-10-26). */
export function canCreate(user: SessionUser, kind: RecordKind) {
  return kind === 'notes' || hasRole(user.role, 'EDITOR');
}
export function canChange(user: SessionUser, kind: RecordKind, row: Row) {
  return hasRole(user.role, 'EDITOR') || (kind === 'notes' && row.createdById === user.id);
}

const LOOKUP_IDS = new Set(['fluidTypeId', 'fuelTypeId', 'fromLocationId', 'toLocationId']);
const LOOKUP_KEYS = new Set(['fluidType', 'fuelType', 'fromLocation', 'toLocation']);

/** A row as the API returns it: decimals as numbers, lookups as codes. */
function serialize(row: Row) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (key === 'vehicleId' || key === 'deletedAt') continue;
    if (LOOKUP_KEYS.has(key)) {
      out[key] = code(value);
      continue;
    }
    if (LOOKUP_IDS.has(key)) continue;
    out[key] = num(value);
  }
  return out;
}

export async function attachmentsFor(tx: Tx, ownerType: string, ids: string[]) {
  if (!ids.length) return new Map<string, unknown[]>();
  const rows = await tx.attachment.findMany({
    where: { ownerType, ownerId: { in: ids }, deletedAt: null },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      ownerId: true,
      fileName: true,
      mimeType: true,
      sizeBytes: true,
      thumbPath: true,
      createdAt: true,
    },
  });
  const map = new Map<string, unknown[]>();
  for (const { ownerId, thumbPath, ...a } of rows) {
    map.set(ownerId, [...(map.get(ownerId) ?? []), { ...a, hasThumb: thumbPath !== null }]);
  }
  return map;
}

/** Adds author names, attachments and (for fuel) per-fill-up economy to serialized rows. */
async function decorate(tx: Tx, kind: RecordKind, vehicle: VehicleRef, rows: Row[]) {
  const ids = rows.map((r) => r.id);
  const authorIds = [...new Set(rows.map((r) => r.createdById).filter((v): v is string => !!v))];
  const [authors, files, economy, receipts] = await Promise.all([
    authorIds.length
      ? tx.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true } })
      : [],
    attachmentsFor(tx, KINDS[kind].sourceType, ids),
    kind === 'fuel' ? fuelEconomy(tx, vehicle) : null,
    kind === 'workCards' ? receiptsFor(tx, ids) : null,
  ]);
  const names = new Map(authors.map((a) => [a.id, a.name]));
  const points = new Map(economy?.points.map((p) => [p.id, p]));
  return rows.map((row) => {
    const point = points.get(row.id);
    return {
      ...serialize(row),
      createdBy: row.createdById ? (names.get(row.createdById) ?? null) : null,
      attachments: files.get(row.id) ?? [],
      ...(kind === 'fuel'
        ? { economy: point?.value ?? null, baseline: point?.baseline ?? null, drop: !!point?.drop }
        : {}),
      ...(receipts ? { receipts: receipts.get(row.id) ?? [] } : {}),
    };
  });
}

export async function fuelEconomy(tx: Tx, vehicle: VehicleRef) {
  const entries = await tx.fuelEntry.findMany({
    where: { vehicleId: vehicle.id, deletedAt: null },
    select: { id: true, date: true, liters: true, odometerKm: true, engineHours: true },
  });
  return {
    unit: vehicle.usageUnit,
    points: economyPoints(
      entries.map((e) => ({ ...e, liters: e.liters.toNumber() })),
      vehicle.usageUnit,
    ),
  };
}

export const EXPORT_LIMIT = 5_000;

export async function listRecords(
  tx: Tx,
  user: SessionUser,
  kind: RecordKind,
  vehicle: VehicleRef,
  q: {
    offset: number;
    limit: number;
    all: boolean;
    sort?: string;
    dir: 'asc' | 'desc';
    drops: boolean;
  } & ListFilters,
) {
  const cfg = KINDS[kind];
  const and: object[] = [{ vehicleId: vehicle.id, deletedAt: null }];
  if (q.from) and.push({ [cfg.dateField]: { gte: q.from } });
  if (q.to) and.push({ [cfg.dateField]: { lt: new Date(q.to.getTime() + DAY_MS) } });
  if (q.mine) and.push({ createdById: user.id });
  if (q.q && cfg.search.length)
    and.push({
      OR: cfg.search.map((f) => ({ [f]: { contains: q.q, mode: 'insensitive' } })),
    });
  and.push(...(cfg.filters?.(q) ?? []));
  if (kind === 'fuel' && q.drops) {
    const { points } = await fuelEconomy(tx, vehicle);
    and.push({ id: { in: points.filter((p) => p.drop).map((p) => p.id) } });
  }

  const sorts: readonly string[] = RECORD_SORTS[kind];
  const sort = q.sort && sorts.includes(q.sort) ? q.sort : sorts[0]!;
  const where = { AND: and };
  const take = q.all ? EXPORT_LIMIT : q.limit;
  const skip = q.all ? 0 : q.offset;
  const model = delegate(tx, kind);
  const [rows, total] = await Promise.all([
    model.findMany({
      where,
      include: cfg.include,
      orderBy: [{ [sort]: q.dir }, { [cfg.dateField]: 'desc' }, { id: 'desc' }],
      skip,
      take,
    }),
    model.count({ where }),
  ]);
  return {
    items: await decorate(tx, kind, vehicle, rows),
    total,
    nextOffset: !q.all && skip + rows.length < total ? skip + rows.length : null,
  };
}

export async function findRow(tx: Tx, kind: RecordKind, vehicle: VehicleRef, id: string) {
  const row = await delegate(tx, kind).findFirst({
    where: { id, vehicleId: vehicle.id },
    include: KINDS[kind].include,
  });
  if (!row) throw new HttpError(404, 'not_found');
  return row;
}

const source = (kind: RecordKind, id: string) => ({
  sourceType: KINDS[kind].sourceType,
  sourceId: id,
});

/** The event's date: when the record happened, or now for notes. */
const occurred = (kind: RecordKind, row: Row) => (row[KINDS[kind].dateField] as Date) ?? new Date();

export async function createRecord<K extends RecordKind>(
  tx: Tx,
  user: SessionUser,
  kind: K,
  vehicle: VehicleRef,
  input: RecordInput<K>,
  /** Set when the record comes from an Excel import: its events are marked "imported". */
  importRunId: string | null = null,
) {
  const cfg = KINDS[kind] as KindConfig<K>;
  const ctx = { tx, vehicle };
  const row = await delegate(tx, kind).create({
    data: { ...(await cfg.data(input, ctx)), vehicleId: vehicle.id, createdById: user.id },
    include: cfg.include,
  });
  const base = { vehicleId: vehicle.id, userId: user.id, importRunId, ...source(kind, row.id) };
  await tx.event.create({
    data: {
      ...base,
      type: cfg.createType,
      occurredAt: occurred(kind, row),
      params: cfg.params(row),
    },
  });
  if (kind === 'malfunctions' && row.state === 'RESOLVED') {
    await tx.event.create({
      data: {
        ...base,
        type: 'MALFUNCTION_RESOLVED',
        occurredAt: row.resolvedAt as Date,
        params: { description: row.description as string },
      },
    });
  }
  await cfg.after?.(ctx, input, row.id);
  return row;
}

export async function updateRecord<K extends RecordKind>(
  tx: Tx,
  user: SessionUser,
  kind: K,
  vehicle: VehicleRef,
  id: string,
  input: RecordInput<K>,
) {
  const cfg = KINDS[kind] as KindConfig<K>;
  const ctx = { tx, vehicle };
  const before = await findRow(tx, kind, vehicle, id);
  if (before.deletedAt) throw new HttpError(404, 'not_found');
  if (!canChange(user, kind, before)) throw new HttpError(403, 'forbidden');

  const row = await delegate(tx, kind).update({
    where: { id },
    data: await cfg.data(input, ctx),
    include: cfg.include,
  });
  // The record's own timeline entry follows the edit, so it never shows stale values.
  await tx.event.updateMany({
    where: { ...source(kind, id), type: cfg.createType },
    data: { occurredAt: occurred(kind, row), params: cfg.params(row) },
  });

  const now = new Date();
  const base = { vehicleId: vehicle.id, userId: user.id, ...source(kind, id) };
  if (kind === 'malfunctions' && before.state !== row.state) {
    const resolved = row.state === 'RESOLVED';
    await tx.event.create({
      data: {
        ...base,
        type: resolved ? 'MALFUNCTION_RESOLVED' : 'MALFUNCTION_UPDATED',
        occurredAt: resolved ? (row.resolvedAt as Date) : now,
        params: { description: row.description as string, state: row.state as string },
      },
    });
  } else {
    await tx.event.create({
      data: {
        ...base,
        type: 'RECORD_EDITED',
        occurredAt: now,
        params: { kind, of: cfg.createType, ...cfg.params(row) },
      },
    });
  }
  await cfg.after?.(ctx, input, id);
  return row;
}

/**
 * Delete and Undo. A delete only marks the record, hides its timeline entries and logs
 * RECORD_DELETED; restore reverses all of it and logs RECORD_RESTORED.
 */
export async function setDeleted(
  tx: Tx,
  user: SessionUser,
  kind: RecordKind,
  vehicle: VehicleRef,
  id: string,
  deleted: boolean,
) {
  const cfg = KINDS[kind];
  const row = await findRow(tx, kind, vehicle, id);
  if (!canChange(user, kind, row)) throw new HttpError(403, 'forbidden');
  if (!!row.deletedAt === deleted)
    throw new HttpError(409, deleted ? 'already_deleted' : 'not_deleted');

  const now = new Date();
  await delegate(tx, kind).update({ where: { id }, data: { deletedAt: deleted ? now : null } });
  await tx.event.updateMany({
    where: {
      ...source(kind, id),
      ...(deleted
        ? { hiddenAt: null }
        : { type: { notIn: ['RECORD_DELETED', 'RECORD_RESTORED'] } }),
    },
    data: { hiddenAt: deleted ? now : null },
  });
  await tx.event.create({
    data: {
      vehicleId: vehicle.id,
      userId: user.id,
      ...source(kind, id),
      type: deleted ? 'RECORD_DELETED' : 'RECORD_RESTORED',
      occurredAt: now,
      params: { kind, of: cfg.createType, ...cfg.params(row) },
    },
  });
  await cfg.after?.({ tx, vehicle }, null, id);
}

export async function serializeOne(tx: Tx, kind: RecordKind, vehicle: VehicleRef, row: Row) {
  const [item] = await decorate(tx, kind, vehicle, [row]);
  return item!;
}

/**
 * One record for its report (Revisions 1): the row as the list returns it, plus every timeline
 * entry about it (reported, updated, resolved, edited, restored) with who wrote it, oldest first.
 */
export async function getRecord(tx: Tx, kind: RecordKind, vehicle: VehicleRef, id: string) {
  const row = await findRow(tx, kind, vehicle, id);
  if (row.deletedAt) throw new HttpError(404, 'not_found');
  const [item, events] = await Promise.all([
    serializeOne(tx, kind, vehicle, row),
    tx.event.findMany({
      where: { ...source(kind, id), hiddenAt: null },
      orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
      take: 200,
      select: {
        id: true,
        type: true,
        occurredAt: true,
        params: true,
        sourceType: true,
        sourceId: true,
        importRunId: true,
        user: { select: { name: true } },
      },
    }),
  ]);
  const progress = kind === 'malfunctions' ? await progressOf(tx, id) : undefined;
  return {
    item: progress ? { ...item, progress } : item,
    history: events.map(({ user, importRunId, ...e }) => ({
      ...e,
      imported: importRunId !== null,
      by: user?.name ?? null,
    })),
  };
}

/** A malfunction's progress updates, oldest first, with who wrote each (Revisions 1). */
export async function progressOf(tx: Tx, malfunctionId: string) {
  const rows = await tx.malfunctionProgress.findMany({
    where: { malfunctionId, deletedAt: null },
    orderBy: [{ at: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, at: true, body: true, createdById: true },
  });
  const ids = [...new Set(rows.map((r) => r.createdById).filter((v): v is string => !!v))];
  const users = ids.length
    ? await tx.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
    : [];
  const names = new Map(users.map((u) => [u.id, u.name]));
  return rows.map((r) => ({
    ...r,
    createdBy: r.createdById ? (names.get(r.createdById) ?? null) : null,
  }));
}
