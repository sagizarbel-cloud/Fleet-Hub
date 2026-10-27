import type { FastifyPluginAsync } from 'fastify';
import { Prisma } from '@prisma/client';
import {
  LOOKUP_KINDS,
  lookupBody,
  lookupItemParams,
  lookupOrderBody,
  lookupParams,
  type LookupKind,
} from '@fleet-hub/shared';
import { HttpError, parse } from '../lib/http';
import { requireRole } from '../plugins/auth';

type Tx = Prisma.TransactionClient;
type Model = 'department' | 'location' | 'vehicleType' | 'fluidType' | 'receiptCategory';

/** The slice of a lookup model the generic list code uses. */
interface Delegate {
  findMany(args: object): Promise<{ id: string }[]>;
  findUnique(args: object): Promise<{ id: string } | null>;
  create(args: object): Promise<{ id: string }>;
  update(args: object): Promise<{ id: string }>;
  delete(args: object): Promise<unknown>;
}

const LISTS: Record<LookupKind, { model: Model; uses: string[] }> = {
  departments: { model: 'department', uses: ['vehicles'] },
  locations: { model: 'location', uses: ['vehicles', 'movesFrom', 'movesTo'] },
  vehicleTypes: { model: 'vehicleType', uses: ['vehicles'] },
  fluidTypes: { model: 'fluidType', uses: ['additions'] },
  receiptCategories: { model: 'receiptCategory', uses: ['documents'] },
};

const delegate = (tx: Tx, kind: LookupKind) => tx[LISTS[kind].model] as unknown as Delegate;
const orderBy = [{ sortOrder: 'asc' as const }, { nameEn: 'asc' as const }];

/** Each value with how many records use it, hidden ones included. */
async function list(tx: Tx, kind: LookupKind) {
  const { uses } = LISTS[kind];
  const rows = (await delegate(tx, kind).findMany({
    orderBy,
    include: { _count: { select: Object.fromEntries(uses.map((u) => [u, true])) } },
  })) as unknown as (Record<string, unknown> & { _count: Record<string, number> })[];
  return rows.map(({ _count, ...row }) => ({
    ...(row as { id: string; code: string }),
    ...row,
    inUse: Object.values(_count).reduce((a, b) => a + b, 0),
  }));
}

function duplicate(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')
    throw Object.assign(new HttpError(400, 'validation_failed'), {
      issues: [{ path: 'code', code: 'taken' }],
    });
  throw err;
}

/**
 * Settings lists (SPEC 5.9): departments, locations, vehicle types, fluid types and receipt
 * categories, in both languages. Editors and admins manage them (Sagi, 2026-10-27). A value in
 * use can be hidden, never deleted, so old records keep their names.
 */
export const settingsRoutes: FastifyPluginAsync = async (app) => {
  const editor = { preHandler: requireRole('EDITOR') };
  const tx = app.db as unknown as Tx;

  app.get('/lookups', editor, async () => {
    const entries = await Promise.all(LOOKUP_KINDS.map(async (k) => [k, await list(tx, k)]));
    return Object.fromEntries(entries) as Record<LookupKind, unknown[]>;
  });

  app.post('/lookups/:kind', editor, async (req, reply) => {
    const { kind } = parse(lookupParams, req.params);
    const body = parse(lookupBody, req.body);
    const { category, usageUnit, ...rest } = body;
    if (kind === 'vehicleTypes' && (!category || !usageUnit))
      throw Object.assign(new HttpError(400, 'validation_failed'), {
        issues: [{ path: category ? 'usageUnit' : 'category', code: 'required' }],
      });
    const last = (await delegate(tx, kind).findMany({
      orderBy: { sortOrder: 'desc' },
      take: 1,
      select: { sortOrder: true },
    })) as unknown as { sortOrder: number }[];
    const data = {
      ...rest,
      sortOrder: (last[0]?.sortOrder ?? 0) + 1,
      ...(kind === 'vehicleTypes' ? { category, usageUnit } : {}),
    };
    const row = await delegate(tx, kind).create({ data }).catch(duplicate);
    void reply.status(201);
    return row;
  });

  app.put('/lookups/:kind/:id', editor, async (req) => {
    const { kind, id } = parse(lookupItemParams, req.params);
    const { category, usageUnit, code, ...rest } = parse(lookupBody, req.body);
    const current = (await delegate(tx, kind).findUnique({ where: { id } })) as
      (Record<string, unknown> & { id: string; code: string }) | null;
    if (!current) throw new HttpError(404, 'not_found');
    // A code is what imports, exports and drawings refer to: it stays fixed once in use.
    const uses = (await list(tx, kind)).find((r) => r.id === id)?.inUse ?? 0;
    if (code !== current.code && uses > 0)
      throw Object.assign(new HttpError(400, 'validation_failed'), {
        issues: [{ path: 'code', code: 'inUse' }],
      });
    return delegate(tx, kind)
      .update({
        where: { id },
        data: {
          ...rest,
          code,
          ...(kind === 'vehicleTypes' && category ? { category } : {}),
          ...(kind === 'vehicleTypes' && usageUnit ? { usageUnit } : {}),
        },
      })
      .catch(duplicate);
  });

  app.put('/lookups/:kind/order', editor, async (req) => {
    const { kind } = parse(lookupParams, req.params);
    const { ids } = parse(lookupOrderBody, req.body);
    await app.db.$transaction(async (t) => {
      for (const [i, id] of ids.entries())
        await delegate(t, kind)
          .update({ where: { id }, data: { sortOrder: i + 1 } })
          .catch(() => {
            throw new HttpError(404, 'not_found');
          });
    });
    return { ok: true };
  });

  app.delete('/lookups/:kind/:id', editor, async (req) => {
    const { kind, id } = parse(lookupItemParams, req.params);
    const row = (await list(tx, kind)).find((r) => r.id === id);
    if (!row) throw new HttpError(404, 'not_found');
    if (row.inUse > 0) throw new HttpError(409, 'in_use');
    await delegate(tx, kind).delete({ where: { id } });
    return { ok: true };
  });
};
