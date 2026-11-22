import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pruneLiveReadings } from '../src/lib/live-fuel';
import { createUser, login, makeApp, ORIGIN } from './helpers';

/** Current fuel and the live data connection (Sagi, 2026-11-15). */
let app: Awaited<ReturnType<typeof makeApp>>;
let admin: string;
let editor: string;
let viewer: string;
let seq = 0;

const req = (
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  cookie: string,
  payload?: object,
) => app.inject({ method, url, headers: { cookie, origin: ORIGIN }, payload });

/** A device posting with its token: no cookie, no Origin (a server or a tracker). */
const ingest = (token: string, payload: unknown) =>
  app.inject({
    method: 'POST',
    url: '/api/telematics/v1/readings',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    payload: JSON.stringify(payload),
  });

async function vehicle(type = 'wheel_loader', vin?: string) {
  const serial = `LF-${++seq}`;
  const t = await app.db.vehicleType.findUniqueOrThrow({ where: { code: type } });
  await app.db.vehicle.create({ data: { serial, vin, make: 'Test', model: 'Unit', typeId: t.id } });
  return serial;
}

async function connection(serial: string | null, name = 'Tracker') {
  const res = await req('POST', '/api/telematics/connections', admin, { name, serial });
  expect(res.statusCode).toBe(200);
  return res.json() as { connection: { id: string; serial: string | null }; token: string };
}

const levelOf = async (serial: string) =>
  (await req('GET', '/api/fuel', viewer))
    .json()
    .find((v: { serial: string }) => v.serial === serial)?.level;

beforeAll(async () => {
  app = await makeApp();
  admin = await login(app, await createUser(app, 'ADMIN'));
  editor = await login(app, await createUser(app, 'EDITOR'));
  viewer = await login(app, await createUser(app, 'VIEWER'));
  for (const [code, category] of [
    ['wheel_loader', 'EQUIPMENT'],
    ['trailer', 'EQUIPMENT'],
  ] as const)
    await app.db.vehicleType.upsert({
      where: { code },
      create: { code, nameEn: code, nameHe: code, category, usageUnit: 'HOURS' },
      update: {},
    });
});

afterAll(async () => {
  await app.close();
});

describe('fuel panel and manual levels', () => {
  it('lists vehicles with a tank, trailers left out', async () => {
    const loader = await vehicle();
    const trailer = await vehicle('trailer');
    const res = await req('GET', '/api/fuel', viewer);
    expect(res.statusCode).toBe(200);
    const serials = res.json().map((v: { serial: string }) => v.serial);
    expect(serials).toContain(loader);
    expect(serials).not.toContain(trailer);
    expect(await levelOf(loader)).toBeNull();
  });

  it('needs a signed-in user', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/fuel' })).statusCode).toBe(401);
  });

  it('an editor sets the level by hand; it is logged in the timeline', async () => {
    const serial = await vehicle();
    expect((await req('PUT', `/api/fuel/${serial}`, viewer, { pct: 50 })).statusCode).toBe(403);
    expect((await req('PUT', `/api/fuel/${serial}`, editor, { pct: 140 })).statusCode).toBe(400);
    const res = await req('PUT', `/api/fuel/${serial}`, editor, { pct: 62.44, liters: 250 });
    expect(res.statusCode).toBe(200);
    expect(await levelOf(serial)).toMatchObject({ pct: 62.4, liters: 250, source: 'MANUAL' });
    const ev = await app.db.event.findFirstOrThrow({
      where: { vehicle: { serial }, type: 'FUEL_LEVEL' },
    });
    expect(ev.params).toMatchObject({ pct: 62, liters: 250 });
  });

  it('refuses a trailer and an unknown vehicle', async () => {
    const trailer = await vehicle('trailer');
    expect((await req('PUT', `/api/fuel/${trailer}`, editor, { pct: 10 })).json().error).toBe(
      'no_fuel_tank',
    );
    expect((await req('PUT', '/api/fuel/NOPE-1', editor, { pct: 10 })).statusCode).toBe(404);
  });
});

