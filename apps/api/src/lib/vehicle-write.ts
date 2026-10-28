import { Prisma } from '@prisma/client';
import {
  vehicleBody,
  type SessionUser,
  type VehicleBody,
  type VehicleField,
  type VehicleInput,
} from '@fleet-hub/shared';
import { encryptStartCode } from '@fleet-hub/shared/crypto';
import { HttpError, issueCode } from './http';
import { refreshStatus } from './status';

type Tx = Prisma.TransactionClient;

const invalid = (path: string, code: string) =>
  Object.assign(new HttpError(400, 'validation_failed'), { issues: [{ path, code }] });

/** The plain vehicle columns the stepper edits, by field name. */
const COLUMNS = [
  'serial',
  'vin',
  'licenseNo',
  'make',
  'model',
  'year',
  'operatorName',
  'odometerKm',
  'engineHours',
  'nextServiceDate',
  'nextServiceKm',
  'nextServiceHours',
  'annualTestExpiry',
  'insuranceExpiry',
  'safetyCheckExpiry',
  'purchaseDate',
  'purchasePrice',
  'warrantyTerms',
  'warrantyExpiry',
] as const satisfies readonly VehicleField[];

const DATE_COLUMNS = [
  'nextServiceDate',
  'annualTestExpiry',
  'insuranceExpiry',
  'safetyCheckExpiry',
  'purchaseDate',
  'warrantyExpiry',
] as const satisfies readonly (typeof COLUMNS)[number][];
const sameDay = (a: Date, b: Date) => a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);

const formSelect = {
  id: true,
  ...Object.fromEntries(COLUMNS.map((c) => [c, true])),
  hasStartCode: true,
  type: { select: { code: true, category: true } },
  department: { select: { code: true } },
  location: { select: { code: true } },
} as const;

type FormRow = Record<(typeof COLUMNS)[number], unknown> & {
  id: string;
  hasStartCode: boolean;
  type: { code: string; category: 'ROAD' | 'EQUIPMENT' };
  department: { code: string } | null;
  location: { code: string } | null;
};

/**
 * A vehicle as the stepper's fields, for editing and for merging an import row into.
 * Never includes the start code itself, only whether there is one.
 */
export async function vehicleForm(tx: Tx, serial: string) {
  const row = (await tx.vehicle.findUnique({
    where: { serial },
    select: formSelect,
  })) as unknown as FormRow | null;
  if (!row) return null;
  const { id, hasStartCode, type, department, location, purchasePrice, ...rest } = row;
  return {
    id,
    hasStartCode,
    values: {
      ...rest,
      purchasePrice: purchasePrice instanceof Prisma.Decimal ? purchasePrice.toNumber() : null,
      type: type.code,
      category: type.category,
      department: department?.code ?? null,
      location: location?.code ?? null,
    } as unknown as VehicleBody,
  };
}

/**
 * Validates a stepper body against the vehicle type it names: the type's category decides the
 * VIN rule, so the category is taken from the database, never from the client.
 */
export async function parseVehicle(tx: Tx, body: unknown) {
  const raw = (body ?? {}) as Record<string, unknown>;
  const type =
    typeof raw.type === 'string'
      ? await tx.vehicleType.findUnique({ where: { code: raw.type } })
      : null;
  const parsed = vehicleBody.safeParse({ ...raw, category: type?.category ?? 'ROAD' });
  const issues = parsed.success
    ? []
    : parsed.error.issues.map((i) => ({ path: i.path.join('.'), code: issueCode(i) }));
  if (raw.type !== undefined && !type) issues.push({ path: 'type', code: 'unknown' });
  if (issues.length || !parsed.success || !type)
    throw Object.assign(new HttpError(400, 'validation_failed'), {
      issues: issues.length ? issues : [{ path: 'type', code: 'required' }],
    });
  return { input: parsed.data, typeId: type.id };
}

async function codeId(tx: Tx, list: 'department' | 'location', code: string | null) {
  if (!code) return null;
  const row =
    list === 'department'
      ? await tx.department.findUnique({ where: { code }, select: { id: true } })
      : await tx.location.findUnique({ where: { code }, select: { id: true } });
  if (!row) throw invalid(list, 'unknown');
  return row.id;
}

const MERGE_MS = 2 * 60_000;

/**
 * Writes VEHICLE_UPDATED naming the changed fields. A save and the picture uploads that follow
 * it moments later, by the same user, share one event instead of filling the timeline.
 */
