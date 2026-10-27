import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { FastifyPluginAsync } from 'fastify';
import multipart from '@fastify/multipart';
import {
  attachmentQuery,
  hasRole,
  idParam,
  type AttachmentOwner,
  type RecordKind,
  type SessionUser,
} from '@fleet-hub/shared';
import { HttpError, parse } from '../lib/http';
import { canEditQuote, visibleQuotesWhere } from '../lib/quote-visibility';
import { canChangeReceipt } from '../lib/receipts';
import { canChange, delegate } from '../lib/records';
import { cleanFileName, resolveStored, storeUpload } from '../lib/uploads';
import { requireUser } from '../plugins/auth';

const KIND_OF: Record<Exclude<AttachmentOwner, 'Vehicle' | 'Document' | 'Quote'>, RecordKind> = {
  ServiceRecord: 'service',
  Malfunction: 'malfunctions',
  FluidAddition: 'fluids',
  FuelEntry: 'fuel',
  Movement: 'movements',
  Inspection: 'inspections',
  Note: 'notes',
};
const MAX_FILES = 10;

/**
 * The record (or vehicle) a file belongs to, if it still exists. `write` also checks the user
 * may change that record: the same rule as editing it.
 */
async function ownerAllows(
  db: Parameters<typeof delegate>[0],
  user: SessionUser,
  ownerType: string,
  ownerId: string,
  write: boolean,
) {
  // A vehicle's photos and custom drawing: everyone sees them; they change through the vehicle routes.
  if (ownerType === 'VehiclePicture') {
    const v = await db.vehicle.findUnique({ where: { id: ownerId }, select: { id: true } });
    return !!v && !write;
  }
  if (ownerType === 'Vehicle') {
    const v = await db.vehicle.findUnique({ where: { id: ownerId }, select: { id: true } });
    if (!v) return false;
    return !write || hasRole(user.role, 'EDITOR');
  }
  if (ownerType === 'Document') {
    const d = await db.document.findFirst({ where: { id: ownerId, deletedAt: null } });
    return !!d && (!write || canChangeReceipt(user, d));
  }
  if (ownerType === 'Quote') {
    // The quote's own visibility rule: a file on a quote you can't see is "not found".
    const q = await db.quote.findFirst({
      where: { AND: [visibleQuotesWhere(user), { id: ownerId }] },
    });
    return !!q && (!write || canEditQuote(user, q));
  }
  const kind = KIND_OF[ownerType as keyof typeof KIND_OF];
  if (!kind) return false;
  const row = await delegate(db, kind).findFirst({ where: { id: ownerId, deletedAt: null } });
  if (!row) return false;
  return !write || canChange(user, kind, row);
}

/** File attachments on any record. Files live under UPLOAD_DIR and are only served from here. */
export const attachmentRoutes: FastifyPluginAsync<{ uploadDir: string; maxMb: number }> = async (
  app,
  opts,
) => {
  await app.register(multipart, {
    limits: { fileSize: opts.maxMb * 1024 * 1024, files: MAX_FILES, fields: 0, parts: MAX_FILES },
  });
  const db = app.db as unknown as Parameters<typeof delegate>[0];

  app.post('/', { preHandler: requireUser }, async (req, reply) => {
    const { ownerType, ownerId } = parse(attachmentQuery, req.query);
    const user = req.user!;
    if (!req.isMultipart()) throw new HttpError(415, 'not_multipart');
    if (!(await ownerAllows(db, user, ownerType, ownerId, true)))
      throw new HttpError(404, 'not_found');

    const stored: { fileName: string; buf: Buffer }[] = [];
    for await (const part of req.files()) {
      const buf = await part.toBuffer().catch((err: { code?: string }) => {
        if (err.code === 'FST_REQ_FILE_TOO_LARGE') throw new HttpError(413, 'too_large');
        throw err;
      });
      stored.push({ fileName: cleanFileName(part.filename), buf });
    }
    if (!stored.length) throw new HttpError(400, 'no_files');

    const items = [];
    for (const f of stored) {
      const file = await storeUpload(opts.uploadDir, f.buf);
      const row = await app.db.attachment.create({
        data: { ownerType, ownerId, fileName: f.fileName, uploadedById: user.id, ...file },
        select: {
          id: true,
          fileName: true,
          mimeType: true,
          sizeBytes: true,
          thumbPath: true,
          createdAt: true,
        },
      });
      const { thumbPath, ...rest } = row;
      items.push({ ...rest, hasThumb: thumbPath !== null });
    }
    return reply.status(201).send({ items });
  });

  async function readable(id: string, user: SessionUser) {
    const a = await app.db.attachment.findUnique({ where: { id } });
    if (!a || a.deletedAt) throw new HttpError(404, 'not_found');
    if (!(await ownerAllows(db, user, a.ownerType, a.ownerId, false)))
      throw new HttpError(404, 'not_found');
    return a;
  }

  for (const variant of ['file', 'thumb'] as const) {
    app.get(
      variant === 'file' ? '/:id' : '/:id/thumb',
      { preHandler: requireUser },
      async (req, reply) => {
        const { id } = parse(idParam, req.params);
        const a = await readable(id, req.user!);
        const rel = variant === 'file' ? a.storagePath : a.thumbPath;
        if (!rel) throw new HttpError(404, 'no_thumbnail');
        const full = resolveStored(opts.uploadDir, rel);
        const info = await stat(full).catch(() => null);
        if (!info) throw new HttpError(404, 'not_found');
        const download = (req.query as { download?: string }).download === '1';
        return (
          reply
            .header('content-type', variant === 'file' ? a.mimeType : 'image/webp')
            .header('content-length', info.size)
            .header('cache-control', 'private, max-age=3600')
            .header('x-content-type-options', 'nosniff')
            .header(
              'content-disposition',
              `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(a.fileName)}`,
            )
            // Let the browser show photos and PDFs, but nothing in them can run.
            .header(
              'content-security-policy',
              "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; object-src 'self'; sandbox",
            )
            .send(createReadStream(full))
        );
      },
    );
  }

  for (const [method, url, deleted] of [
    ['DELETE', '/:id', true],
    ['POST', '/:id/restore', false],
  ] as const) {
    app.route({
      method,
      url,
      preHandler: requireUser,
      handler: async (req) => {
        const { id } = parse(idParam, req.params);
        const a = await app.db.attachment.findUnique({ where: { id } });
        if (!a || !!a.deletedAt === deleted) throw new HttpError(404, 'not_found');
        if (!(await ownerAllows(db, req.user!, a.ownerType, a.ownerId, true)))
          throw new HttpError(403, 'forbidden');
        await app.db.attachment.update({
          where: { id },
          data: { deletedAt: deleted ? new Date() : null },
        });
        return { ok: true };
      },
    });
  }
};
