// Dev only: pretends to be a telematics gateway so the fuel panel can be watched updating live.
// It makes (or re-keys) a connection named "Simulator (dev)" in the dev database, then posts
// readings (fuel and engine hours) for a few vehicles to the running api the same way a real provider would
// (docs/LIVE-DATA.md). Usage: pnpm fuel:simulate [serial ...]   (Ctrl+C to stop)
import { createHash, randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { CONNECTION_TOKEN_PREFIX, NO_FUEL_TYPES } from '@fleet-hub/shared';

if (process.env.NODE_ENV === 'production') throw new Error('The simulator is for development.');

const API = process.env.SIM_API ?? 'http://localhost:3001';
const EVERY_MS = 5_000;
const NAME = 'Simulator (dev)';

const db = new PrismaClient();
const token = `${CONNECTION_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
const tokenHash = createHash('sha256').update(token).digest('hex');

const found = await db.telematicsDevice.findFirst({ where: { name: NAME } });
const data = { tokenHash, tokenHint: token.slice(-4), active: true, revokedAt: null };
if (found) await db.telematicsDevice.update({ where: { id: found.id }, data });
else await db.telematicsDevice.create({ data: { name: NAME, ...data } });

const asked = process.argv.slice(2).filter((a) => a !== '--');
const vehicles = await db.vehicle.findMany({
  where: {
    type: { code: { notIn: [...NO_FUEL_TYPES] } },
    ...(asked.length ? { serial: { in: asked } } : {}),
  },
  select: { serial: true, engineHours: true, fuelLevel: { select: { pct: true } } },
  orderBy: { serial: 'asc' },
  take: asked.length || 4,
});
await db.$disconnect();
if (!vehicles.length) throw new Error('No vehicles to simulate. Run pnpm db:seed first.');

const levels = new Map(vehicles.map((v) => [v.serial, v.fuelLevel?.pct ?? 60]));
// Hour meters tick up one hour per reading (sped up, so the vehicle page can be watched changing).
const hours = new Map(vehicles.map((v) => [v.serial, v.engineHours ?? 0]));
console.log(`Simulating ${[...levels.keys()].join(', ')} every ${EVERY_MS / 1000} s to ${API}`);

async function tick() {
  const readings = [...levels].map(([serial, pct]) => {
    // Burn 0.3-1.5% per tick; refill to near full when it runs low.
    let next = pct - (0.3 + Math.random() * 1.2);
    if (next < 6) next = 92 + Math.random() * 8;
    levels.set(serial, next);
    const h = (hours.get(serial) ?? 0) + 1;
    hours.set(serial, h);
    return {
      serial,
      at: new Date().toISOString(),
      fuelLevelPct: Math.round(next * 10) / 10,
      engineHours: h,
    };
  });
  try {
    const res = await fetch(`${API}/api/telematics/v1/readings`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ readings }),
    });
    const body = await res.text();
    console.log(new Date().toLocaleTimeString(), res.status, body);
  } catch (err) {
    console.error('api not reachable:', (err as Error).message);
  }
}

await tick();
setInterval(() => void tick(), EVERY_MS);
