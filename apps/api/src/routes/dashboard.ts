import type { FastifyPluginAsync } from 'fastify';
import { requireUser } from '../plugins/auth';
import { startOfMonth } from '../lib/time';
import { listEvents } from '../lib/events';

const DUE_WINDOW_DAYS = 30;
const RECENT_EVENTS = 60;

/** Everything the home screen needs in one request: KPIs, the fleet grid tiles and the first timeline page. */
export const dashboardRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { preHandler: requireUser }, async (req) => {
    const now = new Date();
    const dueBy = new Date(now.getTime() + DUE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const openMalfunction = { state: { not: 'RESOLVED' as const }, deletedAt: null };

    const [
      byStatus,
      serviceDue,
      annualTestDue,
      insuranceDue,
      openMalfunctions,
      spend,
      tiles,
      recent,
    ] = await Promise.all([
      app.db.vehicle.groupBy({ by: ['status'], _count: true }),
      app.db.vehicle.count({ where: { nextServiceDate: { lte: dueBy } } }),
      app.db.vehicle.count({ where: { annualTestExpiry: { lte: dueBy } } }),
      app.db.vehicle.count({ where: { insuranceExpiry: { lte: dueBy } } }),
      app.db.malfunction.count({ where: openMalfunction }),
      app.db.document.aggregate({
        _sum: { amount: true },
        where: { deletedAt: null, date: { gte: startOfMonth(now), lte: now } },
      }),
      app.db.vehicle.findMany({
        // Never select startCodeEnc here.
        select: {
          serial: true,
          status: true,
          make: true,
          model: true,
          nextServiceDate: true,
          type: { select: { code: true, category: true } },
          department: { select: { code: true } },
          location: { select: { code: true } },
          _count: { select: { malfunctions: { where: openMalfunction } } },
        },
        orderBy: { serial: 'asc' },
      }),
      listEvents(app, req.user!, { limit: RECENT_EVENTS }),
    ]);

    const statusCounts = { GREEN: 0, AMBER: 0, RED: 0 };
    for (const row of byStatus) statusCounts[row.status] = row._count;

    return {
      kpis: {
        status: statusCounts,
        dueWithin30Days: {
          service: serviceDue,
          annualTest: annualTestDue,
          insurance: insuranceDue,
          total: serviceDue + annualTestDue + insuranceDue,
        },
        openMalfunctions,
        spendThisMonth: spend._sum.amount?.toNumber() ?? 0,
      },
      tiles: tiles.map(({ _count, type, department, location, ...v }) => ({
        ...v,
        type: type.code,
        category: type.category,
        department: department?.code ?? null,
        location: location?.code ?? null,
        openIssues: _count.malfunctions,
      })),
      recent,
    };
  });
};
