import type { FastifyPluginAsync } from 'fastify';
import { requireUser } from '../plugins/auth';

const select = { id: true, code: true, nameEn: true, nameHe: true } as const;
const where = { active: true } as const;
const orderBy = [{ sortOrder: 'asc' as const }, { nameEn: 'asc' as const }];

/** All bilingual lookup lists in one request. */
export const lookupRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { preHandler: requireUser }, async () => {
    const [departments, locations, vehicleTypes, fluidTypes, receiptCategories] = await Promise.all(
      [
        app.db.department.findMany({ where, select, orderBy }),
        app.db.location.findMany({ where, select, orderBy }),
        app.db.vehicleType.findMany({
          where,
          select: { ...select, category: true, usageUnit: true },
          orderBy,
        }),
        app.db.fluidType.findMany({ where, select, orderBy }),
        app.db.receiptCategory.findMany({ where, select, orderBy }),
      ],
    );
    return { departments, locations, vehicleTypes, fluidTypes, receiptCategories };
  });
};
