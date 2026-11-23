import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_APP_SETTINGS } from '@fleet-hub/shared';
import { createUser, login, makeApp, ORIGIN } from './helpers';

// Sagi, 2026-11-22: admins add fields to any card, and set who may edit each card and field,
// with a history of the changes; every entry shows who made it and who last changed it.

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

const settings = async () => (await req('GET', '/api/settings/app', viewer)).json();
const saveSettings = async (patch: object) =>
  req('PUT', '/api/settings/app', admin, { ...(await settings()), ...patch });

async function vehicle(type = 'pm_machine') {
  const serial = `PM-${++seq}`;
  const t = await app.db.vehicleType.findUniqueOrThrow({ where: { code: type } });
  await app.db.vehicle.create({
    data: { serial, make: 'Test', model: 'Unit', typeId: t.id, engineHours: 100 },
  });
  return serial;
}

beforeAll(async () => {
  app = await makeApp();
  admin = await login(app, await createUser(app, 'ADMIN'));
  editor = await login(app, await createUser(app, 'EDITOR'));
  viewer = await login(app, await createUser(app, 'VIEWER'));
  await app.db.vehicleType.create({
    data: {
      code: 'pm_machine',
      nameEn: 'Machine',
      nameHe: 'מכונה',
      category: 'EQUIPMENT',
      usageUnit: 'HOURS',
    },
  });
});

afterAll(async () => {
  await req('PUT', '/api/settings/app', admin, DEFAULT_APP_SETTINGS);
  await app.close();
});

