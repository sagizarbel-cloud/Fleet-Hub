import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import {
  CONNECTION_TOKEN_PREFIX,
  connectionBody,
  fuelIngestBody,
  fuelReadingInput,
  idParam,
  NO_FUEL_TYPES,
} from '@fleet-hub/shared';
import { HttpError, issueCode, parse } from '../lib/http';
import { isFutureReading, storeReading } from '../lib/live-fuel';
import { hashToken, newToken } from '../lib/tokens';
import { requireRole } from '../plugins/auth';

/** Requests per minute per connection: a gateway batching the whole fleet needs few. */
const INGEST_PER_MINUTE = 120;
/** lastSeenAt is written at most this often per connection, not on every request. */
const SEEN_EVERY_MS = 60_000;

const bearer = (req: FastifyRequest) => {
  const h = req.headers.authorization ?? '';
  const m = /^Bearer\s+(\S+)$/i.exec(h);
  return m?.[1] ?? null;
};

/** `fhl_` + 32 random bytes; only the hash of the whole token is stored. */
const newConnectionToken = () => {
  const token = `${CONNECTION_TOKEN_PREFIX}${newToken().token}`;
  return { token, hash: hashToken(token), hint: token.slice(-4) };
};

const CONNECTION_SELECT = {
  id: true,
  name: true,
  tokenHint: true,
  active: true,
  lastSeenAt: true,
  createdAt: true,
  revokedAt: true,
  vehicle: { select: { serial: true } },
} as const;

type ConnectionRow = {
  vehicle: { serial: string } | null;
} & Record<string, unknown>;
const view = ({ vehicle, ...c }: ConnectionRow) => ({ ...c, serial: vehicle?.serial ?? null });

/**
 * Live data (2026-11-15). Admins create connections, each with its own token; a connected vehicle
 * or the telematics provider's server posts readings with that token (docs/LIVE-DATA.md).
 */
