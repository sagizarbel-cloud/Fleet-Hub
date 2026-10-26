import { Writable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { encryptStartCode } from '@fleet-hub/shared/crypto';
import { fuelEconomy } from '../src/lib/vehicle-detail';
import { createUser, login, makeApp, ORIGIN } from './helpers';

let app: Awaited<ReturnType<typeof makeApp>>;
let logs = '';
let admin: string;
let revealer: string;
let editor: string;
let viewer: string;
let vehicleId: string;
let otherId: string;
const PLAIN = '4826';
const SERIAL = 'VD-001';
const OTHER = 'VD-002';
const DAY = 24 * 60 * 60 * 1000;

const get = (url: string, cookie: string) =>
  app.inject({ method: 'GET', url, headers: { cookie } });
const post = (url: string, cookie: string, payload?: object) =>
  app.inject({ method: 'POST', url, headers: { cookie, origin: ORIGIN }, payload });
const reveal = (cookie: string, serial = SERIAL) =>
  post(`/api/vehicles/${serial}/start-code/reveal`, cookie);

beforeAll(async () => {
  // Capture every log line at the most verbose level, to prove the code never reaches a log.
  const sink = new Writable({
    write(chunk, _enc, done) {
      logs += String(chunk);
      done();
    },
  });
  app = await makeApp(undefined, { logger: { level: 'trace', stream: sink } });
  admin = await login(app, await createUser(app, 'ADMIN'));
  revealer = await login(app, await createUser(app, 'VIEWER', { canViewStartCodes: true }));
  editor = await login(app, await createUser(app, 'EDITOR'));
  viewer = await login(app, await createUser(app, 'VIEWER'));

  const road = await app.db.vehicleType.create({
    data: { code: 'vd_road', nameEn: 'Road', nameHe: 'כביש', category: 'ROAD', usageUnit: 'KM' },
  });
  const location = await app.db.location.create({
    data: { code: 'vd_yard', nameEn: 'Yard', nameHe: 'מגרש' },
  });
  vehicleId = (
    await app.db.vehicle.create({
      data: {
        serial: SERIAL,
        vin: 'TESTVIN0000000001',
        make: 'Test',
        model: 'Pickup',
        typeId: road.id,
        odometerKm: 1500,
        hasStartCode: true,
        startCodeEnc: encryptStartCode(PLAIN, process.env.FLEET_CODE_KEY!),
      },
    })
  ).id;
  otherId = (
    await app.db.vehicle.create({
      data: { serial: OTHER, make: 'Test', model: 'Truck', typeId: road.id },
    })
  ).id;

  const now = Date.now();
  await app.db.fuelEntry.createMany({
    data: [
      { vehicleId, date: new Date(now - 20 * DAY), liters: 50, odometerKm: 1000 },
      { vehicleId, date: new Date(now - 10 * DAY), liters: 20, odometerKm: 1200 },
      { vehicleId, date: new Date(now - 2 * DAY), liters: 30, odometerKm: 1500 },
    ],
  });
  await app.db.movement.create({
    data: { vehicleId, date: new Date(now - DAY), toLocationId: location.id },
  });
  await app.db.malfunction.createMany({
    data: [
      { vehicleId, reportedAt: new Date(now - DAY), severity: 'LOW', description: 'a', cost: 100 },
      {
        vehicleId,
        reportedAt: new Date(now - DAY),
        severity: 'LOW',
        state: 'RESOLVED',
        description: 'b',
        cost: 50,
      },
    ],
  });
});
afterAll(async () => {
  await app.close();
});

describe('fuel economy', () => {
  it('is km per litre by odometer, not counting the first fill-up', () => {
    const entries = [
      { liters: 50, odometerKm: 1000, engineHours: null },
      { liters: 20, odometerKm: 1200, engineHours: null },
      { liters: 30, odometerKm: 1500, engineHours: null },
    ];
    expect(fuelEconomy(entries, 'KM')).toEqual({ value: 10, unit: 'KM_PER_L' });
  });

  it('is litres per engine hour for equipment, and null without two readings', () => {
    const entries = [
      { liters: 100, odometerKm: null, engineHours: 10 },
      { liters: 120, odometerKm: null, engineHours: 20 },
    ];
    expect(fuelEconomy(entries, 'HOURS')).toEqual({ value: 12, unit: 'L_PER_HOUR' });
    expect(fuelEconomy(entries.slice(0, 1), 'HOURS')).toBeNull();
  });
});

describe('vehicle page', () => {
  it('requires a session and 404s an unknown serial', async () => {
    expect((await app.inject({ method: 'GET', url: `/api/vehicles/${SERIAL}` })).statusCode).toBe(
      401,
    );
    expect((await get('/api/vehicles/NOPE-1', viewer)).statusCode).toBe(404);
  });

  it('returns identity, computed vitals and record counts', async () => {
    const res = await get(`/api/vehicles/${SERIAL}`, viewer);
    expect(res.statusCode).toBe(200);
    const v = res.json();
    expect(v).toMatchObject({ serial: SERIAL, vin: 'TESTVIN0000000001', hasStartCode: true });
    expect(v.computed.fuelEconomy30d).toEqual({ value: 10, unit: 'KM_PER_L' });
    expect(v.computed.lastFuel.liters).toBe(30);
    expect(v.computed.lastMovement.to).toBe('vd_yard');
    expect(v.computed.openMalfunctions).toBe(1);
    expect(v.computed.maintenanceCostYtd).toBe(150);
    expect(v.counts).toMatchObject({ fuel: 3, movements: 1, malfunctions: 2, malfunctionsOpen: 1 });
  });
});

describe('start code', () => {
  it('is never in the vehicle page, list, dashboard or events, even for a permitted user', async () => {
    for (const url of [
      `/api/vehicles/${SERIAL}`,
      '/api/vehicles?limit=200',
      '/api/dashboard',
      `/api/events?vehicle=${SERIAL}`,
    ]) {
      const res = await get(url, revealer);
      expect(res.statusCode, url).toBe(200);
      expect(res.body, url).not.toContain('startCodeEnc');
      expect(res.body, url).not.toContain(PLAIN);
    }
  });

  it('is refused without the permission, admins included, and nothing is audited', async () => {
    const before = await app.db.auditLog.count({ where: { action: 'startCode.reveal' } });
    for (const cookie of [viewer, editor, admin]) {
      const res = await reveal(cookie);
      expect(res.statusCode).toBe(403);
      expect(res.body).not.toContain(PLAIN);
    }
    expect(await app.db.auditLog.count({ where: { action: 'startCode.reveal' } })).toBe(before);
  });

  it('is revealed with the permission, and each reveal writes one audit entry', async () => {
    const res = await reveal(revealer);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ code: PLAIN });
    expect(res.headers['cache-control']).toBe('no-store');
    const audits = await app.db.auditLog.findMany({
      where: { action: 'startCode.reveal', targetId: vehicleId },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]!.meta).toEqual({ serial: SERIAL });
    expect(JSON.stringify(audits[0])).not.toContain(PLAIN);
  });

  it('404s for a vehicle without a start code', async () => {
    expect((await reveal(revealer, OTHER)).statusCode).toBe(404);
  });

  it('never appears in the logs', () => {
    expect(logs.length).toBeGreaterThan(0);
    expect(logs).not.toContain(PLAIN);
  });
});

