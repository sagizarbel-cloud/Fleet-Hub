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
          licenseNo: true,
          status: true,
          make: true,
          model: true,
          nextServiceDate: true,
          tool: true,
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

  /**
   * What falls due within 30 days, overdue included, one row per vehicle and kind (Revisions 1:
   * the "Due within 30 days" box opens it). Soonest first; the counts in the box match it.
   */
  app.get('/due', { preHandler: requireUser }, async () => {
    const dueBy = new Date(Date.now() + DUE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const rows = await app.db.vehicle.findMany({
      where: {
        OR: [
          { nextServiceDate: { lte: dueBy } },
          { annualTestExpiry: { lte: dueBy } },
          { insuranceExpiry: { lte: dueBy } },
        ],
      },
      // Never select startCodeEnc here.
      select: {
        serial: true,
        make: true,
        model: true,
        nextServiceDate: true,
        annualTestExpiry: true,
        insuranceExpiry: true,
      },
    });
    const kinds = [
      ['service', 'nextServiceDate'],
      ['annualTest', 'annualTestExpiry'],
      ['insurance', 'insuranceExpiry'],
    ] as const;
    return rows
      .flatMap((v) =>
        kinds
          .filter(([, field]) => v[field] && v[field] <= dueBy)
          .map(([kind, field]) => ({
            serial: v.serial,
            make: v.make,
            model: v.model,
            kind,
            date: v[field]!,
          })),
      )
      .sort((a, b) => a.date.getTime() - b.date.getTime() || a.serial.localeCompare(b.serial));
  });

  /**
   * This month's spend by vehicle (Revisions 1: the "Spent this month" box opens it). A receipt
   * tagged to several vehicles is split evenly, as in the cost totals; untagged ones come last.
   */
  app.get('/spend', { preHandler: requireUser }, async () => {
    const now = new Date();
    const docs = await app.db.document.findMany({
      where: { deletedAt: null, date: { gte: startOfMonth(now), lte: now }, amount: { not: null } },
      orderBy: [{ date: 'desc' }, { id: 'asc' }],
      select: {
        id: true,
        date: true,
        vendor: true,
        amount: true,
        category: { select: { nameEn: true, nameHe: true } },
        vehicles: { select: { vehicle: { select: { serial: true, make: true, model: true } } } },
      },
    });
    type Group = {
      serial: string | null;
      make: string | null;
      model: string | null;
      total: number;
      receipts: {
        id: string;
        date: Date;
        vendor: string | null;
        category: { nameEn: string; nameHe: string } | null;
        amount: number;
        share: number;
        vehicles: number;
      }[];
    };
    const groups = new Map<string, Group>();
    let total = 0;
    for (const d of docs) {
      const amount = d.amount!.toNumber();
      total += amount;
      const vehicles = d.vehicles.map((x) => x.vehicle);
      const share = vehicles.length ? amount / vehicles.length : amount;
      for (const v of vehicles.length ? vehicles : [null]) {
        const key = v?.serial ?? '';
        const g = groups.get(key) ?? {
          serial: v?.serial ?? null,
          make: v?.make ?? null,
          model: v?.model ?? null,
          total: 0,
          receipts: [],
        };
        g.total += share;
        g.receipts.push({
          id: d.id,
          date: d.date,
          vendor: d.vendor,
          category: d.category,
          amount,
          share,
          vehicles: vehicles.length,
        });
        groups.set(key, g);
      }
    }
    const vehicles = [...groups.values()].sort(
      (a, b) => Number(a.serial === null) - Number(b.serial === null) || b.total - a.total,
    );
    return { total, vehicles };
  });

  /** Every open or in-progress malfunction in the fleet, worst first (Revisions 1: the KPI opens it). */
  app.get('/open-malfunctions', { preHandler: requireUser }, async () => {
    const rows = await app.db.malfunction.findMany({
      where: { state: { not: 'RESOLVED' }, deletedAt: null },
      orderBy: [{ reportedAt: 'desc' }],
      take: 200,
      select: {
        id: true,
        reportedAt: true,
        severity: true,
        state: true,
        isAccident: true,
        description: true,
        vehicle: { select: { serial: true } },
      },
    });
    const rank = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 } as const;
    return rows
      .map(({ vehicle, ...m }) => ({ ...m, serial: vehicle.serial }))
      .sort((a, b) => rank[a.severity] - rank[b.severity]);
  });
};
