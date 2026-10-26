import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { Prisma } from '@prisma/client';
import {
  ownershipBody,
  RECORD_BODIES,
  recordIdParams,
  recordParams,
  recordsQuery,
  serialParam,
  statusOverrideBody,
  type RecordKind,
} from '@fleet-hub/shared';
import { HttpError, parse } from '../lib/http';
import { visibleQuotesWhere } from '../lib/quote-visibility';
import {
  attachmentsFor,
  canCreate,
  createRecord,
  fuelEconomy,
  listRecords,
  serializeOne,
  setDeleted,
  updateRecord,
  type VehicleRef,
} from '../lib/records';
import { refreshStatus } from '../lib/status';
import { requireRole, requireUser } from '../plugins/auth';

type Db = FastifyInstance['db'] | Prisma.TransactionClient;

export async function vehicleRef(db: Db, serial: string): Promise<VehicleRef> {
  const v = await db.vehicle.findUnique({
    where: { serial },
    select: {
      id: true,
      serial: true,
      odometerKm: true,
      engineHours: true,
      type: { select: { usageUnit: true } },
    },
  });
  if (!v) throw new HttpError(404, 'vehicle_not_found');
  const { type, ...rest } = v;
  return { ...rest, usageUnit: type.usageUnit };
}

const OWNERSHIP_FIELDS = [
  'purchaseDate',
  'supplierId',
  'purchasePrice',
  'warrantyTerms',
  'warrantyExpiry',
] as const;

/**
 * The vehicle page's record panels (SPEC 5.3). Every write runs in one transaction that saves
 * the record, writes its Event, updates the vehicle's vitals and recomputes its status.
 */
