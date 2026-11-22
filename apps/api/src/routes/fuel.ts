import type { FastifyPluginAsync } from 'fastify';
import { fuelLevelBody, NO_FUEL_TYPES, serialParam } from '@fleet-hub/shared';
import { HttpError, parse } from '../lib/http';
import { fuelPanel, storeReading, type FuelLevelView } from '../lib/live-fuel';
import { requireRole, requireUser } from '../plugins/auth';

const HEARTBEAT_MS = 25_000;
/** How often an open stream checks its session is still valid (signed out, user turned off). */
const RECHECK_MS = 5 * 60_000;

/** Current fuel (2026-11-15): the panel, setting a level by hand, and the live stream. */
export const fuelRoutes: FastifyPluginAsync = async (app) => {
  // Open streams end when the server shuts down, so it doesn't wait for them.
  const streams = new Set<() => void>();
  app.addHook('onClose', async () => {
    for (const end of streams) end();
  });

  app.get('/', { preHandler: requireUser }, async () => fuelPanel(app));

  /** An editor sets the level from the gauge. Logged in the timeline like any other change. */
  app.put('/:serial', { preHandler: requireRole('EDITOR') }, async (req) => {
    const { serial } = parse(serialParam, req.params);
    const body = parse(fuelLevelBody, req.body);
    const vehicle = await app.db.vehicle.findUnique({
      where: { serial },
      select: { id: true, serial: true, type: { select: { code: true } } },
    });
    if (!vehicle) throw new HttpError(404, 'vehicle_not_found');
    if ((NO_FUEL_TYPES as readonly string[]).includes(vehicle.type.code))
      throw new HttpError(400, 'no_fuel_tank');
    const at = new Date();
    await storeReading(app, {
      vehicleId: vehicle.id,
      serial: vehicle.serial,
      at,
      pct: body.pct,
      liters: body.liters ?? null,
      source: 'MANUAL',
      userId: req.user!.id,
    });
    await app.db.event.create({
      data: {
        type: 'FUEL_LEVEL',
        vehicleId: vehicle.id,
        userId: req.user!.id,
        occurredAt: at,
        params: { pct: Math.round(body.pct), liters: body.liters ?? null },
      },
    });
    return { ok: true };
  });

  /**
   * Server-sent events: every new current level as it arrives (`event: level`). The browser's
   * EventSource reconnects on its own; the panel refetches the list on (re)connect so nothing
   * sent while it was away is missed.
   */
  app.get('/stream', { preHandler: requireUser }, (req, reply) => {
    const sessionId = req.sessionId;
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      // Tells nginx-style proxies not to buffer (Caddy streams event streams on its own).
      'x-accel-buffering': 'no',
    });
    res.write('retry: 5000\n\n');

    const send = (level: FuelLevelView) =>
      res.write(`event: level\ndata: ${JSON.stringify(level)}\n\n`);
    const unsubscribe = app.fuelBus.subscribe(send);
    // Engine hours ride the same stream (2026-11-22), so a page needs one connection.
    const unsubscribeHours = app.fuelBus.subscribeHours((h) =>
      res.write(`event: hours\ndata: ${JSON.stringify(h)}\n\n`),
    );
    const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);
    const recheck = setInterval(() => {
      void app.db.session
        .findUnique({ where: { id: sessionId ?? '' }, include: { user: true } })
        .then((s) => {
          if (!s || s.expiresAt.getTime() < Date.now() || !s.user.active) res.end();
        })
        .catch(() => res.end());
    }, RECHECK_MS);

    const end = () => res.end();
    streams.add(end);
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      streams.delete(end);
      unsubscribe();
      unsubscribeHours();
      clearInterval(heartbeat);
      clearInterval(recheck);
    };
    req.raw.on('close', close);
    res.on('close', close);
  });
};
