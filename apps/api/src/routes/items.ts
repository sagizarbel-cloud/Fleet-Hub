import type { FastifyPluginAsync } from 'fastify';
import type { Prisma } from '@prisma/client';
import { assignItemBody, idParam, itemBody, itemsQuery } from '@fleet-hub/shared';
import { HttpError, parse } from '../lib/http';
import { requireRole, requireUser } from '../plugins/auth';

const requireEditor = requireRole('EDITOR');

const itemSelect = {
  id: true,
  kind: true,
  name: true,
  model: true,
  spec: true,
  serial: true,
  retiredAt: true,
  currentVehicle: { select: { serial: true, type: { select: { code: true } } } },
  assignments: {
    where: { removedAt: null },
    select: { assignedAt: true },
    take: 1,
  },
} satisfies Prisma.ItemSelect;

const serialize = ({
  currentVehicle,
  assignments,
  ...item
}: Prisma.ItemGetPayload<{ select: typeof itemSelect }>) => ({
  ...item,
  vehicle: currentVehicle
    ? { serial: currentVehicle.serial, type: currentVehicle.type.code }
    : null,
  since: assignments[0]?.assignedAt ?? null,
});

/** A serial already used by another item is a 409, not a server error. */
async function uniqueSerial(
  db: Prisma.TransactionClient | { item: Prisma.TransactionClient['item'] },
  serial: string | null,
  id?: string,
) {
  if (!serial) return;
  const other = await db.item.findFirst({ where: { serial, NOT: id ? { id } : undefined } });
  if (other) throw new HttpError(409, 'serial_taken');
}

/**
 * The equipment catalog (SPEC 5.7), and assigning and removing equipment from a vehicle.
 * Every assignment change writes an Event on each vehicle it touches.
 */
