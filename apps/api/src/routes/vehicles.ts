import type { FastifyPluginAsync } from 'fastify';
import type { Prisma } from '@prisma/client';
import { listQuery, serialParam } from '@fleet-hub/shared';
import { decryptStartCode } from '@fleet-hub/shared/crypto';
import { HttpError, parse } from '../lib/http';
import { vehicleDetail } from '../lib/vehicle-detail';
import { requireStartCodeView, requireUser } from '../plugins/auth';

/**
 * Fields a vehicle list may return. Never add startCodeEnc here: start codes are
 * only revealed by the permission-checked endpoint below.
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

export const vehicleRoutes: FastifyPluginAsync<{ codeKey: string }> = async (app, opts) => {
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

  app.get('/:serial', { preHandler: requireUser }, async (req) => {
    const { serial } = parse(serialParam, req.params);
    return vehicleDetail(app, req.user!, serial);
  });

  /**
   * The only place a start code leaves the database: permission-checked, rate-limited,
   * never cached, and every reveal is written to the audit log.
   */
  app.post(
    '/:serial/start-code/reveal',
    {
      preHandler: requireStartCodeView,
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute',
          keyGenerator: (req) => req.user?.id ?? req.ip,
        },
      },
    },
    async (req, reply) => {
      const { serial } = parse(serialParam, req.params);
      const vehicle = await app.db.vehicle.findUnique({
        where: { serial },
        select: { id: true, hasStartCode: true, startCodeEnc: true },
      });
      if (!vehicle) throw new HttpError(404, 'not_found');
      if (!vehicle.hasStartCode || !vehicle.startCodeEnc) throw new HttpError(404, 'no_start_code');
      const code = decryptStartCode(vehicle.startCodeEnc, opts.codeKey);
      await app.db.auditLog.create({
        data: {
          userId: req.user!.id,
          action: 'startCode.reveal',
          targetType: 'Vehicle',
          targetId: vehicle.id,
          meta: { serial },
          ip: req.ip,
        },
      });
      void reply.header('cache-control', 'no-store');
      return { code };
    },
  );
};