describe('preferences', () => {
  it('default to the SPEC A6 vitals and side view, and follow the user to a new session', async () => {
    const email = await createUser(app, 'VIEWER');
    const first = await login(app, email);
    expect((await get('/api/me/preferences', first)).json()).toEqual({
      pinnedVitals: ['status', 'usage', 'nextService', 'annualTest', 'location', 'department'],
      detailView: 'side',
    });
    const put = await app.inject({
      method: 'PUT',
      url: '/api/me/preferences',
      headers: { cookie: first, origin: ORIGIN },
      payload: { pinnedVitals: ['fuelEconomy', 'status'], detailView: 'iso' },
    });
    expect(put.statusCode).toBe(200);
    const second = await login(app, email);
    expect((await get('/api/me/preferences', second)).json()).toEqual({
      pinnedVitals: ['fuelEconomy', 'status'],
      detailView: 'iso',
    });
  });

  it('reject unknown or repeated vitals', async () => {
    for (const pinnedVitals of [['startCode'], ['status', 'status']]) {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/me/preferences',
        headers: { cookie: viewer, origin: ORIGIN },
        payload: { pinnedVitals },
      });
      expect(res.statusCode).toBe(400);
    }
  });
});

describe('assigned items', () => {
  let itemId: string;
  beforeAll(async () => {
    itemId = (
      await app.db.item.create({ data: { kind: 'tool', name: 'Test drill', serial: 'TD-1' } })
    ).id;
  });

  it('cannot be changed by viewers', async () => {
    expect(
      (await post(`/api/items/${itemId}/assign`, viewer, { vehicle: SERIAL })).statusCode,
    ).toBe(403);
    expect((await get('/api/items/unassigned', viewer)).statusCode).toBe(403);
  });

  it('assign, move and remove, writing an Event on each vehicle touched', async () => {
    const unassigned = (await get('/api/items/unassigned', editor)).json().items;
    expect(unassigned.map((i: { id: string }) => i.id)).toContain(itemId);

    expect(
      (await post(`/api/items/${itemId}/assign`, editor, { vehicle: SERIAL })).statusCode,
    ).toBe(200);
    let detail = (await get(`/api/vehicles/${SERIAL}`, viewer)).json();
    expect(detail.items.map((i: { id: string }) => i.id)).toEqual([itemId]);
    expect(detail.items[0].assignedSince).toBeTruthy();

    expect((await post(`/api/items/${itemId}/assign`, editor, { vehicle: OTHER })).statusCode).toBe(
      200,
    );
    detail = (await get(`/api/vehicles/${SERIAL}`, viewer)).json();
    expect(detail.items).toEqual([]);

    expect((await post(`/api/items/${itemId}/remove`, editor)).statusCode).toBe(200);
    expect((await post(`/api/items/${itemId}/remove`, editor)).statusCode).toBe(409);

    const events = await app.db.event.findMany({
      where: { sourceId: itemId },
      orderBy: { createdAt: 'asc' },
      select: { type: true, vehicleId: true },
    });
    expect(events).toEqual([
      { type: 'ITEM_ASSIGNED', vehicleId },
      { type: 'ITEM_REMOVED', vehicleId },
      { type: 'ITEM_ASSIGNED', vehicleId: otherId },
      { type: 'ITEM_REMOVED', vehicleId: otherId },
    ]);
    const history = await app.db.itemAssignment.findMany({ where: { itemId } });
    expect(history).toHaveLength(2);
    expect(history.every((h) => h.removedAt)).toBe(true);
  });
});
