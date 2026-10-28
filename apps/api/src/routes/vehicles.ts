import type { FastifyPluginAsync } from 'fastify';
import type { Prisma } from '@prisma/client';
import multipart from '@fastify/multipart';
import { listQuery, serialParam, vehiclePictureParams } from '@fleet-hub/shared';
import { decryptStartCode } from '@fleet-hub/shared/crypto';
import { HttpError, parse } from '../lib/http';
import { cleanFileName, storePicture } from '../lib/uploads';
import { vehicleDetail } from '../lib/vehicle-detail';
import { noteVehicleUpdate, parseVehicle, saveVehicle, vehicleForm } from '../lib/vehicle-write';
import { requireRole, requireStartCodeView, requireUser } from '../plugins/auth';

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

/** Which Vehicle column holds each picture slot. */
const SLOT_COLUMN = {
  top: 'topPhotoId',
  side: 'sidePhotoId',
  drawing: 'customImageId',
} as const;

export const vehicleRoutes: FastifyPluginAsync<{
  codeKey: string;
  uploadDir: string;
  maxMb: number;
}> = async (app, opts) => {
  await app.register(multipart, {
    limits: { fileSize: opts.maxMb * 1024 * 1024, files: 1, fields: 0, parts: 1 },
  });
  const editor = { preHandler: requireRole('EDITOR') };

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

  // ---------- Add / edit (SPEC 5.8): editors and admins ----------

  app.post('/', editor, async (req, reply) => {
    const user = req.user!;
    const saved = await app.db.$transaction(async (tx) => {
      const { input, typeId } = await parseVehicle(tx, req.body);
      return saveVehicle(tx, user, null, input, typeId, { codeKey: opts.codeKey, ip: req.ip });
    });
    void reply.status(201);
    return saved;
  });

  /** The stepper's values for an existing vehicle: never the start code, only whether one is set. */
  app.get('/:serial/form', editor, async (req) => {
    const { serial } = parse(serialParam, req.params);
    const form = await vehicleForm(app.db as unknown as Prisma.TransactionClient, serial);
    if (!form) throw new HttpError(404, 'vehicle_not_found');
    return { values: form.values, hasStartCode: form.hasStartCode };
  });

  app.put('/:serial', editor, async (req) => {
    const { serial } = parse(serialParam, req.params);
    const user = req.user!;
    return app.db.$transaction(async (tx) => {
      const { input, typeId } = await parseVehicle(tx, req.body);
      return saveVehicle(tx, user, serial, input, typeId, { codeKey: opts.codeKey, ip: req.ip });
    });
  });

  // ---------- Photos and custom drawing (SPEC A4, 5.8) ----------

  app.put('/:serial/pictures/:slot', editor, async (req) => {
    const { serial, slot } = parse(vehiclePictureParams, req.params);
    const user = req.user!;
    if (!req.isMultipart()) throw new HttpError(415, 'not_multipart');
    const vehicle = await app.db.vehicle.findUnique({ where: { serial }, select: { id: true } });
    if (!vehicle) throw new HttpError(404, 'vehicle_not_found');
    const part = await req.file();
    if (!part) throw new HttpError(400, 'no_files');
    const buf = await part.toBuffer().catch((err: { code?: string }) => {
      if (err.code === 'FST_REQ_FILE_TOO_LARGE') throw new HttpError(413, 'too_large');
      throw err;
    });
    const file = await storePicture(opts.uploadDir, buf, slot === 'drawing');
    return app.db.$transaction(async (tx) => {
      const row = await tx.attachment.create({
        data: {
          ownerType: 'VehiclePicture',
          ownerId: vehicle.id,
          fileName: cleanFileName(part.filename),
          uploadedById: user.id,
          ...file,
        },
        select: { id: true },
      });
      await tx.vehicle.update({ where: { id: vehicle.id }, data: { [SLOT_COLUMN[slot]]: row.id } });
      await noteVehicleUpdate(tx, vehicle.id, user.id, [slot === 'drawing' ? 'drawing' : 'photos']);
      return { id: row.id, mimeType: file.mimeType };
    });
  });

  app.delete('/:serial/pictures/:slot', editor, async (req) => {
    const { serial, slot } = parse(vehiclePictureParams, req.params);
    const user = req.user!;
    return app.db.$transaction(async (tx) => {
      const v = await tx.vehicle.findUnique({
        where: { serial },
        select: { id: true, topPhotoId: true, sidePhotoId: true, customImageId: true },
      });
      if (!v) throw new HttpError(404, 'vehicle_not_found');
      const current = v[SLOT_COLUMN[slot]];
      if (!current) return { ok: true };
      await tx.vehicle.update({ where: { id: v.id }, data: { [SLOT_COLUMN[slot]]: null } });
      await tx.attachment.update({ where: { id: current }, data: { deletedAt: new Date() } });
      await noteVehicleUpdate(tx, v.id, user.id, [slot === 'drawing' ? 'drawing' : 'photos']);
      return { ok: true };
    });
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
