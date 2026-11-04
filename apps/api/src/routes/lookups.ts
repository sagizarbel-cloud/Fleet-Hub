import type { FastifyPluginAsync } from 'fastify';
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
      app.db.user.findMany({ where: { active: true }, select: { name: true }, orderBy: { name: 'asc' } }),
      app.db.supplier.findMany({ select: { name: true }, orderBy: { name: 'asc' } }),
    ]);
    const uniq = (...lists: string[][]) => [...new Set(lists.flat().filter(Boolean))];
    return {
      place: uniq(places.map((r) => r.place!)),
      fueledBy: uniq(fueledBy.map((r) => r.fueledBy!), users.map((u) => u.name)),
      provider: uniq(providers.map((r) => r.provider!), suppliers.map((s) => s.name)),
    };
  });
};
