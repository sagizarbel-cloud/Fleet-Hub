import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { receiptCosts } from './receipts';
import { fuelEconomy } from './vehicle-detail';

const DAY_MS = 24 * 60 * 60 * 1000;
const ECONOMY_WINDOW_DAYS = 30;

/**
 * Fields the fleet table may return. Never add startCodeEnc or hasStartCode here: start codes
 * stay out of the fleet table, its search and its exports (SPEC A7).
 */
const tableSelect = {
  id: true,
  serial: true,
  vin: true,
  licenseNo: true,
  make: true,
  model: true,
  year: true,
  operatorName: true,
  odometerKm: true,
  engineHours: true,
  nextServiceKm: true,
  nextServiceHours: true,
  nextServiceDate: true,
  readinessPct: true,
  annualTestExpiry: true,
  insuranceExpiry: true,
  safetyCheckExpiry: true,
  status: true,
  statusOverride: true,
  purchaseDate: true,
  purchasePrice: true,
  warrantyExpiry: true,
  supplier: { select: { name: true } },
  type: { select: { code: true, category: true, usageUnit: true } },
  department: { select: { code: true } },
  location: { select: { code: true } },
  currentItems: { select: { name: true }, orderBy: { name: 'asc' } },
} satisfies Prisma.VehicleSelect;

type Sums = Map<string, number>;
const sums = (rows: { vehicleId: string; _sum: { cost: Prisma.Decimal | null } }[]): Sums =>
  new Map(rows.map((r) => [r.vehicleId, r._sum.cost?.toNumber() ?? 0]));
const add =
  (...maps: Sums[]) =>
  (id: string) =>
    maps.reduce((t, m) => t + (m.get(id) ?? 0), 0);

/**
 * One row per vehicle with every fleet-table column computed (SPEC 5.4). The fleet is tens of
 * vehicles, so the browser gets them all at once and searches, filters and sorts locally.
 */
export async function fleetTable(app: FastifyInstance, now = new Date()) {
  const db = app.db;
  const since = (days: number) => new Date(now.getTime() - days * DAY_MS);
  const y1 = since(365);
  const m3 = since(91);
  const live = { deletedAt: null };
  const costBy = (
    model: 'serviceRecord' | 'malfunction' | 'fuelEntry',
    dateField: string,
    from: Date,
  ) =>
    (db[model] as unknown as Prisma.ServiceRecordDelegate)
      .groupBy({
        by: ['vehicleId'],
        _sum: { cost: true },
        where: { ...live, [dateField]: { gte: from } },
      })
      .then(sums);

  const [
    vehicles,
    openIssues,
    lastEvents,
    lastServices,
    services12m,
    recentFuel,
    lastFuel,
    service12,
    repair12,
    fuel12,
    service3,
    repair3,
    fuel3,
    receipts12,
    receipts3,
  ] = await Promise.all([
    db.vehicle.findMany({ select: tableSelect, orderBy: { serial: 'asc' } }),
    db.malfunction.groupBy({
      by: ['vehicleId'],
      _count: true,
      where: { ...live, state: { not: 'RESOLVED' } },
    }),
    db.event.groupBy({ by: ['vehicleId'], _max: { occurredAt: true }, where: { hiddenAt: null } }),
    db.serviceRecord.groupBy({ by: ['vehicleId'], _max: { date: true }, where: live }),
    db.serviceRecord.groupBy({
      by: ['vehicleId'],
      _count: true,
      where: { ...live, date: { gte: y1 } },
    }),
    db.fuelEntry.findMany({
      where: { ...live, date: { gte: since(ECONOMY_WINDOW_DAYS) } },
      orderBy: { date: 'asc' },
      select: { vehicleId: true, liters: true, odometerKm: true, engineHours: true },
    }),
    db.fuelEntry.findMany({
      where: live,
      distinct: ['vehicleId'],
      orderBy: [{ vehicleId: 'asc' }, { date: 'desc' }],
      select: { vehicleId: true, date: true, liters: true },
    }),
    costBy('serviceRecord', 'date', y1),
    costBy('malfunction', 'reportedAt', y1),
    costBy('fuelEntry', 'date', y1),
    costBy('serviceRecord', 'date', m3),
    costBy('malfunction', 'reportedAt', m3),
    costBy('fuelEntry', 'date', m3),
    receiptCosts(db as unknown as Prisma.TransactionClient, y1),
    receiptCosts(db as unknown as Prisma.TransactionClient, m3),
  ]);

  const count = (rows: { vehicleId: string; _count: number }[]) =>
    new Map(rows.map((r) => [r.vehicleId, r._count]));
  const issues = count(openIssues);
  const serviceCounts = count(services12m);
  const activity = new Map(lastEvents.map((r) => [r.vehicleId, r._max.occurredAt]));
  const lastService = new Map(lastServices.map((r) => [r.vehicleId, r._max.date]));
  const fuelByVehicle = new Map<
    string,
    { liters: number; odometerKm: number | null; engineHours: number | null }[]
  >();
  for (const { vehicleId, liters, ...f } of recentFuel) {
    fuelByVehicle.set(vehicleId, [
      ...(fuelByVehicle.get(vehicleId) ?? []),
      { ...f, liters: liters.toNumber() },
    ]);
  }
  const lastFill = new Map(lastFuel.map((f) => [f.vehicleId, f]));
  const maint12 = add(service12, repair12);
  const maint3 = add(service3, repair3);

  return vehicles.map(
    ({ id, type, department, location, supplier, currentItems, purchasePrice, ...v }) => {
      const fill = lastFill.get(id);
      // Unlinked receipts join the costs (Sagi, 2026-10-27): see receiptCosts.
      const r12 = receipts12.get(id);
      const r3 = receipts3.get(id);
      const m12 = maint12(id) + (r12?.maintenance ?? 0);
      const f12 = (fuel12.get(id) ?? 0) + (r12?.fuel ?? 0);
      const m3c = maint3(id) + (r3?.maintenance ?? 0);
      const f3 = (fuel3.get(id) ?? 0) + (r3?.fuel ?? 0);
      return {
        ...v,
        purchasePrice: purchasePrice?.toNumber() ?? null,
        supplier: supplier?.name ?? null,
        type: type.code,
        category: type.category,
        usageUnit: type.usageUnit,
        department: department?.code ?? null,
        location: location?.code ?? null,
        items: currentItems.map((i) => i.name),
        openIssues: issues.get(id) ?? 0,
        lastActivity: activity.get(id) ?? null,
        lastService: lastService.get(id) ?? null,
        services12m: serviceCounts.get(id) ?? 0,
        economy30: fuelEconomy(fuelByVehicle.get(id) ?? [], type.usageUnit)?.value ?? null,
        lastFuel: fill ? { date: fill.date, liters: fill.liters.toNumber() } : null,
        costs: {
          maintenance12m: m12,
          fuel12m: f12,
          total12m: m12 + f12,
          maintenance3m: m3c,
          fuel3m: f3,
          total3m: m3c + f3,
        },
      };
    },
  );
}
