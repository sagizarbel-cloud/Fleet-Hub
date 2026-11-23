import type { FastifyPluginAsync } from 'fastify';
import type { Prisma } from '@prisma/client';
import { canEditCard, canEditField, quickLocationBody } from '@fleet-hub/shared';
import { readAppSettings } from '../lib/app-settings';
import { HttpError, parse } from '../lib/http';
import { requireUser } from '../plugins/auth';

const select = { id: true, code: true, nameEn: true, nameHe: true } as const;
const where = { active: true } as const;
const orderBy = [{ sortOrder: 'asc' as const }, { nameEn: 'asc' as const }];

/** All bilingual lookup lists in one request. */
export const lookupRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { preHandler: requireUser }, async () => {
    const [departments, locations, vehicleTypes, fluidTypes, fuelTypes, receiptCategories] =
      await Promise.all([
        app.db.department.findMany({ where, select, orderBy }),
        app.db.location.findMany({ where, select, orderBy }),
        app.db.vehicleType.findMany({
          where,
          select: { ...select, category: true, usageUnit: true },
          orderBy,
        }),
        app.db.fluidType.findMany({ where, select, orderBy }),
        app.db.fuelType.findMany({ where, select, orderBy }),
        app.db.receiptCategory.findMany({ where, select, orderBy }),
      ]);
    return { departments, locations, vehicleTypes, fluidTypes, fuelTypes, receiptCategories };
  });

  /**
   * Adds a place typed into a form (Sagi, 2026-11-23), for anyone who may set a vehicle's
   * location or record a location change. Both names start as typed; a place with that name in
   * either language is returned instead of a copy.
   */
  app.post('/locations', { preHandler: requireUser }, async (req, reply) => {
    const { name } = parse(quickLocationBody, req.body);
    const { permissions } = await readAppSettings(app.db as unknown as Prisma.TransactionClient);
    const role = req.user!.role;
    if (
      !canEditCard(role, permissions, 'movements') &&
      !canEditField(role, permissions, 'location')
    )
      throw new HttpError(403, 'forbidden');
    const same = { equals: name, mode: 'insensitive' as const };
    const found = await app.db.location.findFirst({
      where: { OR: [{ nameEn: same }, { nameHe: same }] },
      select,
    });
    if (found) {
      await app.db.location.update({ where: { id: found.id }, data: { active: true } });
      return found;
    }
    const slug =
      name
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^[^a-z]+/, '')
        .replace(/_+$/, '')
        .slice(0, 32) || `loc_${Date.now().toString(36)}`;
    const taken = new Set(
      (
        await app.db.location.findMany({
          where: { code: { startsWith: slug } },
          select: { code: true },
        })
      ).map((l) => l.code),
    );
    let code = slug;
    for (let n = 2; taken.has(code); n++) code = `${slug}_${n}`;
    const last = await app.db.location.aggregate({ _max: { sortOrder: true } });
    const row = await app.db.location.create({
      data: { code, nameEn: name, nameHe: name, sortOrder: (last._max.sortOrder ?? 0) + 1 },
      select,
    });
    reply.code(201);
    return row;
  });

  /**
   * Suggestions for the fuel form's typed fields (Revisions 1): what earlier entries used, plus
   * user names for "who fueled" and supplier names for "who provided". Newest first, 200 each.
   */
  app.get('/fuel-suggestions', { preHandler: requireUser }, async () => {
    const recent = (field: 'place' | 'fueledBy' | 'provider') =>
      app.db.fuelEntry.findMany({
        where: { deletedAt: null, [field]: { not: null } },
        distinct: [field],
        orderBy: { date: 'desc' },
        select: { [field]: true },
        take: 200,
      }) as Promise<Record<string, string>[]>;
    const [places, fueledBy, providers, users, suppliers] = await Promise.all([
      recent('place'),
      recent('fueledBy'),
      recent('provider'),
      app.db.user.findMany({
        where: { active: true },
        select: { name: true },
        orderBy: { name: 'asc' },
      }),
      app.db.supplier.findMany({ select: { name: true }, orderBy: { name: 'asc' } }),
    ]);
    const uniq = (...lists: string[][]) => [...new Set(lists.flat().filter(Boolean))];
    return {
      place: uniq(places.map((r) => r.place!)),
      fueledBy: uniq(
        fueledBy.map((r) => r.fueledBy!),
        users.map((u) => u.name),
      ),
      provider: uniq(
        providers.map((r) => r.provider!),
        suppliers.map((s) => s.name),
      ),
    };
  });
};
