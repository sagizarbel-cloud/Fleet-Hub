import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { EVENT_TYPES, type SessionUser } from '@fleet-hub/shared';
import { HttpError } from './http';
import { visibleQuotesWhere } from './quote-visibility';

export const eventsQuery = z.object({
  cursor: z.string().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(60),
  types: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(',') : undefined))
    .pipe(z.array(z.enum(EVENT_TYPES)).optional()),
  vehicle: z.string().max(40).optional(),
});
export type EventsQuery = z.infer<typeof eventsQuery>;

// Cursor = "<occurredAt ISO>|<id>": stable newest-first paging even when times tie.
function decodeCursor(cursor: string) {
  const [at, id] = cursor.split('|');
  const date = new Date(at ?? '');
  if (!id || Number.isNaN(date.getTime())) throw new HttpError(400, 'bad_cursor');
  return { date, id };
}

/** One page of the event log, newest first, hiding QUOTE_LINKED events for quotes the user can't see. */
export async function listEvents(app: FastifyInstance, user: SessionUser, q: EventsQuery) {
  // Entries of deleted records stay hidden until Undo.
  const and: Prisma.EventWhereInput[] = [{ hiddenAt: null }];

  if (q.types) and.push({ type: { in: q.types } });
  if (q.vehicle) and.push({ vehicle: { serial: q.vehicle } });
  if (q.cursor) {
    const c = decodeCursor(q.cursor);
    and.push({ OR: [{ occurredAt: { lt: c.date } }, { occurredAt: c.date, id: { lt: c.id } }] });
  }
  if (user.role !== 'ADMIN') {
    const visible = await app.db.quote.findMany({
      where: visibleQuotesWhere(user),
      select: { id: true },
    });
    and.push({
      OR: [{ type: { not: 'QUOTE_LINKED' } }, { sourceId: { in: visible.map((v) => v.id) } }],
    });
  }

  const rows = await app.db.event.findMany({
    where: { AND: and },
    orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
    take: q.limit + 1,
    select: {
      id: true,
      type: true,
      occurredAt: true,
      params: true,
      sourceType: true,
      sourceId: true,
      vehicle: { select: { serial: true, type: { select: { code: true } } } },
    },
  });
  const hasMore = rows.length > q.limit;
  const items = (hasMore ? rows.slice(0, q.limit) : rows).map(({ vehicle, ...e }) => ({
    ...e,
    vehicle: { serial: vehicle.serial, type: vehicle.type.code },
  }));
  const last = items.at(-1);
  return {
    items,
    nextCursor: hasMore && last ? `${last.occurredAt.toISOString()}|${last.id}` : null,
  };
}
