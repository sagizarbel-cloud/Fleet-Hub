import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_FLEET_VIEW } from '@fleet-hub/shared';
import { encryptStartCode } from '@fleet-hub/shared/crypto';
import { createUser, login, makeApp, ORIGIN } from './helpers';

let app: Awaited<ReturnType<typeof makeApp>>;
let admin: string;
let editor: string;
let viewer: string;
let vehicleId: string;
const DAY = 24 * 60 * 60 * 1000;
const SERIAL = 'FT-001';
const CODE = '4711';

const get = (url: string, cookie: string) =>
  app.inject({ method: 'GET', url, headers: { cookie } });
const send = (method: 'POST' | 'PUT' | 'DELETE', url: string, cookie: string, payload?: object) =>
  app.inject({ method, url, headers: { cookie, origin: ORIGIN }, payload });
const row = async (cookie = viewer) =>
  (await get('/api/fleet/table', cookie))
    .json()
    .rows.find((r: { serial: string }) => r.serial === SERIAL);

beforeAll(async () => {
  app = await makeApp();
  admin = await login(app, await createUser(app, 'ADMIN'));
  editor = await login(app, await createUser(app, 'EDITOR'));
  viewer = await login(app, await createUser(app, 'VIEWER'));
  const type = await app.db.vehicleType.create({
    data: {
      code: 'fleet_test',
      nameEn: 'Fleet',
      nameHe: 'צי',
      category: 'ROAD',
      usageUnit: 'KM',
    },
  });
  vehicleId = (
    await app.db.vehicle.create({
      data: {
        serial: SERIAL,
        make: 'Test',
        model: 'T',
        typeId: type.id,
        odometerKm: 12_000,
        hasStartCode: true,
        startCodeEnc: encryptStartCode(CODE, process.env.FLEET_CODE_KEY!),
      },
    })
  ).id;
});
afterAll(async () => {
  await app.close();
});

describe('fleet table', () => {
  it('requires a session', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/fleet/table' })).statusCode).toBe(401);
  });

  it('never includes the start code or its flag, in the table or the export', async () => {
    const table = await get('/api/fleet/table', viewer);
    expect(table.body).not.toContain(CODE);
    expect(table.body).not.toMatch(/startCode/i);
    const r = await row();
    expect(r).not.toHaveProperty('hasStartCode');
    const notes = await get('/api/fleet/records/notes', viewer);
    expect(notes.body).not.toMatch(/startCode/i);
  });

  it('computes costs over 12 and 3 months, counts and the latest service and fill-up', async () => {
    const now = Date.now();
    const at = (days: number) => new Date(now - days * DAY);
    await app.db.serviceRecord.createMany({
      data: [
        { vehicleId, date: at(10), description: 'recent', cost: 100 },
        { vehicleId, date: at(200), description: 'older', cost: 300 },
        { vehicleId, date: at(400), description: 'too old', cost: 5_000 },
        { vehicleId, date: at(5), description: 'deleted', cost: 9_000, deletedAt: new Date() },
      ],
    });
    await app.db.malfunction.create({
      data: { vehicleId, reportedAt: at(20), severity: 'LOW', description: 'open', cost: 50 },
    });
    await app.db.fuelEntry.createMany({
      data: [
        { vehicleId, date: at(25), liters: 50, odometerKm: 12_000, cost: 400 },
        { vehicleId, date: at(15), liters: 40, odometerKm: 12_400, cost: 320 },
        { vehicleId, date: at(120), liters: 60, odometerKm: 11_000, cost: 480 },
      ],
    });
    const r = await row();
    expect(r.costs).toEqual({
      maintenance12m: 450,
      fuel12m: 1_200,
      total12m: 1_650,
      maintenance3m: 150,
      fuel3m: 720,
      total3m: 870,
    });
    expect(r.openIssues).toBe(1);
    expect(r.services12m).toBe(2);
    expect(new Date(r.lastService).getTime()).toBe(at(10).getTime());
    expect(r.lastFuel.liters).toBe(40);
    // 400 km on the 40 L of the second fill-up in the last 30 days
    expect(r.economy30).toBe(10);
    expect(r.usageUnit).toBe('KM');
  });

  it('exports every record of a kind across the fleet, with the serial', async () => {
    const res = await get('/api/fleet/records/service', viewer);
    expect(res.statusCode).toBe(200);
    const mine = res.json().items.filter((r: { serial: string }) => r.serial === SERIAL);
    expect(mine.map((r: { description: string }) => r.description).sort()).toEqual([
      'older',
      'recent',
      'too old',
    ]);
    expect((await get('/api/fleet/records/bogus', viewer)).statusCode).toBe(400);
  });
});

describe('saved views', () => {
  const settings = { ...DEFAULT_FLEET_VIEW, q: 'cat', groupBy: 'type' as const };

  it('anyone may save one; everyone sees it; only its creator or an admin changes it', async () => {
    const created = await send('POST', '/api/fleet/views', viewer, { name: 'Cats', settings });
    expect(created.statusCode).toBe(201);
    const view = created.json();
    expect(view).toMatchObject({ name: 'Cats', canEdit: true, createdBy: 'Test VIEWER' });

    const seen = (await get('/api/fleet/views', editor)).json().items;
    expect(seen.find((v: { id: string }) => v.id === view.id)).toMatchObject({
      canEdit: false,
      settings,
    });

    const body = { name: 'Big cats', settings };
    expect((await send('PUT', `/api/fleet/views/${view.id}`, editor, body)).statusCode).toBe(403);
    expect((await send('PUT', `/api/fleet/views/${view.id}`, viewer, body)).json().name).toBe(
      'Big cats',
    );
    expect((await send('PUT', `/api/fleet/views/${view.id}`, admin, body)).statusCode).toBe(200);
    expect((await send('DELETE', `/api/fleet/views/${view.id}`, editor)).statusCode).toBe(403);
    expect((await send('DELETE', `/api/fleet/views/${view.id}`, admin)).statusCode).toBe(204);
    expect((await send('DELETE', `/api/fleet/views/${view.id}`, admin)).statusCode).toBe(404);
  });

  it('validates the settings', async () => {
    const bad = await send('POST', '/api/fleet/views', viewer, {
      name: 'Bad',
      settings: { ...settings, columns: ['type', 'startCode'] },
    });
    expect(bad.statusCode).toBe(400);
    const dup = await send('POST', '/api/fleet/views', viewer, {
      name: 'Dup',
      settings: { ...settings, columns: ['type', 'type'] },
    });
    expect(dup.statusCode).toBe(400);
    const blank = await send('POST', '/api/fleet/views', viewer, { name: ' ', settings });
    expect(blank.statusCode).toBe(400);
  });

  it('remembers the default view per user, and forgets it when the view is deleted', async () => {
    const view = (
      await send('POST', '/api/fleet/views', editor, { name: 'Mine', settings })
    ).json();
    const set = await send('PUT', '/api/me/preferences', viewer, { fleetViewId: view.id });
    expect(set.json().fleetViewId).toBe(view.id);
    expect((await get('/api/me/preferences', viewer)).json().fleetViewId).toBe(view.id);
    expect((await get('/api/me/preferences', editor)).json().fleetViewId).toBeNull();
    expect(
      (await send('PUT', '/api/me/preferences', viewer, { fleetViewId: 'nope' })).statusCode,
    ).toBe(404);

    await send('DELETE', `/api/fleet/views/${view.id}`, editor);
    expect((await get('/api/me/preferences', viewer)).json().fleetViewId).toBeNull();
  });
});
