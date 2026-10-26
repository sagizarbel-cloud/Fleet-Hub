import type { FastifyPluginAsync } from 'fastify';
import { assignItemBody, idParam } from '@fleet-hub/shared';
import { HttpError, parse } from '../lib/http';
import { requireRole } from '../plugins/auth';

const requireEditor = requireRole('EDITOR');

/** Assigning and removing equipment from a vehicle. Every change writes an Event on each vehicle it touches. */
export const itemRoutes: FastifyPluginAsync = async (app) => {
  // Items not on any vehicle: the choices for "Assign".
  app.get('/unassigned', { preHandler: requireEditor }, async () => ({
    items: await app.db.item.findMany({
      where: { currentVehicleId: null },
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