describe('extra fields on every card', () => {
  it('services start with a service type list that leads the card', async () => {
    const s = await settings();
    expect(s.recordFields.service[0]).toMatchObject({ type: 'list', header: true });
    expect(s.recordFields.service[0].options.map((o: { code: string }) => o.code)).toEqual([
      'general',
      'electrical',
      'h1000',
      'system',
    ]);
  });

  it('keeps a chosen or typed value, and shows who added and changed it', async () => {
    const serial = await vehicle();
    const url = `/api/vehicles/${serial}/records/service`;
    // The service type also takes a value typed in the form (Sagi, 2026-11-23).
    const typed = await req('POST', url, editor, {
      date: isoDay(-1),
      description: 'Hydraulics',
      custom: { c1: 'Hydraulic service' },
    });
    expect(typed.statusCode).toBe(201);
    expect(typed.json().item.custom).toEqual({ c1: 'Hydraulic service' });

    const res = await req('POST', url, editor, {
      date: isoDay(-1),
      description: 'Oil and filters',
      custom: { c1: 'h1000' },
    });
    expect(res.statusCode).toBe(201);
    const id = res.json().item.id;
    expect(res.json().item.custom).toEqual({ c1: 'h1000' });

    // An edit that leaves `custom` out keeps the values.
    const edit = await req('PUT', `${url}/${id}`, admin, {
      date: isoDay(-1),
      description: 'Oil, filters and belts',
    });
    expect(edit.statusCode).toBe(200);
    const { item } = (await req('GET', `${url}/${id}`, viewer)).json();
    expect(item.custom).toEqual({ c1: 'h1000' });
    expect(item.createdBy).toBeTruthy();
    expect(item.updatedBy).toBeTruthy();
    expect(item.updatedBy).not.toBe(item.createdBy);
  });

  it('a list kept to its choices refuses a typed value', async () => {
    const s = await settings();
    const [type] = s.recordFields.service;
    await saveSettings({
      recordFields: { ...s.recordFields, service: [{ ...type, free: false }] },
    });
    const bad = await req('POST', `/api/vehicles/${await vehicle()}/records/service`, editor, {
      date: isoDay(-1),
      description: 'Oil and filters',
      custom: { c1: 'nope' },
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().issues).toContainEqual({ path: 'custom.c1', code: 'invalid' });
    await saveSettings({ recordFields: s.recordFields });
  });

  it('a field only admins may fill in keeps its value when an editor saves', async () => {
    const s = await settings();
    const fields = [
      ...s.recordFields.service,
      {
        key: 'c2',
        labelEn: 'Approved by',
        labelHe: 'אושר על ידי',
        type: 'text',
        editLevel: 'ADMIN',
      },
    ];
    expect(
      (await saveSettings({ recordFields: { ...s.recordFields, service: fields } })).statusCode,
    ).toBe(200);
    const serial = await vehicle();
    const url = `/api/vehicles/${serial}/records/service`;
    const forbidden = await req('POST', url, editor, {
      date: isoDay(-1),
      description: 'x',
      custom: { c2: 'Me' },
    });
    expect(forbidden.json().issues).toContainEqual({ path: 'custom.c2', code: 'forbidden' });
    const ok = await req('POST', url, admin, {
      date: isoDay(-1),
      description: 'x',
      custom: { c1: 'general', c2: 'Chief' },
    });
    const id = ok.json().item.id;
    const edit = await req('PUT', `${url}/${id}`, editor, {
      date: isoDay(-1),
      description: 'y',
      custom: { c1: 'electrical', c2: 'Chief' },
    });
    expect(edit.statusCode).toBe(200);
    expect(edit.json().item.custom).toEqual({ c1: 'electrical', c2: 'Chief' });
  });
});

describe('who may edit what', () => {
  it('only admins change permissions, and each change is in the history', async () => {
    const s = await settings();
    const next = { ...s.permissions, cards: { fluids: 'ADMIN', notes: 'EDITOR' } };
    expect(
      (await req('PUT', '/api/settings/app', editor, { ...s, permissions: next })).statusCode,
    ).toBe(403);
    expect((await saveSettings({ permissions: next })).statusCode).toBe(200);
    expect((await req('GET', '/api/settings/app/history?key=permissions', editor)).statusCode).toBe(
      403,
    );
    const history = (await req('GET', '/api/settings/app/history?key=permissions', admin)).json();
    expect(history.items[0]).toMatchObject({ after: next });
    expect(history.items[0].by).toBeTruthy();
  });

  it('a card set to admins refuses editors; one raised above viewers refuses them', async () => {
    const serial = await vehicle();
    await app.db.fluidType.upsert({
      where: { code: 'pm_oil' },
      create: { code: 'pm_oil', nameEn: 'Oil', nameHe: 'שמן' },
      update: {},
    });
    const fluid = { date: isoDay(-1), fluidType: 'pm_oil', liters: 2 };
    const url = `/api/vehicles/${serial}/records/fluids`;
    expect((await req('POST', url, editor, fluid)).statusCode).toBe(403);
    expect((await req('POST', url, admin, fluid)).statusCode).toBe(201);
    const notes = `/api/vehicles/${serial}/records/notes`;
    expect((await req('POST', notes, viewer, { body: 'hi' })).statusCode).toBe(403);
    expect((await req('POST', notes, editor, { body: 'hi' })).statusCode).toBe(201);
  });

  it('a vehicle field locked to admins can not be changed by an editor; the rest can', async () => {
    const s = await settings();
    await saveSettings({ permissions: { cards: {}, fields: { engineHours: 'ADMIN' } } });
    void s;
    const serial = await vehicle();
    const { values } = (await req('GET', `/api/vehicles/${serial}/form`, editor)).json();
    const put = (cookie: string, patch: object) =>
      req('PUT', `/api/vehicles/${serial}`, cookie, { ...values, ...patch });
    const locked = await put(editor, { engineHours: 999 });
    expect(locked.statusCode).toBe(400);
    expect(locked.json().issues).toContainEqual({ path: 'engineHours', code: 'locked' });
    expect((await put(editor, { operatorName: 'Fake operator' })).statusCode).toBe(200);
    expect((await put(admin, { engineHours: 999 })).statusCode).toBe(200);
  });

  it('a viewer given one vehicle field may open the form and change only that', async () => {
    await saveSettings({ permissions: { cards: {}, fields: { operatorName: 'VIEWER' } } });
    const serial = await vehicle();
    const form = await req('GET', `/api/vehicles/${serial}/form`, viewer);
    expect(form.statusCode).toBe(200);
    const { values } = form.json();
    const put = (patch: object) =>
      req('PUT', `/api/vehicles/${serial}`, viewer, { ...values, ...patch });
    expect((await put({ operatorName: 'Fake driver' })).statusCode).toBe(200);
    expect((await put({ model: 'Other' })).json().issues).toContainEqual({
      path: 'model',
      code: 'locked',
    });
    expect(
      (await req('POST', '/api/vehicles', viewer, { ...values, serial: 'PM-NEW' })).statusCode,
    ).toBe(403);
    await saveSettings({ permissions: { cards: {}, fields: {} } });
  });
});

describe('places typed in a form', () => {
  it('an editor adds one; the same name returns it; a viewer may not', async () => {
    const name = `Quarry ${Date.now()}`;
    const res = await req('POST', '/api/lookups/locations', editor, { name });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ nameEn: name, nameHe: name });
    const again = await req('POST', '/api/lookups/locations', editor, { name: name.toUpperCase() });
    expect(again.json().code).toBe(res.json().code);
    const hebrew = await req('POST', '/api/lookups/locations', editor, { name: 'מחצבה חדשה' });
    expect(hebrew.json().code).toMatch(/^loc_/);
    expect((await req('POST', '/api/lookups/locations', viewer, { name: 'X' })).statusCode).toBe(
      403,
    );
  });
});

describe('search finds documents and list choices', () => {
  it('a file on a record leads to its vehicle, a place to its list', async () => {
    const serial = await vehicle();
    const v = await app.db.vehicle.findUniqueOrThrow({ where: { serial } });
    const rec = await app.db.note.create({ data: { vehicleId: v.id, body: 'Paperwork' } });
    const stamp = Date.now();
    await app.db.attachment.create({
      data: {
        ownerType: 'Note',
        ownerId: rec.id,
        fileName: `invoice-${stamp}.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: 10,
        storagePath: 'x',
      },
    });
    await req('POST', '/api/lookups/locations', editor, { name: `Depot ${stamp}` });
    const { hits } = (await req('GET', `/api/search?q=${stamp}`, viewer)).json();
    expect(hits).toContainEqual(
      expect.objectContaining({ group: 'document', serial, kind: 'notes', id: rec.id }),
    );
    expect(hits).toContainEqual(
      expect.objectContaining({ group: 'option', kind: 'locations', text: `Depot ${stamp}` }),
    );
  });
});
