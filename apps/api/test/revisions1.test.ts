import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createUser, login, makeApp, ORIGIN } from './helpers';

// Revisions 1: the record report endpoint, the new fuel fields and the admin's mandatory switches.

let app: Awaited<ReturnType<typeof makeApp>>;
let admin: string;
let editor: string;
let viewer: string;
let seq = 0;
const DAY = 86_400_000;
const isoDay = (offset = 0) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);
const req = (
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  cookie: string,
  payload?: object,
) => app.inject({ method, url, headers: { cookie, origin: ORIGIN }, payload });

const NONE_REQUIRED = { place: false, fueledBy: false, fuelType: false, provider: false };
const setRequired = (fuelRequired: object, cookie = admin) =>
  req('PUT', '/api/settings/app', cookie, { fuelRequired });

async function vehicle() {
  const serial = `R1-${++seq}`;
  const type = await app.db.vehicleType.findUniqueOrThrow({ where: { code: 'r1_road' } });
  await app.db.vehicle.create({
    data: { serial, make: 'Test', model: 'Unit', typeId: type.id, odometerKm: 1_000 },
  });
  return serial;
}

beforeAll(async () => {
  app = await makeApp();
  admin = await login(app, await createUser(app, 'ADMIN'));
  editor = await login(app, await createUser(app, 'EDITOR'));
  viewer = await login(app, await createUser(app, 'VIEWER'));
  await app.db.vehicleType.create({
    data: { code: 'r1_road', nameEn: 'Road', nameHe: 'כביש', category: 'ROAD', usageUnit: 'KM' },
  });
  await app.db.fuelType.create({ data: { code: 'r1_diesel', nameEn: 'Diesel', nameHe: 'סולר' } });
});

afterAll(async () => {
  await setRequired(NONE_REQUIRED);
  await app.close();
});

describe('fuel details', () => {
  it('saves where, who, fuel type and provider, and returns the type as its code', async () => {
    const serial = await vehicle();
    const res = await req('POST', `/api/vehicles/${serial}/records/fuel`, editor, {
      date: isoDay(-1),
      liters: 50,
      place: 'Site North',
      fueledBy: 'Dana',
      fuelType: 'r1_diesel',
      provider: 'Tanker Co',
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().item).toMatchObject({
      place: 'Site North',
      fueledBy: 'Dana',
      fuelType: 'r1_diesel',
      provider: 'Tanker Co',
    });
    expect(res.json().item).not.toHaveProperty('fuelTypeId');

    const list = await req(
      'GET',
      `/api/vehicles/${serial}/records/fuel?fuelType=r1_diesel`,
      viewer,
    );
    expect(list.json().total).toBe(1);
    const search = await req('GET', `/api/vehicles/${serial}/records/fuel?q=tanker`, viewer);
    expect(search.json().total).toBe(1);
  });

  it('refuses an unknown fuel type', async () => {
    const serial = await vehicle();
    const res = await req('POST', `/api/vehicles/${serial}/records/fuel`, editor, {
      date: isoDay(-1),
      liters: 20,
      fuelType: 'nope',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().issues).toEqual([{ path: 'fuelType', code: 'unknown' }]);
  });

  it('suggests earlier places, user names and providers', async () => {
    const res = await req('GET', '/api/lookups/fuel-suggestions', viewer);
    expect(res.statusCode).toBe(200);
    expect(res.json().place).toContain('Site North');
    expect(res.json().provider).toContain('Tanker Co');
    expect(res.json().fueledBy.length).toBeGreaterThan(0);
  });
});

describe('mandatory fuel fields (admin setting)', () => {
  it('only admins change the setting; everyone reads it; each change is audited', async () => {
    expect((await setRequired({ ...NONE_REQUIRED, place: true }, editor)).statusCode).toBe(403);
    const saved = await setRequired({ ...NONE_REQUIRED, place: true, fuelType: true });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().fuelRequired).toMatchObject({ place: true, fuelType: true });
    const read = await req('GET', '/api/settings/app', viewer);
    expect(read.json().fuelRequired.place).toBe(true);
    const log = await app.db.auditLog.findFirst({
      where: { action: 'setting.changed', targetId: 'fuelRequired' },
      orderBy: { createdAt: 'desc' },
    });
    expect(log?.meta).toMatchObject({ after: { place: true, fuelType: true } });
  });

  it('refuses a fuel entry without a mandatory field, on add and on edit', async () => {
    await setRequired({ ...NONE_REQUIRED, place: true, fuelType: true });
    const serial = await vehicle();
    const url = `/api/vehicles/${serial}/records/fuel`;
    const missing = await req('POST', url, editor, { date: isoDay(-1), liters: 30, place: ' ' });
    expect(missing.statusCode).toBe(400);
    expect(missing.json().issues).toEqual([
      { path: 'place', code: 'required' },
      { path: 'fuelType', code: 'required' },
    ]);

    const ok = await req('POST', url, editor, {
      date: isoDay(-1),
      liters: 30,
      place: 'Depot',
      fuelType: 'r1_diesel',
    });
    expect(ok.statusCode).toBe(201);
    const id = ok.json().item.id;
    const edit = await req('PUT', `${url}/${id}`, editor, { date: isoDay(-1), liters: 31 });
    expect(edit.statusCode).toBe(400);

    await setRequired(NONE_REQUIRED);
    expect((await req('POST', url, editor, { date: isoDay(-1), liters: 5 })).statusCode).toBe(201);
  });
});

describe('record report', () => {
  it('returns the record and its history with who did each step', async () => {
    const serial = await vehicle();
    const url = `/api/vehicles/${serial}/records/malfunctions`;
    const created = await req('POST', url, editor, {
      reportedAt: isoDay(-2),
      severity: 'HIGH',
      state: 'OPEN',
      description: 'Hydraulic leak',
    });
    const id = created.json().item.id;
    await req('PUT', `${url}/${id}`, editor, {
      reportedAt: isoDay(-2),
      severity: 'HIGH',
      state: 'RESOLVED',
      description: 'Hydraulic leak',
      resolution: 'Replaced the hose',
    });

    const res = await req('GET', `${url}/${id}`, viewer);
    expect(res.statusCode).toBe(200);
    expect(res.json().item).toMatchObject({ resolution: 'Replaced the hose', state: 'RESOLVED' });
    const history = res.json().history as { type: string; by: string | null }[];
    expect(history.map((h) => h.type)).toEqual(['MALFUNCTION_REPORTED', 'MALFUNCTION_RESOLVED']);
    expect(history.every((h) => h.by)).toBe(true);
  });

  it('is 404 for a deleted record or one on another vehicle', async () => {
    const serial = await vehicle();
    const other = await vehicle();
    const url = `/api/vehicles/${serial}/records/notes`;
    const id = (await req('POST', url, editor, { body: 'Spare key in office' })).json().item.id;
    expect(
      (await req('GET', `/api/vehicles/${other}/records/notes/${id}`, viewer)).statusCode,
    ).toBe(404);
    await req('DELETE', `${url}/${id}`, editor);
    expect((await req('GET', `${url}/${id}`, viewer)).statusCode).toBe(404);
  });
});