export async function noteVehicleUpdate(
  tx: Tx,
  vehicleId: string,
  userId: string,
  fields: string[],
  importRunId: string | null = null,
) {
  const now = new Date();
  const last = importRunId
    ? null
    : await tx.event.findFirst({
        where: { vehicleId },
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          type: true,
          userId: true,
          occurredAt: true,
          params: true,
          importRunId: true,
        },
      });
  if (
    last &&
    last.type === 'VEHICLE_UPDATED' &&
    last.userId === userId &&
    !last.importRunId &&
    now.getTime() - last.occurredAt.getTime() < MERGE_MS
  ) {
    const before = (last.params as { fields?: string[] } | null)?.fields ?? [];
    await tx.event.update({
      where: { id: last.id },
      data: { params: { fields: [...new Set([...before, ...fields])] } },
    });
    return;
  }
  await tx.event.create({
    data: {
      type: 'VEHICLE_UPDATED',
      vehicleId,
      userId,
      importRunId,
      occurredAt: now,
      params: { fields },
      sourceType: 'Vehicle',
      sourceId: vehicleId,
    },
  });
}

const same = (a: unknown, b: unknown) => {
  const norm = (v: unknown) =>
    v instanceof Date ? v.getTime() : v instanceof Prisma.Decimal ? v.toNumber() : (v ?? null);
  return norm(a) === norm(b);
};

/**
 * Creates (serial null) or updates a vehicle from validated stepper values, with its events:
 * VEHICLE_CREATED, or VEHICLE_UPDATED naming the fields that changed. Setting or removing a
 * start code needs the start-code permission and is written to the audit log, never its value.
 */
export async function saveVehicle(
  tx: Tx,
  user: SessionUser,
  existing: string | null,
  input: VehicleInput,
  typeId: string,
  opts: { codeKey: string; importRunId?: string | null; ip?: string },
) {
  if (input.startCode !== undefined && !user.canViewStartCodes)
    throw new HttpError(403, 'forbidden');

  const data = {
    ...Object.fromEntries(COLUMNS.map((c) => [c, input[c]])),
    typeId,
    departmentId: await codeId(tx, 'department', input.department),
    locationId: await codeId(tx, 'location', input.location),
    ...(input.startCode === undefined
      ? {}
      : input.startCode === null
        ? { hasStartCode: false, startCodeEnc: null }
        : { hasStartCode: true, startCodeEnc: encryptStartCode(input.startCode, opts.codeKey) }),
  } as Prisma.VehicleUncheckedCreateInput;

  const before = existing
    ? await tx.vehicle.findUnique({
        where: { serial: existing },
        select: {
          id: true,
          typeId: true,
          departmentId: true,
          locationId: true,
          hasStartCode: true,
          ...Object.fromEntries(COLUMNS.map((c) => [c, true])),
        },
      })
    : null;
  if (existing && !before) throw new HttpError(404, 'vehicle_not_found');

  const changed: VehicleField[] = [];
  if (before) {
    const b = before as unknown as Record<string, unknown>;
    // The form edits days; a stored time of day on the same day is not a change.
    const d = data as unknown as Record<string, unknown>;
    for (const c of DATE_COLUMNS)
      if (b[c] instanceof Date && d[c] instanceof Date && sameDay(b[c], d[c])) d[c] = b[c];
    for (const c of COLUMNS) if (!same(b[c], data[c as keyof typeof data])) changed.push(c);
    if (b.typeId !== typeId) changed.push('type');
    if (!same(b.departmentId, data.departmentId)) changed.push('department');
    if (!same(b.locationId, data.locationId)) changed.push('location');
    if (input.startCode !== undefined) changed.push('startCode');
  }

  let id: string;
  try {
    if (before) {
      id = before.id;
      if (changed.length) await tx.vehicle.update({ where: { id }, data });
    } else {
      id = (await tx.vehicle.create({ data, select: { id: true } })).id;
    }
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const target = String((err.meta?.target as string[] | undefined)?.[0] ?? 'serial');
      throw invalid(target, 'taken');
    }
    throw err;
  }

  const now = new Date();
  const base = { vehicleId: id, userId: user.id, importRunId: opts.importRunId ?? null };
  if (!before) {
    await tx.event.create({
      data: {
        ...base,
        type: 'VEHICLE_CREATED',
        occurredAt: now,
        sourceType: 'Vehicle',
        sourceId: id,
      },
    });
  } else if (changed.length) {
    await noteVehicleUpdate(tx, id, user.id, changed, opts.importRunId ?? null);
  }
  if (input.startCode !== undefined && (before ? true : input.startCode !== null))
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: input.startCode === null ? 'startCode.remove' : 'startCode.set',
        targetType: 'Vehicle',
        targetId: id,
        meta: { serial: input.serial },
        ip: opts.ip ?? null,
      },
    });
  await refreshStatus(tx, id, user.id, { now });
  return { id, serial: input.serial, created: !before, changed };
}