export const telematicsRoutes: FastifyPluginAsync = async (app) => {
  // ---------- Connections (admins) ----------

  app.get('/connections', { preHandler: requireRole('ADMIN') }, async () => {
    const rows = await app.db.telematicsDevice.findMany({
      select: CONNECTION_SELECT,
      orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map(view);
  });

  const vehicleIdOf = async (serial: string | null | undefined) => {
    if (!serial) return null;
    const v = await app.db.vehicle.findUnique({ where: { serial }, select: { id: true } });
    if (!v) {
      const err = new HttpError(400, 'validation_failed');
      (err as HttpError & { issues: unknown }).issues = [{ path: 'serial', code: 'notFound' }];
      throw err;
    }
    return v.id;
  };

  /** Creates a connection; the token is in this answer only. */
  app.post('/connections', { preHandler: requireRole('ADMIN') }, async (req) => {
    const body = parse(connectionBody, req.body);
    const vehicleId = await vehicleIdOf(body.serial);
    const t = newConnectionToken();
    const row = await app.db.$transaction(async (tx) => {
      const c = await tx.telematicsDevice.create({
        data: {
          name: body.name,
          tokenHash: t.hash,
          tokenHint: t.hint,
          vehicleId,
          createdById: req.user!.id,
        },
        select: CONNECTION_SELECT,
      });
      await tx.auditLog.create({
        data: {
          userId: req.user!.id,
          action: 'connection.create',
          targetType: 'TelematicsDevice',
          targetId: c.id,
          meta: { name: c.name, serial: c.vehicle?.serial ?? null },
          ip: req.ip,
        },
      });
      return c;
    });
    return { connection: view(row), token: t.token };
  });

  /** A new token for a connection; the old one stops working at once. */
  app.post('/connections/:id/token', { preHandler: requireRole('ADMIN') }, async (req) => {
    const { id } = parse(idParam, req.params);
    const t = newConnectionToken();
    const row = await app.db.$transaction(async (tx) => {
      const found = await tx.telematicsDevice.findUnique({ where: { id }, select: { id: true } });
      if (!found) throw new HttpError(404, 'not_found');
      const c = await tx.telematicsDevice.update({
        where: { id },
        data: { tokenHash: t.hash, tokenHint: t.hint, active: true, revokedAt: null },
        select: CONNECTION_SELECT,
      });
      await tx.auditLog.create({
        data: {
          userId: req.user!.id,
          action: 'connection.token',
          targetType: 'TelematicsDevice',
          targetId: id,
          ip: req.ip,
        },
      });
      return c;
    });
    return { connection: view(row), token: t.token };
  });

  /** Turns a connection off: its token stops working. Its readings stay. */
  app.delete('/connections/:id', { preHandler: requireRole('ADMIN') }, async (req) => {
    const { id } = parse(idParam, req.params);
    const row = await app.db.$transaction(async (tx) => {
      const found = await tx.telematicsDevice.findUnique({ where: { id }, select: { id: true } });
      if (!found) throw new HttpError(404, 'not_found');
      const c = await tx.telematicsDevice.update({
        where: { id },
        data: { active: false, revokedAt: new Date() },
        select: CONNECTION_SELECT,
      });
      await tx.auditLog.create({
        data: {
          userId: req.user!.id,
          action: 'connection.revoke',
          targetType: 'TelematicsDevice',
          targetId: id,
          ip: req.ip,
        },
      });
      return c;
    });
    return view(row);
  });

  // ---------- Ingest (connections, by token) ----------

  const lastSeenWrite = new Map<string, number>();

  app.post(
    '/v1/readings',
    {
      config: {
        rateLimit: {
          max: INGEST_PER_MINUTE,
          timeWindow: '1 minute',
          keyGenerator: (r: FastifyRequest) => {
            const token = bearer(r);
            return token ? `conn:${hashToken(token)}` : `ip:${r.ip}`;
          },
        },
      },
    },
    async (req, reply) => {
      const token = bearer(req);
      const device = token
        ? await app.db.telematicsDevice.findUnique({
            where: { tokenHash: hashToken(token) },
            select: {
              id: true,
              active: true,
              vehicle: { select: { id: true, serial: true, vin: true } },
            },
          })
        : null;
      if (!device || !device.active) throw new HttpError(401, 'bad_token');

      const { readings } = parse(fuelIngestBody, req.body);
      const now = Date.now();
      const ignored: { index: number; reason: string }[] = [];
      let accepted = 0;
      const vehicles = new Map<string, { id: string; serial: string; tank: boolean } | null>();

      const findVehicle = async (key: { serial?: string; vin?: string }) => {
        const k = key.serial ? `s:${key.serial}` : `v:${key.vin}`;
        if (!vehicles.has(k)) {
          const v = await app.db.vehicle.findUnique({
            where: key.serial ? { serial: key.serial } : { vin: key.vin!.toUpperCase() },
            select: { id: true, serial: true, type: { select: { code: true } } },
          });
          vehicles.set(
            k,
            v && {
              id: v.id,
              serial: v.serial,
              tank: !(NO_FUEL_TYPES as readonly string[]).includes(v.type.code),
            },
          );
        }
        return vehicles.get(k)!;
      };

      for (const [index, raw] of readings.entries()) {
        const parsed = fuelReadingInput.safeParse(raw);
        if (!parsed.success) {
          const issue = parsed.error.issues[0]!;
          ignored.push({
            index,
            reason: issue.path.length
              ? `${issue.path.join('.')}:${issueCode(issue)}`
              : issueCode(issue),
          });
          continue;
        }
        const r = parsed.data;
        let vehicle: { id: string; serial: string; tank: boolean } | null;
        if (device.vehicle) {
          // A connection tied to one vehicle may still name it; it must name the same one.
          const bound = device.vehicle;
          if (
            (r.serial && r.serial !== bound.serial) ||
            (r.vin && r.vin.toUpperCase() !== bound.vin)
          ) {
            ignored.push({ index, reason: 'vehicle_mismatch' });
            continue;
          }
          vehicle = await findVehicle({ serial: bound.serial });
        } else if (r.serial || r.vin) {
          vehicle = await findVehicle(r);
        } else {
          ignored.push({ index, reason: 'vehicle_missing' });
          continue;
        }
        if (!vehicle) {
          ignored.push({ index, reason: 'vehicle_not_found' });
          continue;
        }
        if (!vehicle.tank) {
          ignored.push({ index, reason: 'no_fuel_tank' });
          continue;
        }
        const at = r.at ? new Date(r.at) : new Date(now);
        if (isFutureReading(at, now)) {
          ignored.push({ index, reason: 'future_time' });
          continue;
        }
        await storeReading(app, {
          vehicleId: vehicle.id,
          serial: vehicle.serial,
          at,
          pct: r.fuelLevelPct ?? null,
          liters: r.fuelLiters ?? null,
          source: 'LIVE',
          deviceId: device.id,
        });
        accepted++;
      }

      if (now - (lastSeenWrite.get(device.id) ?? 0) > SEEN_EVERY_MS) {
        lastSeenWrite.set(device.id, now);
        await app.db.telematicsDevice.update({
          where: { id: device.id },
          data: { lastSeenAt: new Date(now) },
        });
      }
      return reply.status(accepted || !ignored.length ? 200 : 422).send({ accepted, ignored });
    },
  );
};
