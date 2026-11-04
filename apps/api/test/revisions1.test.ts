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
    const progressUrl = `${url}/${id}/progress`;
    expect((await req('POST', progressUrl, viewer, { body: 'Hose ordered' })).statusCode).toBe(403);
    const added = await req('POST', progressUrl, editor, { body: 'Hose ordered' });
    expect(added.statusCode).toBe(201);
    await req('PUT', `${url}/${id}`, editor, {
      reportedAt: isoDay(-2),
      severity: 'HIGH',
      state: 'RESOLVED',
      description: 'Hydraulic leak',
    });

    const res = await req('GET', `${url}/${id}`, viewer);
    expect(res.statusCode).toBe(200);
    expect(res.json().item.state).toBe('RESOLVED');
    expect(res.json().item.progress).toMatchObject([{ body: 'Hose ordered' }]);
    expect(res.json().item.progress[0].createdBy).toBeTruthy();
    const history = res.json().history as { type: string; by: string | null }[];
    expect(history.map((h) => h.type)).toEqual([
      'MALFUNCTION_REPORTED',
      'MALFUNCTION_PROGRESS',
      'MALFUNCTION_RESOLVED',
    ]);
    expect(history.every((h) => h.by)).toBe(true);

    // Removing an update hides its timeline entry too.
    const progressId = added.json().progress[0].id;
    await req('DELETE', `${progressUrl}/${progressId}`, editor);
    const after = await req('GET', `${url}/${id}`, viewer);
    expect(after.json().item.progress).toEqual([]);
    expect(after.json().history.map((h: { type: string }) => h.type)).not.toContain(
      'MALFUNCTION_PROGRESS',
    );
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

describe('work cards and receipts', () => {
  it('links receipts of the same vehicle, and unlinks them when left out', async () => {
    const serial = await vehicle();
    const other = await vehicle();
    const vid = (await app.db.vehicle.findUniqueOrThrow({ where: { serial } })).id;
    const oid = (await app.db.vehicle.findUniqueOrThrow({ where: { serial: other } })).id;
    const receipt = (vehicleId: string) =>
      app.db.document.create({
        data: {
          date: new Date(),
          amount: 500,
          approvedAt: new Date(),
          vehicles: { create: { vehicleId } },
        },
      });
    const mine = await receipt(vid);
    const theirs = await receipt(oid);
    const url = `/api/vehicles/${serial}/records/workCards`;
    const card = {
      date: isoDay(-1),
      workType: 'ROUTINE',
      performedBy: 'IN_HOUSE',
      description: 'Greasing',
      receiptIds: [mine.id],
    };
    const bad = await req('POST', url, editor, { ...card, receiptIds: [theirs.id] });
    expect(bad.statusCode).toBe(400);
    const res = await req('POST', url, editor, card);
    expect(res.statusCode).toBe(201);
    expect(res.json().item.receipts).toMatchObject([{ id: mine.id, amount: 500 }]);

    const id = res.json().item.id;
    await req('PUT', `${url}/${id}`, editor, { ...card, receiptIds: [] });
    const doc = await app.db.document.findUniqueOrThrow({ where: { id: mine.id } });
    expect(doc.linkedRecordId).toBeNull();
  });

  it('filters contracted work', async () => {
    const serial = await vehicle();
    const url = `/api/vehicles/${serial}/records/workCards`;
    const base = { date: isoDay(-1), workType: 'MECHANICAL', description: 'Fix' };
    await req('POST', url, editor, { ...base, performedBy: 'IN_HOUSE' });
    await req('POST', url, editor, { ...base, performedBy: 'CONTRACTED', doneBy: 'Garage' });
    const list = await req('GET', `${url}?performedBy=CONTRACTED`, viewer);
    expect(list.json().items.map((i: { doneBy: string }) => i.doneBy)).toEqual(['Garage']);
  });
});

describe('excavator tool', () => {
  it('changes the tool on excavators only, and logs the change', async () => {
    await app.db.vehicleType.upsert({
      where: { code: 'tracked_excavator' },
      update: {},
      create: {
        code: 'tracked_excavator',
        nameEn: 'Excavator',
        nameHe: 'מחפר',
        category: 'EQUIPMENT',
        usageUnit: 'HOURS',
      },
    });
    const type = await app.db.vehicleType.findUniqueOrThrow({
      where: { code: 'tracked_excavator' },
    });
    const ex = await app.db.vehicle.create({
      data: { serial: `R1-EX-${++seq}`, make: 'Test', model: 'Dig', typeId: type.id },
    });
    const url = `/api/vehicles/${ex.serial}/tool`;
    expect((await req('PUT', url, viewer, { tool: 'hammer' })).statusCode).toBe(403);
    expect((await req('PUT', url, editor, { tool: 'hammer' })).statusCode).toBe(200);
    const e = await app.db.event.findFirst({ where: { vehicleId: ex.id, type: 'TOOL_CHANGED' } });
    expect(e?.params).toEqual({ from: 'bucket', to: 'hammer' });

    const road = await vehicle();
    expect(
      (await req('PUT', `/api/vehicles/${road}/tool`, editor, { tool: 'hammer' })).statusCode,
    ).toBe(400);
  });
});

describe('company logo', () => {
  // A 1×1 transparent PNG.
  const PNG =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

  it('lets admins set and remove it, and every user read it', async () => {
    expect((await req('PUT', '/api/settings/logo', editor, { dataUrl: PNG })).statusCode).toBe(403);
    expect((await req('PUT', '/api/settings/logo', admin, { dataUrl: PNG })).statusCode).toBe(200);
    const got = await req('GET', '/api/settings/logo', viewer);
    expect(got.statusCode).toBe(200);
    expect(got.headers['content-type']).toBe('image/png');
    expect(got.rawPayload.subarray(1, 4).toString()).toBe('PNG');
    // The logo never shows up in the general settings.
    expect(Object.keys((await req('GET', '/api/settings/app', viewer)).json())).toEqual([
      'fuelRequired',
    ]);
    expect((await req('DELETE', '/api/settings/logo', admin)).statusCode).toBe(200);
    expect((await req('GET', '/api/settings/logo', viewer)).statusCode).toBe(404);
  });

  it('refuses SVG and anything that is not an image', async () => {
    const svg = `data:image/svg+xml;base64,${Buffer.from('<svg/>').toString('base64')}`;
    expect((await req('PUT', '/api/settings/logo', admin, { dataUrl: svg })).statusCode).toBe(400);
    expect(
      (await req('PUT', '/api/settings/logo', admin, { dataUrl: 'javascript:alert(1)' }))
        .statusCode,
    ).toBe(400);
  });
});