describe('connections', () => {
  it('only admins manage them; the token is shown once and only its hash is stored', async () => {
    expect(
      (await req('POST', '/api/telematics/connections', editor, { name: 'x' })).statusCode,
    ).toBe(403);
    expect((await req('GET', '/api/telematics/connections', editor)).statusCode).toBe(403);
    const serial = await vehicle();
    const { connection: c, token } = await connection(serial);
    expect(token).toMatch(/^fhl_[A-Za-z0-9_-]{40,}$/);
    expect(c.serial).toBe(serial);
    const row = await app.db.telematicsDevice.findUniqueOrThrow({ where: { id: c.id } });
    expect(row.tokenHash).not.toContain(token.slice(4));
    const list = (await req('GET', '/api/telematics/connections', admin)).json();
    expect(JSON.stringify(list)).not.toContain(token);
    expect(JSON.stringify(list)).not.toContain('tokenHash');
    expect(
      await app.db.auditLog.count({ where: { action: 'connection.create', targetId: c.id } }),
    ).toBe(1);
  });

  it('rejects an unknown vehicle', async () => {
    const res = await req('POST', '/api/telematics/connections', admin, {
      name: 'x',
      serial: 'NOPE-2',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().issues).toEqual([{ path: 'serial', code: 'notFound' }]);
  });
});

describe('ingest', () => {
  it('needs a valid token', async () => {
    expect((await ingest('fhl_nope', { fuelLevelPct: 5 })).statusCode).toBe(401);
    const res = await app.inject({
      method: 'POST',
      url: '/api/telematics/v1/readings',
      payload: { fuelLevelPct: 5 },
    });
    expect(res.statusCode).toBe(401);
  });

  it('a vehicle tracker posts a single reading without naming the vehicle', async () => {
    const serial = await vehicle();
    const { token } = await connection(serial);
    const res = await ingest(token, { fuelLevelPct: 71.25, fuelLiters: 300 });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ accepted: 1, ignored: [] });
    expect(await levelOf(serial)).toMatchObject({ pct: 71.3, liters: 300, source: 'LIVE' });
    // Live readings stay out of the timeline.
    expect(await app.db.event.count({ where: { vehicle: { serial }, type: 'FUEL_LEVEL' } })).toBe(
      0,
    );
  });

  it('a gateway names each vehicle by serial or VIN; bad readings are listed, good ones kept', async () => {
    const a = await vehicle();
    const vin = `1HGBH41JXMN1${String(10000 + seq).slice(-5)}`;
    const b = await vehicle('wheel_loader', vin);
    const trailer = await vehicle('trailer');
    const { token } = await connection(null, 'Provider gateway');
    const now = new Date();
    const res = await ingest(token, {
      readings: [
        { serial: a, at: now.toISOString(), fuelLevelPct: 40 },
        { vin: vin.toLowerCase(), fuelLiters: 120, extraField: 'kept out' },
        { serial: 'NOPE-3', fuelLevelPct: 1 },
        { fuelLevelPct: 1 },
        { serial: a },
        { serial: trailer, fuelLevelPct: 1 },
        { serial: a, fuelLevelPct: 1, at: new Date(now.getTime() + 3_600_000).toISOString() },
        { serial: a, fuelLevelPct: 101 },
      ],
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      accepted: 2,
      ignored: [
        { index: 2, reason: 'vehicle_not_found' },
        { index: 3, reason: 'vehicle_missing' },
        { index: 4, reason: 'noData' },
        { index: 5, reason: 'no_fuel_tank' },
        { index: 6, reason: 'future_time' },
        { index: 7, reason: 'fuelLevelPct:too_big' },
      ],
    });
    expect(await levelOf(a)).toMatchObject({ pct: 40, source: 'LIVE' });
    expect(await levelOf(b)).toMatchObject({ pct: null, liters: 120, source: 'LIVE' });
  });

  it('engine hours update the vehicle live, only ever upward, and go out on the stream bus', async () => {
    const serial = await vehicle('wheel_loader');
    const trailer = await vehicle('trailer');
    const { token } = await connection(null, 'Hours gateway');
    const seen: { serial: string; engineHours: number }[] = [];
    const off = app.fuelBus.subscribeHours((h) => seen.push(h));
    const hoursOf = async (s: string) =>
      (await app.db.vehicle.findUnique({ where: { serial: s }, select: { engineHours: true } }))!
        .engineHours;
    await app.db.vehicle.update({ where: { serial }, data: { engineHours: 1000 } });

    const res = await ingest(token, [
      { serial, engineHours: 1012.6 },
      { serial: trailer, engineHours: 5, fuelLevelPct: 10 },
    ]);
    expect(res.json()).toEqual({ accepted: 2, ignored: [] });
    expect(await hoursOf(serial)).toBe(1013);
    // A late, lower reading changes nothing and isn't broadcast.
    await ingest(token, { serial, engineHours: 900 });
    expect(await hoursOf(serial)).toBe(1013);
    off();
    expect(seen.filter((h) => h.serial === serial)).toEqual([
      expect.objectContaining({ serial, engineHours: 1013 }),
    ]);
    // No timeline entries for live hours, and the trailer's fuel was left out.
    expect(await levelOf(trailer)).toBeFalsy();
  });

  it('all readings bad: 422; a bad envelope: 400', async () => {
    const { token } = await connection(null);
    expect((await ingest(token, [{ serial: 'NOPE-4', fuelLevelPct: 3 }])).statusCode).toBe(422);
    expect((await ingest(token, { readings: [] })).statusCode).toBe(400);
  });

  it('a tracker can name only its own vehicle', async () => {
    const mine = await vehicle();
    const other = await vehicle();
    const { token } = await connection(mine);
    const res = await ingest(token, { serial: other, fuelLevelPct: 10 });
    expect(res.json()).toEqual({
      accepted: 0,
      ignored: [{ index: 0, reason: 'vehicle_mismatch' }],
    });
    expect(await levelOf(other)).toBeNull();
  });

  it('a late reading joins the history but does not replace a newer level', async () => {
    const serial = await vehicle();
    const { token } = await connection(serial);
    const now = Date.now();
    await ingest(token, { fuelLevelPct: 55, at: new Date(now).toISOString() });
    await ingest(token, { fuelLevelPct: 90, at: new Date(now - 600_000).toISOString() });
    expect(await levelOf(serial)).toMatchObject({ pct: 55 });
    expect(await app.db.fuelLevelReading.count({ where: { vehicle: { serial } } })).toBe(2);
  });

  it('a new token replaces the old one; turning a connection off stops it', async () => {
    const serial = await vehicle();
    const { connection: c, token } = await connection(serial);
    const rotated = await req('POST', `/api/telematics/connections/${c.id}/token`, admin);
    const fresh = rotated.json().token as string;
    expect((await ingest(token, { fuelLevelPct: 5 })).statusCode).toBe(401);
    expect((await ingest(fresh, { fuelLevelPct: 5 })).statusCode).toBe(200);
    const off = await req('DELETE', `/api/telematics/connections/${c.id}`, admin);
    expect(off.json()).toMatchObject({ active: false });
    expect((await ingest(fresh, { fuelLevelPct: 5 })).statusCode).toBe(401);
    const seen = await app.db.telematicsDevice.findUniqueOrThrow({ where: { id: c.id } });
    expect(seen.lastSeenAt).not.toBeNull();
  });

  it('prunes live readings past the history window, keeps manual ones', async () => {
    const serial = await vehicle();
    const v = await app.db.vehicle.findUniqueOrThrow({ where: { serial } });
    const old = new Date(Date.now() - 200 * 24 * 3_600_000);
    await app.db.fuelLevelReading.createMany({
      data: [
        { vehicleId: v.id, at: old, pct: 10, source: 'LIVE' },
        { vehicleId: v.id, at: old, pct: 10, source: 'MANUAL' },
      ],
    });
    expect(await pruneLiveReadings(app)).toBeGreaterThanOrEqual(1);
    expect(await app.db.fuelLevelReading.findMany({ where: { vehicleId: v.id } })).toEqual([
      expect.objectContaining({ source: 'MANUAL' }),
    ]);
  });
});

describe('live stream', () => {
  it('sends each new level to open panels as it arrives', async () => {
    const serial = await vehicle();
    const { token } = await connection(serial);
    const address = await app.listen({ port: 0, host: '127.0.0.1' });
    const ctrl = new AbortController();
    const res = await fetch(`${address}/api/fuel/stream`, {
      headers: { cookie: viewer },
      signal: ctrl.signal,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^text\/event-stream/);
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let text = '';
    await ingest(token, { fuelLevelPct: 33 });
    while (!text.includes('event: level')) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value);
    }
    ctrl.abort();
    const data = /data: (.+)\n/.exec(text)![1]!;
    expect(JSON.parse(data)).toMatchObject({ serial, pct: 33, source: 'LIVE' });
  });

  it('needs a signed-in user', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/fuel/stream' })).statusCode).toBe(401);
  });
});
