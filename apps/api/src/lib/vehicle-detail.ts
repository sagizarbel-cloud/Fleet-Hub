import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import type { SessionUser } from '@fleet-hub/shared';
import { HttpError } from './http';
import { visibleQuotesWhere } from './quote-visibility';
import { startOfYear } from './time';

const DAY_MS = 24 * 60 * 60 * 1000;
const ECONOMY_WINDOW_DAYS = 30;

/** Fields the vehicle page may return. Never add startCodeEnc here: only the reveal endpoint decrypts it. */
const detailSelect = {
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
  hasStartCode: true,
  purchaseDate: true,
  warrantyExpiry: true,
  type: { select: { code: true, category: true, usageUnit: true } },
  department: { select: { code: true } },
  location: { select: { code: true } },
} satisfies Prisma.VehicleSelect;

interface FuelPoint {
  liters: number;
  odometerKm: number | null;
  engineHours: number | null;
}

/**
 * Fuel economy over a run of fill-ups, oldest first: km per litre by odometer, or litres per
 * engine hour. The first fill-up only sets the starting reading, so its litres are not counted.
 */
export function fuelEconomy(entries: FuelPoint[], unit: 'KM' | 'HOURS') {
  const reading = (e: FuelPoint) => (unit === 'KM' ? e.odometerKm : e.engineHours);
  const points = entries.filter((e) => reading(e) !== null);
  if (points.length < 2) return null;
  const distance = reading(points.at(-1)!)! - reading(points[0]!)!;
  const liters = points.slice(1).reduce((sum, e) => sum + e.liters, 0);
  if (distance <= 0 || liters <= 0) return null;
  const value = unit === 'KM' ? distance / liters : liters / distance;
  return { value: Math.round(value * 100) / 100, unit: unit === 'KM' ? 'KM_PER_L' : 'L_PER_HOUR' };
}

/** Everything the vehicle page needs except its activity feed, which pages through /api/events. */
export async function vehicleDetail(app: FastifyInstance, user: SessionUser, serial: string) {
  const vehicle = await app.db.vehicle.findUnique({ where: { serial }, select: detailSelect });
  if (!vehicle) throw new HttpError(404, 'not_found');

  const now = new Date();
  const vehicleId = vehicle.id;
  const live = { vehicleId, deletedAt: null };
  const yearStart = startOfYear(now);

  const [
    services,
    malfunctions,
    openMalfunctions,
    fluids,
    fuel,
    movements,
    inspections,
    nextInspection,
    documents,
    quotes,
    notes,
    serviceCost,
    malfunctionCost,
    recentFuel,
    lastFuel,
    lastMovement,
    lastEvent,
    items,
  ] = await Promise.all([
    app.db.serviceRecord.count({ where: live }),
    app.db.malfunction.count({ where: live }),
    app.db.malfunction.count({ where: { ...live, state: { not: 'RESOLVED' } } }),
    app.db.fluidAddition.count({ where: live }),
    app.db.fuelEntry.count({ where: live }),
    app.db.movement.count({ where: live }),
    app.db.inspection.count({ where: live }),
    app.db.inspection.findFirst({
      where: { ...live, validUntil: { gte: now } },
      orderBy: { validUntil: 'asc' },
      select: { validUntil: true, kind: true },
    }),
    app.db.documentVehicle.count({ where: { vehicleId, document: { deletedAt: null } } }),
    app.db.quoteVehicle.count({ where: { vehicleId, quote: visibleQuotesWhere(user) } }),
    app.db.note.count({ where: live }),
    app.db.serviceRecord.aggregate({
      _sum: { cost: true },
      where: { ...live, date: { gte: yearStart } },
    }),
    app.db.malfunction.aggregate({
      _sum: { cost: true },
      where: { ...live, reportedAt: { gte: yearStart } },
    }),
    app.db.fuelEntry.findMany({
      where: { ...live, date: { gte: new Date(now.getTime() - ECONOMY_WINDOW_DAYS * DAY_MS) } },
      orderBy: { date: 'asc' },
      select: { liters: true, odometerKm: true, engineHours: true },
    }),
    app.db.fuelEntry.findFirst({
      where: live,
      orderBy: { date: 'desc' },
      select: { date: true, liters: true },
    }),
    app.db.movement.findFirst({
      where: live,
      orderBy: { date: 'desc' },
      select: { date: true, toLocation: { select: { code: true } } },
    }),
    app.db.event.findFirst({
      where: { vehicleId },
      orderBy: { occurredAt: 'desc' },
      select: { occurredAt: true },
    }),
    app.db.item.findMany({
      where: { currentVehicleId: vehicleId },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        kind: true,
        name: true,
        model: true,
        spec: true,
        serial: true,
        assignments: {
          where: { vehicleId, removedAt: null },
          orderBy: { assignedAt: 'desc' },
          take: 1,
          select: { assignedAt: true },
        },
      },
    }),
  ]);

  const { id: _id, type, department, location, ...fields } = vehicle;
  const costYtd =
    (serviceCost._sum.cost?.toNumber() ?? 0) + (malfunctionCost._sum.cost?.toNumber() ?? 0);

  return {
    ...fields,
    type: type.code,
    category: type.category,
    usageUnit: type.usageUnit,
    department: department?.code ?? null,
    location: location?.code ?? null,
    computed: {
      openMalfunctions,
      fuelEconomy30d: fuelEconomy(
        recentFuel.map((f) => ({ ...f, liters: f.liters.toNumber() })),
        type.usageUnit,
      ),
      maintenanceCostYtd: costYtd,
      lastActivity: lastEvent?.occurredAt ?? null,
      lastFuel: lastFuel ? { date: lastFuel.date, liters: lastFuel.liters.toNumber() } : null,
      lastMovement: lastMovement
        ? { date: lastMovement.date, to: lastMovement.toLocation.code }
        : null,
    },
    counts: {
      service: services,
      malfunctions,
      malfunctionsOpen: openMalfunctions,
      fluids,
      fuel,
      movements,
      inspections,
      nextInspection,
      documents,
      quotes,
      notes,
    },
    items: items.map(({ assignments, ...item }) => ({
      ...item,
      assignedSince: assignments[0]?.assignedAt ?? null,
    })),
  };
}