export const recordRoutes: FastifyPluginAsync = async (app) => {
  app.get('/:serial/records/:kind', { preHandler: requireUser }, async (req) => {
    const { serial, kind } = parse(recordParams, req.params);
    const q = parse(recordsQuery, req.query);
    const vehicle = await vehicleRef(app.db, serial);
    return listRecords(app.db as unknown as Prisma.TransactionClient, req.user!, kind, vehicle, q);
  });

  app.post('/:serial/records/:kind', { preHandler: requireUser }, async (req, reply) => {
    const { serial, kind } = parse(recordParams, req.params);
    const user = req.user!;
    if (!canCreate(user, kind)) throw new HttpError(403, 'forbidden');
    const input = parse(RECORD_BODIES[kind], req.body);
    const result = await app.db.$transaction(async (tx) => {
      const vehicle = await vehicleRef(tx, serial);
      const row = await createRecord(tx, user, kind as RecordKind, vehicle, input as never);
      const status = await refreshStatus(tx, vehicle.id, user.id);
      return { item: await serializeOne(tx, kind, vehicle, row), status };
    });
    return reply.status(201).send(result);
  });

  app.put('/:serial/records/:kind/:id', { preHandler: requireUser }, async (req) => {
    const { serial, kind, id } = parse(recordIdParams, req.params);
    const user = req.user!;
    const input = parse(RECORD_BODIES[kind], req.body);
    return app.db.$transaction(async (tx) => {
      const vehicle = await vehicleRef(tx, serial);
      const row = await updateRecord(tx, user, kind as RecordKind, vehicle, id, input as never);
      const status = await refreshStatus(tx, vehicle.id, user.id);
      return { item: await serializeOne(tx, kind, vehicle, row), status };
    });
  });

  for (const [method, path, deleted] of [
    ['DELETE', '/:serial/records/:kind/:id', true],
    ['POST', '/:serial/records/:kind/:id/restore', false],
  ] as const) {
    app.route({
      method,
      url: path,
      preHandler: requireUser,
      handler: async (req) => {
        const { serial, kind, id } = parse(recordIdParams, req.params);
        const user = req.user!;
        return app.db.$transaction(async (tx) => {
          const vehicle = await vehicleRef(tx, serial);
          await setDeleted(tx, user, kind, vehicle, id, deleted);
          return { ok: true, status: await refreshStatus(tx, vehicle.id, user.id) };
        });
      },
    });
  }

  app.get('/:serial/fuel-economy', { preHandler: requireUser }, async (req) => {
    const { serial } = parse(serialParam, req.params);
    const vehicle = await vehicleRef(app.db, serial);
    return fuelEconomy(app.db as unknown as Prisma.TransactionClient, vehicle);
  });

  // ---------- Ownership & warranty: fields on the vehicle itself ----------

  app.get('/:serial/ownership', { preHandler: requireUser }, async (req) => {
    const { serial } = parse(serialParam, req.params);
    const v = await app.db.vehicle.findUnique({
      where: { serial },
      select: {
        id: true,
        purchaseDate: true,
        purchasePrice: true,
        warrantyTerms: true,
        warrantyExpiry: true,
        supplier: { select: { id: true, name: true } },
      },
    });
    if (!v) throw new HttpError(404, 'vehicle_not_found');
    const [suppliers, files] = await Promise.all([
      app.db.supplier.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      attachmentsFor(app.db as unknown as Prisma.TransactionClient, 'Vehicle', [v.id]),
    ]);
    const { id, purchasePrice, ...rest } = v;
    return {
      ...rest,
      id,
      purchasePrice: purchasePrice?.toNumber() ?? null,
      attachments: files.get(id) ?? [],
      suppliers,
    };
  });

  app.put('/:serial/ownership', { preHandler: requireRole('EDITOR') }, async (req) => {
    const { serial } = parse(serialParam, req.params);
    const input = parse(ownershipBody, req.body);
    const user = req.user!;
    return app.db.$transaction(async (tx) => {
      const before = await tx.vehicle.findUnique({
        where: { serial },
        select: { id: true, ...Object.fromEntries(OWNERSHIP_FIELDS.map((f) => [f, true])) },
      });
      if (!before) throw new HttpError(404, 'vehicle_not_found');
      if (input.supplierId) {
        const s = await tx.supplier.findUnique({ where: { id: input.supplierId } });
        if (!s) throw new HttpError(400, 'unknown_supplier');
      }
      const same = (a: unknown, b: unknown) => String(a ?? '') === String(b ?? '');
      const changed = OWNERSHIP_FIELDS.filter((f) => {
        const a = (before as Record<string, unknown>)[f];
        const b = input[f];
        return a instanceof Date || b instanceof Date
          ? (a as Date | null)?.getTime() !== (b as Date | null)?.getTime()
          : !same(a, b);
      });
      if (!changed.length) return { ok: true, changed };
      await tx.vehicle.update({ where: { id: before.id }, data: input });
      await tx.event.create({
        data: {
          type: 'VEHICLE_UPDATED',
          vehicleId: before.id,
          occurredAt: new Date(),
          userId: user.id,
          params: { fields: changed },
          sourceType: 'Vehicle',
          sourceId: before.id,
        },
      });
      return { ok: true, changed };
    });
  });

  // ---------- Manual status override (admins), logged ----------

  app.put('/:serial/status-override', { preHandler: requireRole('ADMIN') }, async (req) => {
    const { serial } = parse(serialParam, req.params);
    const body = parse(statusOverrideBody, req.body);
    const user = req.user!;
    return app.db.$transaction(async (tx) => {
      const v = await tx.vehicle.findUnique({ where: { serial }, select: { id: true } });
      if (!v) throw new HttpError(404, 'vehicle_not_found');
      const now = new Date();
      const set = body.mode === 'set';
      await tx.vehicle.update({
        where: { id: v.id },
        data: {
          statusOverride: set ? body.status : null,
          statusOverrideReason: set ? body.reason : null,
          statusOverrideById: set ? user.id : null,
          statusOverrideAt: set ? now : null,
        },
      });
      const status = await refreshStatus(tx, v.id, user.id, { now, silent: true });
      await tx.event.create({
        data: {
          type: 'STATUS_OVERRIDDEN',
          vehicleId: v.id,
          occurredAt: now,
          userId: user.id,
          params: set ? { to: body.status, reason: body.reason } : { to: status, cleared: true },
        },
      });
      return { status, override: set ? body.status : null };
    });
  });

  // ---------- Documents and quotes on this vehicle (adding them is Phase 6) ----------

  app.get('/:serial/documents', { preHandler: requireUser }, async (req) => {
    const { serial } = parse(serialParam, req.params);
    const vehicle = await vehicleRef(app.db, serial);
    const rows = await app.db.document.findMany({
      where: { deletedAt: null, vehicles: { some: { vehicleId: vehicle.id } } },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      take: 1_000,
      select: {
        id: true,
        kind: true,
        date: true,
        vendor: true,
        amount: true,
        notes: true,
        category: { select: { code: true } },
      },
    });
    const files = await attachmentsFor(
      app.db as unknown as Prisma.TransactionClient,
      'Document',
      rows.map((r) => r.id),
    );
    return {
      items: rows.map(({ amount, category, ...d }) => ({
        ...d,
        amount: amount?.toNumber() ?? null,
        category: category?.code ?? null,
        attachments: files.get(d.id) ?? [],
      })),
    };
  });

  app.get('/:serial/quotes', { preHandler: requireUser }, async (req) => {
    const { serial } = parse(serialParam, req.params);
    const vehicle = await vehicleRef(app.db, serial);
    // The same visibility filter as every other quote route (SPEC 5.6).
    const rows = await app.db.quote.findMany({
      where: {
        AND: [visibleQuotesWhere(req.user!), { vehicles: { some: { vehicleId: vehicle.id } } }],
      },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      take: 1_000,
      select: {
        id: true,
        date: true,
        validUntil: true,
        status: true,
        notes: true,
        supplier: { select: { name: true } },
        lines: { select: { quantity: true, unitPrice: true } },
      },
    });
    return {
      items: rows.map(({ supplier, lines, ...q }) => ({
        ...q,
        supplier: supplier.name,
        lineCount: lines.length,
        total: lines.reduce((sum, l) => sum + l.quantity * l.unitPrice.toNumber(), 0),
      })),
    };
  });
};
