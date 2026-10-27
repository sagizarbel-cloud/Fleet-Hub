import type { FastifyPluginAsync } from 'fastify';
import type { Prisma } from '@prisma/client';
import {
  canSetQuoteStatus,
  compareQuery,
  idParam,
  QUOTE_NEXT,
  quoteBody,
  quoteStatusBody,
  quotesQuery,
  quoteVehiclesBody,
  quoteVisibilityBody,
  type SessionUser,
} from '@fleet-hub/shared';
import { HttpError, parse } from '../lib/http';
import { canEditQuote, QUOTE_EVENTS, visibleQuotesWhere } from '../lib/quote-visibility';
import { attachmentsFor, EXPORT_LIMIT } from '../lib/records';
import { requireUser } from '../plugins/auth';

type Tx = Prisma.TransactionClient;
const DAY_MS = 86_400_000;
const SOURCE = 'Quote';

const quoteSelect = {
  id: true,
  date: true,
  validUntil: true,
  status: true,
  visibility: true,
  notes: true,
  createdById: true,
  createdAt: true,
  supplier: { select: { id: true, name: true } },
  createdBy: { select: { name: true } },
  lines: {
    select: {
      id: true,
      item: true,
      partNo: true,
      condition: true,
      quantity: true,
      unitPrice: true,
    },
    orderBy: { sortOrder: 'asc' },
  },
  vehicles: {
    select: { vehicle: { select: { id: true, serial: true, type: { select: { code: true } } } } },
    orderBy: { vehicle: { serial: 'asc' } },
  },
} satisfies Prisma.QuoteSelect;
type QuoteRow = Prisma.QuoteGetPayload<{ select: typeof quoteSelect }>;

/** A part's key for comparing: its part no., or its name when it has none. */
export const partKey = (l: { item: string; partNo: string | null }) =>
  (l.partNo ? `#${l.partNo}` : l.item).trim().toLowerCase();

async function serialize(tx: Tx, user: SessionUser, rows: QuoteRow[]) {
  const files = await attachmentsFor(
    tx,
    SOURCE,
    rows.map((r) => r.id),
  );
  const now = Date.now();
  return rows.map(({ supplier, createdBy, lines, vehicles, ...q }) => {
    const items = lines.map((l) => ({
      ...l,
      unitPrice: l.unitPrice.toNumber(),
      total: l.quantity * l.unitPrice.toNumber(),
    }));
    return {
      ...q,
      supplier,
      createdBy: createdBy.name,
      mine: q.createdById === user.id,
      canEdit: canEditQuote(user, q),
      expired: !!q.validUntil && q.validUntil.getTime() + DAY_MS <= now,
      lines: items,
      total: items.reduce((sum, l) => sum + l.total, 0),
      vehicles: vehicles.map((v) => ({ serial: v.vehicle.serial, type: v.vehicle.type.code })),
      attachments: files.get(q.id) ?? [],
    };
  });
}

/**
 * Price quotes (SPEC 5.6). Every read goes through visibleQuotesWhere, so a quote the user
 * can't see is "not found" on every route. Linking and unlinking a vehicle logs an Event on it.
 */
