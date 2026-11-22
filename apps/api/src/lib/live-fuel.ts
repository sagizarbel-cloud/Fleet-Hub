import { EventEmitter } from 'node:events';
import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import {
  FUEL_HISTORY_DAYS,
  FUEL_MAX_FUTURE_MIN,
  NO_FUEL_TYPES,
  type FuelLevelSource,
} from '@fleet-hub/shared';

/** What the fuel panel shows for one vehicle, and what the live stream sends. */
export interface FuelLevelView {
  serial: string;
  pct: number | null;
  liters: number | null;
  at: string;
  source: FuelLevelSource;
}

/** A vehicle's engine hours changed from a live reading (2026-11-22). */
export interface HoursView {
  serial: string;
  engineHours: number;
  at: string;
}

export interface FuelBus {
  publish(level: FuelLevelView): void;
  subscribe(fn: (level: FuelLevelView) => void): () => void;
  publishHours(hours: HoursView): void;
  subscribeHours(fn: (hours: HoursView) => void): () => void;
}

declare module 'fastify' {
  interface FastifyInstance {
    fuelBus: FuelBus;
  }
}

const PRUNE_EVERY_MS = 6 * 60 * 60 * 1000;

/**
 * The in-process fan-out from ingest to open fuel panels. Production runs one api container
 * (docs/ARCHITECTURE.md), so an EventEmitter is enough; a second instance would need Postgres
 * LISTEN/NOTIFY here instead. Also prunes old live readings now and then.
 */
export const fuelBusPlugin = fp(async (app) => {
  const emitter = new EventEmitter();
  // One listener per open panel: 20-30 users with a few tabs each.
  emitter.setMaxListeners(500);
  app.decorate('fuelBus', {
    publish: (level) => emitter.emit('level', level),
    subscribe: (fn) => {
      emitter.on('level', fn);
      return () => emitter.off('level', fn);
    },
    publishHours: (hours) => emitter.emit('hours', hours),
    subscribeHours: (fn) => {
      emitter.on('hours', fn);
      return () => emitter.off('hours', fn);
    },
  } satisfies FuelBus);

  const prune = () =>
    pruneLiveReadings(app).catch((err: unknown) => app.log.warn({ err }, 'fuel prune failed'));
  let timer: NodeJS.Timeout | undefined;
  app.addHook('onReady', async () => {
    timer = setInterval(prune, PRUNE_EVERY_MS);
    timer.unref();
  });
  app.addHook('onClose', async () => clearInterval(timer));
});

export async function pruneLiveReadings(app: FastifyInstance, now = new Date()) {
  const before = new Date(now.getTime() - FUEL_HISTORY_DAYS * 24 * 60 * 60 * 1000);
  const { count } = await app.db.fuelLevelReading.deleteMany({
    where: { source: 'LIVE', at: { lt: before } },
  });
  return count;
}

const round1 = (n: number | null | undefined) => (n == null ? null : Math.round(n * 10) / 10);

export interface ReadingToStore {
  vehicleId: string;
  serial: string;
  at: Date;
  pct: number | null;
  liters: number | null;
  source: FuelLevelSource;
  deviceId?: string | null;
  userId?: string | null;
}

/**
 * Stores a reading in the history and, when it is the newest for that vehicle, as the current
 * level, which then goes out to every open panel. A late reading (older than the current one)
 * only joins the history. Returns whether the current level changed.
 */
export async function storeReading(app: FastifyInstance, r: ReadingToStore): Promise<boolean> {
  const pct = round1(r.pct);
  const liters = round1(r.liters);
  const base = {
    pct,
    liters,
    at: r.at,
    source: r.source,
    deviceId: r.deviceId ?? null,
    userId: r.userId ?? null,
  };
  const current = await app.db.$transaction(async (tx) => {
    await tx.fuelLevelReading.create({ data: { vehicleId: r.vehicleId, ...base } });
    // Only replace a level that is older: "at <= this reading" in one statement, so two readings
    // arriving together can't swap places.
    const updated = await tx.fuelLevel.updateMany({
      where: { vehicleId: r.vehicleId, at: { lte: r.at } },
      data: base,
    });
    if (updated.count) return true;
    const exists = await tx.fuelLevel.findUnique({
      where: { vehicleId: r.vehicleId },
      select: { vehicleId: true },
    });
    if (exists) return false;
    await tx.fuelLevel.create({ data: { vehicleId: r.vehicleId, ...base } });
    return true;
  });
  if (current) {
    app.fuelBus.publish({
      serial: r.serial,
      pct,
      liters,
      at: r.at.toISOString(),
      source: r.source,
    });
  }
  return current;
}

export const isFutureReading = (at: Date, now = Date.now()) =>
  at.getTime() > now + FUEL_MAX_FUTURE_MIN * 60_000;

/** Every vehicle that has a tank, with its current level (null until the first reading). */
export async function fuelPanel(app: FastifyInstance) {
  const rows = await app.db.vehicle.findMany({
    where: { type: { code: { notIn: [...NO_FUEL_TYPES] } } },
    // Never select startCodeEnc here.
    select: {
      serial: true,
      make: true,
      model: true,
      status: true,
      type: { select: { code: true } },
      location: { select: { code: true } },
      fuelLevel: { select: { pct: true, liters: true, at: true, source: true } },
      _count: { select: { connections: { where: { active: true } } } },
    },
    orderBy: { serial: 'asc' },
  });
  return rows.map(({ type, location, fuelLevel, _count, ...v }) => ({
    ...v,
    type: type.code,
    location: location?.code ?? null,
    /** A connection reports for this vehicle on its own (gateways aren't counted). */
    connected: _count.connections > 0,
    level: fuelLevel ? { ...fuelLevel, at: fuelLevel.at.toISOString() } : null,
  }));
}

/**
 * A live hour-meter reading (2026-11-22). Hour meters only count up, so a lower or equal value
 * (a late or repeated delivery) changes nothing. Like live fuel, a reading is not a timeline
 * event (one a minute per vehicle would bury the timeline); hand edits still are.
 */
export async function storeHours(
  app: FastifyInstance,
  r: { vehicleId: string; serial: string; at: Date; engineHours: number },
): Promise<boolean> {
  const hours = Math.round(r.engineHours);
  const updated = await app.db.vehicle.updateMany({
    where: { id: r.vehicleId, OR: [{ engineHours: null }, { engineHours: { lt: hours } }] },
    data: { engineHours: hours },
  });
  if (!updated.count) return false;
  app.fuelBus.publishHours({ serial: r.serial, engineHours: hours, at: r.at.toISOString() });
  return true;
}
