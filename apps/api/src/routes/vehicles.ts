import type { FastifyPluginAsync } from 'fastify';
import type { Prisma } from '@prisma/client';
import { listQuery } from '@fleet-hub/shared';
import { parse } from '../lib/http';
import { requireUser } from '../plugins/auth';

/**
 * Fields a vehicle list may return. Never add startCodeEnc here: start codes are
 * only revealed by the permission-checked endpoint (Phase 3).
 */
export const vehicleListSelect = {
  id: true,
  serial: true,
  vin: true,
  licenseNo: true,
  make: true,
  model: true,
  year: true,
  status: true,
  hasStartCode: true,
  readinessPct: true,
  odometerKm: true,
  engineHours: true,
  nextServiceDate: true,
  annualTestExpiry: true,
  type: { select: { code: true, category: true } },
  department: { select: { code: true } },
  location: { select: { code: true } },
} satisfies Prisma.VehicleSelect;

export const vehicleRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { preHandler: requireUser }, async (req) => {
    const { cursor, limit } = parse(listQuery, req.query);
    const rows = await app.db.vehicle.findMany({
      select: vehicleListSelect,
      orderBy: { serial: 'asc' },
      take: limit + 1,
      ...(cursor ? { cursor: { serial: cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return { items, nextCursor: hasMore ? items.at(-1)!.serial : null };
  });
};