export const quoteRoutes: FastifyPluginAsync = async (app) => {
  const db = app.db as unknown as Tx;

  /** A quote the user can see, or 404. */
  async function visible(tx: Tx, user: SessionUser, id: string) {
    const row = await tx.quote.findFirst({
      where: { AND: [visibleQuotesWhere(user), { id }] },
      select: quoteSelect,
    });
    if (!row) throw new HttpError(404, 'not_found');
    return row;
  }
  async function editable(tx: Tx, user: SessionUser, id: string) {
    const row = await visible(tx, user, id);
    if (!canEditQuote(user, row)) throw new HttpError(403, 'forbidden');
    return row;
  }
  async function one(tx: Tx, user: SessionUser, id: string) {
    const [item] = await serialize(tx, user, [await visible(tx, user, id)]);
    return item!;
  }

  async function supplierId(tx: Tx, s: { id: string } | { name: string }) {
    if ('id' in s) {
      const row = await tx.supplier.findUnique({ where: { id: s.id }, select: { id: true } });
      if (!row) {
        const err = new HttpError(400, 'validation_failed');
        Object.assign(err, { issues: [{ path: 'supplier', code: 'unknown' }] });
        throw err;
      }
      return row.id;
    }
    const same = await tx.supplier.findFirst({
      where: { name: { equals: s.name, mode: 'insensitive' } },
      select: { id: true },
    });
    return same?.id ?? (await tx.supplier.create({ data: { name: s.name } })).id;
  }

  /** Links the quote to exactly these vehicles, logging QUOTE_LINKED / QUOTE_UNLINKED. */
  async function setVehicles(
    tx: Tx,
    user: SessionUser,
    quoteId: string,
    serials: string[],
    current: string[],
    supplier: string,
  ) {
    const rows = await tx.vehicle.findMany({
      where: { serial: { in: serials } },
      select: { id: true },
    });
    if (rows.length !== serials.length) throw new HttpError(404, 'vehicle_not_found');
    const ids = rows.map((r) => r.id);
    const added = ids.filter((v) => !current.includes(v));
    const removed = current.filter((v) => !ids.includes(v));
    if (removed.length)
      await tx.quoteVehicle.deleteMany({ where: { quoteId, vehicleId: { in: removed } } });
    if (added.length)
      await tx.quoteVehicle.createMany({
        data: added.map((vehicleId) => ({ quoteId, vehicleId })),
      });
    const now = new Date();
    const log = (type: 'QUOTE_LINKED' | 'QUOTE_UNLINKED', list: string[]) =>
      list.length
        ? tx.event.createMany({
            data: list.map((vehicleId) => ({
              vehicleId,
              userId: user.id,
              type,
              occurredAt: now,
              params: { supplier },
              sourceType: SOURCE,
              sourceId: quoteId,
            })),
          })
        : null;
    await log('QUOTE_LINKED', added);
    await log('QUOTE_UNLINKED', removed);
  }

  app.get('/', { preHandler: requireUser }, async (req) => {
    const q = parse(quotesQuery, req.query);
    const user = req.user!;
    const and: Prisma.QuoteWhereInput[] = [visibleQuotesWhere(user)];
    if (q.status) and.push({ status: q.status });
    if (q.supplier) and.push({ supplierId: q.supplier });
    if (q.visibility) and.push({ visibility: q.visibility });
    if (q.vehicle) and.push({ vehicles: { some: { vehicle: { serial: q.vehicle } } } });
    if (q.from) and.push({ date: { gte: q.from } });
    if (q.to) and.push({ date: { lt: new Date(q.to.getTime() + DAY_MS) } });
    if (q.q) {
      const has = { contains: q.q, mode: 'insensitive' as const };
      and.push({
        OR: [
          { supplier: { name: has } },
          { notes: has },
          { lines: { some: { OR: [{ item: has }, { partNo: has }] } } },
        ],
      });
    }
    const where = { AND: and };
    const take = q.all ? EXPORT_LIMIT : q.limit;
    const skip = q.all ? 0 : q.offset;
    const [rows, total] = await Promise.all([
      app.db.quote.findMany({
        where,
        select: quoteSelect,
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        skip,
        take,
      }),
      app.db.quote.count({ where }),
    ]);
    return {
      items: await serialize(db, user, rows),
      total,
      nextOffset: !q.all && skip + rows.length < total ? skip + rows.length : null,
    };
  });

  app.get('/suppliers', { preHandler: requireUser }, async () => ({
    items: await app.db.supplier.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  }));

  // The parts that appear in quotes the user can see, for the comparison picker.
  app.get('/parts', { preHandler: requireUser }, async (req) => {
    const lines = await app.db.quoteLine.findMany({
      where: { quote: visibleQuotesWhere(req.user!) },
      select: { item: true, partNo: true, quoteId: true },
    });
    const parts = new Map<string, { item: string; partNo: string | null; quotes: Set<string> }>();
    for (const l of lines) {
      const key = partKey(l);
      const part = parts.get(key) ?? { item: l.item, partNo: l.partNo, quotes: new Set() };
      part.quotes.add(l.quoteId);
      parts.set(key, part);
    }
    return {
      items: [...parts]
        .map(([key, p]) => ({ key, item: p.item, partNo: p.partNo, quotes: p.quotes.size }))
        .sort((a, b) => b.quotes - a.quotes || a.item.localeCompare(b.item)),
    };
  });

  app.get('/compare', { preHandler: requireUser }, async (req) => {
    const q = parse(compareQuery, req.query);
    const user = req.user!;
    if ('ids' in q) {
      const rows = await app.db.quote.findMany({
        where: { AND: [visibleQuotesWhere(user), { id: { in: q.ids } }] },
        select: quoteSelect,
      });
      // Asking for a quote you can't see reveals nothing: the whole comparison is "not found".
      if (rows.length !== q.ids.length) throw new HttpError(404, 'not_found');
      const order = new Map(q.ids.map((id, i) => [id, i]));
      rows.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
      return { quotes: await serialize(db, user, rows) };
    }
    const key = q.part.toLowerCase();
    const byNo = key.startsWith('#') ? key.slice(1) : null;
    const rows = await app.db.quoteLine.findMany({
      where: {
        quote: visibleQuotesWhere(user),
        ...(byNo
          ? { partNo: { equals: byNo, mode: 'insensitive' } }
          : { partNo: null, item: { equals: q.part, mode: 'insensitive' } }),
      },
      select: {
        id: true,
        item: true,
        partNo: true,
        condition: true,
        quantity: true,
        unitPrice: true,
        quote: {
          select: {
            id: true,
            date: true,
            validUntil: true,
            status: true,
            visibility: true,
            supplier: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { unitPrice: 'asc' },
    });
    const now = Date.now();
    return {
      lines: rows.map(({ unitPrice, quote, ...l }) => ({
        ...l,
        unitPrice: unitPrice.toNumber(),
        quote: {
          ...quote,
          expired: !!quote.validUntil && quote.validUntil.getTime() + DAY_MS <= now,
        },
      })),
    };
  });

  app.get('/:id', { preHandler: requireUser }, async (req) => {
    const { id } = parse(idParam, req.params);
    return one(db, req.user!, id);
  });

  app.post('/', { preHandler: requireUser }, async (req, reply) => {
    const input = parse(quoteBody, req.body);
    const user = req.user!;
    if (input.visibility && input.visibility !== 'STANDARD' && user.role !== 'ADMIN')
      throw new HttpError(403, 'forbidden');
    const item = await app.db.$transaction(async (tx) => {
      const quote = await tx.quote.create({
        data: {
          supplierId: await supplierId(tx, input.supplier),
          date: input.date,
          validUntil: input.validUntil,
          notes: input.notes,
          visibility: input.visibility ?? 'STANDARD',
          createdById: user.id,
          lines: { create: input.lines.map((l, sortOrder) => ({ ...l, sortOrder })) },
        },
        select: { id: true, supplier: { select: { name: true } } },
      });
      await setVehicles(tx, user, quote.id, input.vehicles, [], quote.supplier.name);
      return one(tx, user, quote.id);
    });
    return reply.status(201).send(item);
  });

  app.put('/:id', { preHandler: requireUser }, async (req) => {
    const { id } = parse(idParam, req.params);
    const input = parse(quoteBody, req.body);
    const user = req.user!;
    return app.db.$transaction(async (tx) => {
      const before = await editable(tx, user, id);
      if (input.visibility && input.visibility !== before.visibility && user.role !== 'ADMIN')
        throw new HttpError(403, 'forbidden');
      const quote = await tx.quote.update({
        where: { id },
        data: {
          supplierId: await supplierId(tx, input.supplier),
          date: input.date,
          validUntil: input.validUntil,
          notes: input.notes,
          ...(input.visibility ? { visibility: input.visibility } : {}),
          lines: {
            deleteMany: {},
            create: input.lines.map((l, sortOrder) => ({ ...l, sortOrder })),
          },
        },
        select: { supplier: { select: { name: true } } },
      });
      await setVehicles(
        tx,
        user,
        id,
        input.vehicles,
        before.vehicles.map((v) => v.vehicle.id),
        quote.supplier.name,
      );
      return one(tx, user, id);
    });
  });

  app.put('/:id/vehicles', { preHandler: requireUser }, async (req) => {
    const { id } = parse(idParam, req.params);
    const { vehicles } = parse(quoteVehiclesBody, req.body);
    const user = req.user!;
    return app.db.$transaction(async (tx) => {
      const before = await editable(tx, user, id);
      await setVehicles(
        tx,
        user,
        id,
        vehicles,
        before.vehicles.map((v) => v.vehicle.id),
        before.supplier.name,
      );
      return one(tx, user, id);
    });
  });

  app.post('/:id/status', { preHandler: requireUser }, async (req) => {
    const { id } = parse(idParam, req.params);
    const { status } = parse(quoteStatusBody, req.body);
    const user = req.user!;
    return app.db.$transaction(async (tx) => {
      const before = await editable(tx, user, id);
      if (!QUOTE_NEXT[before.status].includes(status))
        throw new HttpError(409, 'invalid_transition');
      if (!canSetQuoteStatus(user.role, status)) throw new HttpError(403, 'forbidden');
      await tx.quote.update({ where: { id }, data: { status } });
      return one(tx, user, id);
    });
  });

  // Only admins change who can see a quote.
  app.put('/:id/visibility', { preHandler: requireUser }, async (req) => {
    const { id } = parse(idParam, req.params);
    const { visibility } = parse(quoteVisibilityBody, req.body);
    const user = req.user!;
    await visible(db, user, id);
    if (user.role !== 'ADMIN') throw new HttpError(403, 'forbidden');
    await app.db.quote.update({ where: { id }, data: { visibility } });
    return one(db, user, id);
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
          const q = await tx.quote.findUnique({
            where: { id },
            select: { createdById: true, visibility: true, deletedAt: true },
          });
          // Restore looks past the deleted mark; everything else must be visible to the user.
          const seen =
            q && (user.role === 'ADMIN' || q.visibility === 'PUBLIC' || q.createdById === user.id);
          if (!q || !seen || !!q.deletedAt === deleted) throw new HttpError(404, 'not_found');
          if (!canEditQuote(user, q)) throw new HttpError(403, 'forbidden');
          const now = new Date();
          await tx.quote.update({ where: { id }, data: { deletedAt: deleted ? now : null } });
          // The vehicles' "quote linked" entries go and come back with the quote.
          await tx.event.updateMany({
            where: { sourceType: SOURCE, sourceId: id, type: { in: [...QUOTE_EVENTS] } },
            data: { hiddenAt: deleted ? now : null },
          });
          return { ok: true };
        });
      },
    });
  }
};
