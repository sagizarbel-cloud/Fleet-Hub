import type { FastifyPluginAsync } from 'fastify';
import type { Prisma } from '@prisma/client';
import {
  hasRole,
  idParam,
  receiptBody,
  receiptsQuery,
  reviewBody,
  type SessionUser,
} from '@fleet-hub/shared';
import { HttpError, parse } from '../lib/http';
import { canChangeReceipt, checkLinked, receiptSelect, serializeReceipts } from '../lib/receipts';
import { EXPORT_LIMIT } from '../lib/records';
import { requireUser } from '../plugins/auth';

type Tx = Prisma.TransactionClient;
const DAY_MS = 86_400_000;
const SOURCE = 'Document';

const monthKey = (d: Date) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

async function vehicleIds(tx: Tx, serials: string[]) {
  const rows = await tx.vehicle.findMany({
    where: { serial: { in: serials } },
    select: { id: true, serial: true },
  });
  if (rows.length !== serials.length) throw new HttpError(404, 'vehicle_not_found');
  return rows.map((r) => r.id);
}

async function categoryId(tx: Tx, code: string | null) {
  if (!code) return null;
  const row = await tx.receiptCategory.findUnique({ where: { code }, select: { id: true } });
  if (!row) {
    const err = new HttpError(400, 'validation_failed');
    Object.assign(err, { issues: [{ path: 'category', code: 'unknown' }] });
    throw err;
  }
  return row.id;
}

const params = (doc: { amount: Prisma.Decimal | null; category: { code: string } | null }) => ({
  category: doc.category?.code ?? null,
  amount: doc.amount?.toNumber() ?? null,
});

/**
 * The receipts hub (SPEC 5.5). Anyone can add a receipt; a viewer's waits as "suggested"
 * until an editor or admin approves it, and counts in no totals until then. Every write
 * logs an Event on each tagged vehicle; a suggested receipt's entry stays hidden until approved.
 */