export const itemRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { preHandler: requireUser }, async (req) => {
    const q = parse(itemsQuery, req.query);
    const and: Prisma.ItemWhereInput[] = [{ retiredAt: q.retired ? { not: null } : null }];
    if (q.kind) and.push({ kind: q.kind });
    if (q.vehicle) and.push({ currentVehicle: { serial: q.vehicle } });
    if (q.where) and.push({ currentVehicleId: q.where === 'yard' ? null : { not: null } });
    if (q.q) {
      const has = { contains: q.q, mode: 'insensitive' as const };
      and.push({
        OR: [{ name: has }, { model: has }, { spec: has }, { serial: has }],
      });
    }
    const rows = await app.db.item.findMany({
      where: { AND: and },
      select: itemSelect,
      orderBy: [{ kind: 'asc' }, { name: 'asc' }, { id: 'asc' }],
      take: 2_000,
    });
    return { items: rows.map(serialize) };
  });

  app.get('/:id', { preHandler: requireUser }, async (req) => {
    const { id } = parse(idParam, req.params);
    const row = await app.db.item.findUnique({ where: { id }, select: itemSelect });
    if (!row) throw new HttpError(404, 'not_found');
    const history = await app.db.itemAssignment.findMany({
      where: { itemId: id },
      orderBy: [{ assignedAt: 'desc' }, { id: 'desc' }],
      select: {
        assignedAt: true,
        removedAt: true,
        vehicle: { select: { serial: true, type: { select: { code: true } } } },
      },
    });
    return {
      ...serialize(row),
      history: history.map(({ vehicle, ...h }) => ({
        ...h,
        serial: vehicle.serial,
        type: vehicle.type.code,
      })),
    };
  });

  app.post('/', { preHandler: requireEditor }, async (req, reply) => {
    const input = parse(itemBody, req.body);
    await uniqueSerial(app.db, input.serial);
    const row = await app.db.item.create({ data: input, select: itemSelect });
    return reply.status(201).send(serialize(row));
  });

  app.put('/:id', { preHandler: requireEditor }, async (req) => {
    const { id } = parse(idParam, req.params);
    const input = parse(itemBody, req.body);
    const before = await app.db.item.findUnique({ where: { id }, select: { id: true } });
    if (!before) throw new HttpError(404, 'not_found');
    await uniqueSerial(app.db, input.serial, id);
    return serialize(await app.db.item.update({ where: { id }, data: input, select: itemSelect }));
  });

  // Retiring takes an item out of the catalog; it must be off every vehicle first.
  for (const [url, retired] of [
    ['/:id/retire', true],
    ['/:id/unretire', false],
  ] as const) {
    app.post(url, { preHandler: requireEditor }, async (req) => {
      const { id } = parse(idParam, req.params);
      const item = await app.db.item.findUnique({ where: { id } });
      if (!item) throw new HttpError(404, 'not_found');
      if (!!item.retiredAt === retired)
        throw new HttpError(409, retired ? 'already_retired' : 'not_retired');
      if (retired && item.currentVehicleId) throw new HttpError(409, 'assigned');
      return serialize(
        await app.db.item.update({
          where: { id },
          data: { retiredAt: retired ? new Date() : null },
          select: itemSelect,
        }),
      );
    });
  }

  // Items not on any vehicle: the choices for "Assign".
  app.get('/unassigned', { preHandler: requireEditor }, async () => ({
    items: await app.db.item.findMany({
      where: { currentVehicleId: null, retiredAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, kind: true, name: true, model: true, spec: true, serial: true },
    }),
  }));

  app.post('/:id/assign', { preHandler: requireEditor }, async (req) => {
    const { id } = parse(idParam, req.params);
    const { vehicle: serial } = parse(assignItemBody, req.body);
    const userId = req.user!.id;
    return app.db.$transaction(async (tx) => {
      const item = await tx.item.findUnique({ where: { id } });
      if (!item) throw new HttpError(404, 'not_found');
      if (item.retiredAt) throw new HttpError(409, 'retired');
      const vehicle = await tx.vehicle.findUnique({ where: { serial }, select: { id: true } });
      if (!vehicle) throw new HttpError(404, 'vehicle_not_found');
      if (item.currentVehicleId === vehicle.id) throw new HttpError(409, 'already_assigned');

      const at = new Date();
      const params = { item: item.name, serial: item.serial };
      const source = { sourceType: 'Item', sourceId: item.id };
      if (item.currentVehicleId) {
        // Moving from another vehicle: close that assignment and log the removal there too.
        await tx.itemAssignment.updateMany({
          where: { itemId: id, removedAt: null },
          data: { removedAt: at },
        });
        await tx.event.create({
          data: {
            type: 'ITEM_REMOVED',
            vehicleId: item.currentVehicleId,
            occurredAt: at,
            userId,
            params,
            ...source,
          },
        });
      }
      await tx.itemAssignment.create({
        data: { itemId: id, vehicleId: vehicle.id, assignedAt: at },
      });
      await tx.item.update({ where: { id }, data: { currentVehicleId: vehicle.id } });
      await tx.event.create({
        data: {
          type: 'ITEM_ASSIGNED',
          vehicleId: vehicle.id,
          occurredAt: at,
          userId,
          params,
          ...source,
        },
      });
      return { ok: true };
    });
  });

  app.post('/:id/remove', { preHandler: requireEditor }, async (req) => {
    const { id } = parse(idParam, req.params);
    const userId = req.user!.id;
    return app.db.$transaction(async (tx) => {
      const item = await tx.item.findUnique({ where: { id } });
      if (!item) throw new HttpError(404, 'not_found');
      if (!item.currentVehicleId) throw new HttpError(409, 'not_assigned');
      const at = new Date();
      await tx.itemAssignment.updateMany({
        where: { itemId: id, removedAt: null },
        data: { removedAt: at },
      });
      await tx.item.update({ where: { id }, data: { currentVehicleId: null } });
      await tx.event.create({
        data: {
          type: 'ITEM_REMOVED',
          vehicleId: item.currentVehicleId,
          occurredAt: at,
          userId,
          params: { item: item.name, serial: item.serial },
          sourceType: 'Item',
          sourceId: item.id,
        },
      });
      return { ok: true };
    });
  });
};