export const receiptRoutes: FastifyPluginAsync = async (app) => {
  async function load(tx: Tx, id: string) {
    const row = await tx.document.findUnique({ where: { id }, select: receiptSelect });
    if (!row) throw new HttpError(404, 'not_found');
    return row;
  }
  async function one(tx: Tx, user: SessionUser, id: string) {
    const [item] = await serializeReceipts(tx, user, [await load(tx, id)]);
    return item!;
  }
  const event = (
    tx: Tx,
    user: SessionUser,
    docId: string,
    vehicleIds: string[],
    data: { type: 'DOCUMENT_ADDED' | 'RECORD_EDITED' | 'RECORD_DELETED' | 'RECORD_RESTORED' },
    p: Prisma.InputJsonObject,
    at: Date,
    hidden = false,
  ) =>
    tx.event.createMany({
      data: vehicleIds.map((vehicleId) => ({
        vehicleId,
        userId: user.id,
        sourceType: SOURCE,
        sourceId: docId,
        type: data.type,
        occurredAt: at,
        params: p,
        hiddenAt: hidden ? at : null,
      })),
    });
  const changeParams = (p: Prisma.InputJsonObject) => ({
    kind: 'receipt',
    of: 'DOCUMENT_ADDED',
    ...p,
  });

  app.get('/', { preHandler: requireUser }, async (req) => {
    const q = parse(receiptsQuery, req.query);
    const user = req.user!;
    const and: Prisma.DocumentWhereInput[] = [{ deletedAt: null }];
    if (q.vehicle) and.push({ vehicles: { some: { vehicle: { serial: q.vehicle } } } });
    if (q.category) and.push({ category: { code: q.category } });
    if (q.state) and.push({ approvedAt: q.state === 'approved' ? { not: null } : null });
    if (q.from) and.push({ date: { gte: q.from } });
    if (q.to) and.push({ date: { lt: new Date(q.to.getTime() + DAY_MS) } });
    if (q.min !== undefined) and.push({ amount: { gte: q.min } });
    if (q.max !== undefined) and.push({ amount: { lte: q.max } });
    if (q.q)
      and.push({
        OR: [
          { vendor: { contains: q.q, mode: 'insensitive' } },
          { notes: { contains: q.q, mode: 'insensitive' } },
        ],
      });
    const where = { AND: and };
    const take = q.all ? EXPORT_LIMIT : q.limit;
    const skip = q.all ? 0 : q.offset;
    const [rows, total, sums] = await Promise.all([
      app.db.document.findMany({
        where,
        select: receiptSelect,
        orderBy: [
          q.sort === 'date' ? { date: q.dir } : { [q.sort]: { sort: q.dir, nulls: 'last' } },
          { date: 'desc' },
          { id: 'desc' },
        ],
        skip,
        take,
      }),
      app.db.document.count({ where }),
      // Totals over every match, not just this page. Suggested receipts don't count.
      app.db.document.findMany({
        where: { AND: [...and, { approvedAt: { not: null } }, { amount: { not: null } }] },
        select: {
          amount: true,
          date: true,
          vehicles: { select: { vehicle: { select: { serial: true } } } },
        },
      }),
    ]);
    const byVehicle = new Map<string, number>();
    const byMonth = new Map<string, number>();
    let sum = 0;
    for (const r of sums) {
      const amount = r.amount!.toNumber();
      sum += amount;
      byMonth.set(monthKey(r.date), (byMonth.get(monthKey(r.date)) ?? 0) + amount);
      // Split evenly between the vehicles it is tagged to; the overall total counts it once.
      for (const v of r.vehicles) {
        const s = v.vehicle.serial;
        byVehicle.set(s, (byVehicle.get(s) ?? 0) + amount / r.vehicles.length);
      }
    }
    const round = (n: number) => Math.round(n * 100) / 100;
    const suggested = await app.db.document.count({
      where: { deletedAt: null, approvedAt: null },
    });
    return {
      items: await serializeReceipts(app.db as unknown as Tx, user, rows),
      total,
      nextOffset: !q.all && skip + rows.length < total ? skip + rows.length : null,
      totals: {
        sum: round(sum),
        count: sums.length,
        byVehicle: [...byVehicle]
          .map(([serial, amount]) => ({ serial, amount: round(amount) }))
          .sort((a, b) => b.amount - a.amount),
        byMonth: [...byMonth]
          .map(([month, amount]) => ({ month, amount: round(amount) }))
          .sort((a, b) => a.month.localeCompare(b.month)),
      },
      suggested,
    };
  });

  app.get('/:id', { preHandler: requireUser }, async (req) => {
    const { id } = parse(idParam, req.params);
    const row = await load(app.db as unknown as Tx, id);
    if (row.deletedAt) throw new HttpError(404, 'not_found');
    const [item] = await serializeReceipts(app.db as unknown as Tx, req.user!, [row]);
    return item;
  });

  app.post('/', { preHandler: requireUser }, async (req, reply) => {
    const input = parse(receiptBody, req.body);
    const user = req.user!;
    const approved = hasRole(user.role, 'EDITOR');
    const item = await app.db.$transaction(async (tx) => {
      const ids = await vehicleIds(tx, input.vehicles);
      const now = new Date();
      const doc = await tx.document.create({
        data: {
          kind: input.kind,
          date: input.date,
          vendor: input.vendor,
          amount: input.amount,
          notes: input.notes,
          categoryId: await categoryId(tx, input.category),
          ...(await checkLinked(tx, input.linked, ids)),
          createdById: user.id,
          approvedAt: approved ? now : null,
          approvedById: approved ? user.id : null,
          vehicles: { create: ids.map((vehicleId) => ({ vehicleId })) },
        },
        select: { id: true, date: true, amount: true, category: { select: { code: true } } },
      });
      await event(
        tx,
        user,
        doc.id,
        ids,
        { type: 'DOCUMENT_ADDED' },
        params(doc),
        doc.date,
        !approved,
      );
      return one(tx, user, doc.id);
    });
    return reply.status(201).send(item);
  });

  app.put('/:id', { preHandler: requireUser }, async (req) => {
    const { id } = parse(idParam, req.params);
    const input = parse(receiptBody, req.body);
    const user = req.user!;
    return app.db.$transaction(async (tx) => {
      const before = await tx.document.findUnique({
        where: { id },
        select: { createdById: true, approvedAt: true, deletedAt: true, vehicles: true },
      });
      if (!before || before.deletedAt) throw new HttpError(404, 'not_found');
      if (!canChangeReceipt(user, before)) throw new HttpError(403, 'forbidden');
      const ids = await vehicleIds(tx, input.vehicles);
      const old = before.vehicles.map((v) => v.vehicleId);
      const added = ids.filter((v) => !old.includes(v));
      const removed = old.filter((v) => !ids.includes(v));

      const doc = await tx.document.update({
        where: { id },
        data: {
          kind: input.kind,
          date: input.date,
          vendor: input.vendor,
          amount: input.amount,
          notes: input.notes,
          categoryId: await categoryId(tx, input.category),
          ...(await checkLinked(tx, input.linked, ids)),
          vehicles: {
            deleteMany: removed.length ? { vehicleId: { in: removed } } : [],
            create: added.map((vehicleId) => ({ vehicleId })),
          },
        },
        select: { id: true, date: true, amount: true, category: { select: { code: true } } },
      });
      const p = params(doc);
      const hidden = !before.approvedAt;
      const now = new Date();
      // Each vehicle's own entry follows the edit; vehicles taken off the receipt lose it.
      await tx.event.updateMany({
        where: { sourceType: SOURCE, sourceId: id, type: 'DOCUMENT_ADDED' },
        data: { occurredAt: doc.date, params: p },
      });
      if (removed.length)
        await tx.event.updateMany({
          where: { sourceType: SOURCE, sourceId: id, vehicleId: { in: removed } },
          data: { hiddenAt: now },
        });
      if (added.length)
        await event(tx, user, id, added, { type: 'DOCUMENT_ADDED' }, p, doc.date, hidden);
      const kept = ids.filter((v) => !added.includes(v));
      if (kept.length && !hidden)
        await event(tx, user, id, kept, { type: 'RECORD_EDITED' }, changeParams(p), now);
      return one(tx, user, id);
    });
  });

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
        const user = req.user!;
        return app.db.$transaction(async (tx) => {
          const doc = await tx.document.findUnique({
            where: { id },
            select: {
              createdById: true,
              approvedAt: true,
              deletedAt: true,
              amount: true,
              category: { select: { code: true } },
              vehicles: { select: { vehicleId: true } },
            },
          });
          if (!doc) throw new HttpError(404, 'not_found');
          if (!canChangeReceipt(user, doc)) throw new HttpError(403, 'forbidden');
          if (!!doc.deletedAt === deleted)
            throw new HttpError(409, deleted ? 'already_deleted' : 'not_deleted');
          const now = new Date();
          await tx.document.update({ where: { id }, data: { deletedAt: deleted ? now : null } });
          // A suggested receipt never showed on the timeline, so it leaves no trace there.
          if (!doc.approvedAt) return { ok: true };
          const ids = doc.vehicles.map((v) => v.vehicleId);
          await tx.event.updateMany({
            where: {
              sourceType: SOURCE,
              sourceId: id,
              vehicleId: { in: ids },
              ...(deleted
                ? { hiddenAt: null }
                : { type: { notIn: ['RECORD_DELETED', 'RECORD_RESTORED'] } }),
            },
            data: { hiddenAt: deleted ? now : null },
          });
          await event(
            tx,
            user,
            id,
            ids,
            { type: deleted ? 'RECORD_DELETED' : 'RECORD_RESTORED' },
            changeParams(params(doc)),
            now,
          );
          return { ok: true };
        });
      },
    });
  }

  // Editors and admins approve a suggested receipt, or reject it (it is deleted).
  app.post('/:id/review', { preHandler: requireUser }, async (req) => {
    const { id } = parse(idParam, req.params);
    const { approve } = parse(reviewBody, req.body);
    const user = req.user!;
    if (!hasRole(user.role, 'EDITOR')) throw new HttpError(403, 'forbidden');
    return app.db.$transaction(async (tx) => {
      const doc = await tx.document.findUnique({
        where: { id },
        select: { approvedAt: true, deletedAt: true, vehicles: { select: { vehicleId: true } } },
      });
      if (!doc || doc.deletedAt) throw new HttpError(404, 'not_found');
      if (doc.approvedAt) throw new HttpError(409, 'already_approved');
      const now = new Date();
      if (!approve) {
        await tx.document.update({ where: { id }, data: { deletedAt: now } });
        return { ok: true };
      }
      await tx.document.update({ where: { id }, data: { approvedAt: now, approvedById: user.id } });
      await tx.event.updateMany({
        where: {
          sourceType: SOURCE,
          sourceId: id,
          type: 'DOCUMENT_ADDED',
          vehicleId: { in: doc.vehicles.map((v) => v.vehicleId) },
        },
        data: { hiddenAt: null },
      });
      return one(tx, user, id);
    });
  });
};
