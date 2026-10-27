import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { RECORD_KINDS, type RecordKind } from '@fleet-hub/shared';
import { encryptStartCode } from '@fleet-hub/shared/crypto';
import { sweepStatuses } from '../src/lib/status';
import { cleanFileName, resolveStored } from '../src/lib/uploads';
import { createUser, login, makeApp, ORIGIN } from './helpers';

let app: Awaited<ReturnType<typeof makeApp>>;
let uploadDir: string;
let admin: string;
let editor: string;
let viewer: string;
let viewer2: string;
let viewerId: string;
const DAY = 86_400_000;
const PLAIN = '7391';
let seq = 0;

type Json = Record<string, unknown>;
const headers = (cookie: string) => ({ cookie, origin: ORIGIN });
const req = (
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  cookie: string,
  payload?: object,
) => app.inject({ method, url, headers: headers(cookie), payload });
const isoDay = (offsetDays = 0) =>
  new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);

/** A fresh vehicle per test, so status checks don't interfere. */
async function vehicle(opts: { equipment?: boolean; extra?: Json } = {}) {
  const serial = `RT-${++seq}`;
  const type = await app.db.vehicleType.findUniqueOrThrow({
    where: { code: opts.equipment ? 'rt_machine' : 'rt_road' },
  });
  const v = await app.db.vehicle.create({
    data: {
      serial,
      make: 'Test',
      model: 'Unit',
      typeId: type.id,
      odometerKm: 1_000,
      engineHours: 100,
      ...opts.extra,
    },
  });
  return { serial, id: v.id };
}
const status = async (id: string) =>
  (await app.db.vehicle.findUniqueOrThrow({ where: { id } })).status;
const events = (vehicleId: string) =>
  app.db.event.findMany({ where: { vehicleId }, orderBy: { createdAt: 'asc' } });

const SAMPLES: { [K in RecordKind]: Json } = {
  service: {
    date: isoDay(-3),
    odometerKm: 1_200,
    description: 'Oil change',
    vendor: 'Garage',
    cost: 450,
  },
  malfunctions: {
    reportedAt: isoDay(-2),
    severity: 'LOW',
    state: 'OPEN',
    isAccident: false,
    description: 'Mirror cracked',
  },
  fluids: { date: isoDay(-1), fluidType: 'rt_oil', liters: 4 },
  fuel: { date: isoDay(-1), liters: 60, odometerKm: 1_500, cost: 440 },
  movements: { date: isoDay(-1), fromLocation: 'rt_a', toLocation: 'rt_b' },
  inspections: { kind: 'SAFETY_CHECK', date: isoDay(-5), validUntil: isoDay(300), passed: true },
  notes: { body: 'Keys are in the office' },
};
const CREATE_TYPE: Record<RecordKind, string> = {
  service: 'SERVICE',
  malfunctions: 'MALFUNCTION_REPORTED',
  fluids: 'FLUID_ADDED',
  fuel: 'FUEL_ADDED',
  movements: 'MOVEMENT',
  inspections: 'INSPECTION',
  notes: 'NOTE_ADDED',
};

beforeAll(async () => {
  uploadDir = await mkdtemp(path.join(tmpdir(), 'fh-uploads-'));
  process.env.UPLOAD_DIR = uploadDir;
  process.env.UPLOAD_MAX_MB = '1';
  app = await makeApp();
  admin = await login(app, await createUser(app, 'ADMIN'));
  editor = await login(app, await createUser(app, 'EDITOR'));
  const viewerEmail = await createUser(app, 'VIEWER');
  viewer = await login(app, viewerEmail);
  viewerId = (await app.db.user.findUniqueOrThrow({ where: { email: viewerEmail } })).id;
  viewer2 = await login(app, await createUser(app, 'VIEWER'));

  await app.db.vehicleType.createMany({
    data: [
      { code: 'rt_road', nameEn: 'Road', nameHe: 'כביש', category: 'ROAD', usageUnit: 'KM' },
      {
        code: 'rt_machine',
        nameEn: 'Machine',
        nameHe: 'מכונה',
        category: 'EQUIPMENT',
        usageUnit: 'HOURS',
      },
    ],
  });
  await app.db.location.createMany({
    data: [
      { code: 'rt_a', nameEn: 'A', nameHe: 'א' },
      { code: 'rt_b', nameEn: 'B', nameHe: 'ב' },
    ],
  });
  await app.db.fluidType.create({ data: { code: 'rt_oil', nameEn: 'Oil', nameHe: 'שמן' } });
});

afterAll(async () => {
  await app.close();
  await rm(uploadDir, { recursive: true, force: true });
});

describe('status rules (SPEC A7)', () => {
  const malfunction = (serial: string, severity: string, state = 'OPEN') =>
    req('POST', `/api/vehicles/${serial}/records/malfunctions`, editor, {
      ...SAMPLES.malfunctions,
      severity,
      state,
    });

  it('a critical open malfunction makes a vehicle red, and resolving it makes it green again', async () => {
    const v = await vehicle();
    const res = await malfunction(v.serial, 'CRITICAL');
    expect(res.statusCode).toBe(201);
    expect(res.json().status).toBe('RED');
    expect(await status(v.id)).toBe('RED');
    const changed = (await events(v.id)).filter((e) => e.type === 'STATUS_CHANGED');
    expect(changed.map((e) => e.params)).toEqual([{ from: 'GREEN', to: 'RED' }]);

    const id = res.json().item.id;
    const fixed = await req('PUT', `/api/vehicles/${v.serial}/records/malfunctions/${id}`, editor, {
      ...SAMPLES.malfunctions,
      severity: 'CRITICAL',
      state: 'RESOLVED',
    });
    expect(fixed.statusCode).toBe(200);
    expect(fixed.json().item.resolvedAt).toBeTruthy();
    expect(await status(v.id)).toBe('GREEN');
    expect((await events(v.id)).map((e) => e.type)).toContain('MALFUNCTION_RESOLVED');
  });

  it('an in-progress critical malfunction is still red', async () => {
    const v = await vehicle();
    await malfunction(v.serial, 'CRITICAL', 'IN_PROGRESS');
    expect(await status(v.id)).toBe('RED');
  });

  it('any other open malfunction makes it amber; deleting it makes it green, Undo amber again', async () => {
    const v = await vehicle();
    const res = await malfunction(v.serial, 'HIGH');
    expect(await status(v.id)).toBe('AMBER');
    const id = res.json().item.id;
    const url = `/api/vehicles/${v.serial}/records/malfunctions/${id}`;
    expect((await req('DELETE', url, editor)).json().status).toBe('GREEN');
    expect((await req('POST', `${url}/restore`, editor)).json().status).toBe('AMBER');
  });

  it('a critical malfunction outranks an amber one', async () => {
    const v = await vehicle();
    await malfunction(v.serial, 'MEDIUM');
    await malfunction(v.serial, 'CRITICAL');
    expect(await status(v.id)).toBe('RED');
  });

  it.each(['ANNUAL_TEST', 'INSURANCE'])(
    'an expired %s makes it red until a new one is logged',
    async (kind) => {
      const v = await vehicle();
      const url = `/api/vehicles/${v.serial}/records/inspections`;
      const old = await req('POST', url, editor, {
        kind,
        date: isoDay(-400),
        validUntil: isoDay(-35),
        passed: true,
      });
      expect(old.json().status).toBe('RED');
      const field = kind === 'ANNUAL_TEST' ? 'annualTestExpiry' : 'insuranceExpiry';
      const row = await app.db.vehicle.findUniqueOrThrow({ where: { id: v.id } });
      expect(row[field]?.toISOString().slice(0, 10)).toBe(isoDay(-35));

      const renewed = await req('POST', url, editor, {
        kind,
        date: isoDay(-1),
        validUntil: isoDay(364),
        passed: true,
      });
      expect(renewed.json().status).toBe('GREEN');
    },
  );

  it('an expired safety check alone does not change the colour', async () => {
    const v = await vehicle({ equipment: true });
    const res = await req('POST', `/api/vehicles/${v.serial}/records/inspections`, editor, {
      kind: 'SAFETY_CHECK',
      date: isoDay(-400),
      validUntil: isoDay(-10),
    });
    expect(res.json().status).toBe('GREEN');
  });

  it('the hourly check turns a vehicle red once its annual test runs out', async () => {
    const v = await vehicle({ extra: { annualTestExpiry: new Date(Date.now() + DAY) } });
    await sweepStatuses(app);
    expect(await status(v.id)).toBe('GREEN');
    await sweepStatuses(app, new Date(Date.now() + 2 * DAY));
    expect(await status(v.id)).toBe('RED');
    const e = (await events(v.id)).find((x) => x.type === 'STATUS_CHANGED');
    expect(e?.params).toEqual({ from: 'GREEN', to: 'RED' });
    expect(e?.userId).toBeNull();
  });

  it('an admin override wins and is logged; clearing it goes back to the derived colour', async () => {
    const v = await vehicle();
    await malfunction(v.serial, 'MEDIUM');
    const url = `/api/vehicles/${v.serial}/status-override`;
    expect(
      (await req('PUT', url, editor, { mode: 'set', status: 'GREEN', reason: 'x' })).statusCode,
    ).toBe(403);
    expect((await req('PUT', url, admin, { mode: 'set', status: 'GREEN' })).statusCode).toBe(400);

    const set = await req('PUT', url, admin, {
      mode: 'set',
      status: 'GREEN',
      reason: 'Spare part fitted',
    });
    expect(set.json()).toEqual({ status: 'GREEN', override: 'GREEN' });
    // A new critical malfunction doesn't beat the override.
    await malfunction(v.serial, 'CRITICAL');
    expect(await status(v.id)).toBe('GREEN');

    const cleared = await req('PUT', url, admin, { mode: 'clear' });
    expect(cleared.json()).toEqual({ status: 'RED', override: null });
    const logged = (await events(v.id)).filter((e) => e.type === 'STATUS_OVERRIDDEN');
    expect(logged.map((e) => e.params)).toEqual([
      { to: 'GREEN', reason: 'Spare part fitted' },
      { to: 'RED', cleared: true },
    ]);
    const row = await app.db.vehicle.findUniqueOrThrow({ where: { id: v.id } });
    expect(row.statusOverrideReason).toBeNull();
  });
});

describe('records', () => {
  it.each(RECORD_KINDS)(
    '%s: add, list, edit, delete and Undo, each with its event',
    async (kind) => {
      const v = await vehicle();
      const base = `/api/vehicles/${v.serial}/records/${kind}`;
      const created = await req('POST', base, editor, SAMPLES[kind]);
      expect(created.statusCode, created.body).toBe(201);
      const item = created.json().item;

      const first = (await events(v.id)).find((e) => e.type === CREATE_TYPE[kind]);
      expect(first).toMatchObject({ sourceId: item.id });

      const list = await req('GET', base, viewer);
      expect(list.json()).toMatchObject({ total: 1, nextOffset: null });
      expect(list.json().items[0]).toMatchObject({
        id: item.id,
        createdBy: 'Test EDITOR',
        attachments: [],
      });

      const edited = await req('PUT', `${base}/${item.id}`, editor, SAMPLES[kind]);
      expect(edited.statusCode, edited.body).toBe(200);
      const after = await events(v.id);
      expect(after.map((e) => e.type)).toContain('RECORD_EDITED');

      expect((await req('DELETE', `${base}/${item.id}`, editor)).statusCode).toBe(200);
      expect((await req('GET', base, viewer)).json().total).toBe(0);
      const feed = await req('GET', `/api/events?vehicle=${v.serial}`, viewer);
      const types = feed.json().items.map((e: Json) => e.type);
      expect(types).not.toContain(CREATE_TYPE[kind]);
      expect(types).toContain('RECORD_DELETED');
      expect((await req('DELETE', `${base}/${item.id}`, editor)).statusCode).toBe(409);

      expect((await req('POST', `${base}/${item.id}/restore`, editor)).statusCode).toBe(200);
      expect((await req('GET', base, viewer)).json().total).toBe(1);
      const back = (await req('GET', `/api/events?vehicle=${v.serial}`, viewer)).json();
      expect(back.items.map((e: Json) => e.type)).toEqual(
        expect.arrayContaining([CREATE_TYPE[kind], 'RECORD_DELETED', 'RECORD_RESTORED']),
      );
    },
  );

  it('an edit updates the record’s own timeline entry', async () => {
    const v = await vehicle();
    const base = `/api/vehicles/${v.serial}/records/fuel`;
    const { item } = (await req('POST', base, editor, SAMPLES.fuel)).json();
    await req('PUT', `${base}/${item.id}`, editor, { ...SAMPLES.fuel, liters: 75 });
    const e = (await events(v.id)).find((x) => x.type === 'FUEL_ADDED');
    expect(e?.params).toEqual({ liters: 75 });
  });

  it('viewers can read and add notes, and change only their own', async () => {
    const v = await vehicle();
    const base = `/api/vehicles/${v.serial}/records`;
    expect((await req('POST', `${base}/service`, viewer, SAMPLES.service)).statusCode).toBe(403);
    expect((await req('GET', `${base}/service`, viewer)).statusCode).toBe(200);

    const mine = await req('POST', `${base}/notes`, viewer, SAMPLES.notes);
    expect(mine.statusCode).toBe(201);
    const id = mine.json().item.id;
    expect(mine.json().item.createdById).toBe(viewerId);
    expect((await req('PUT', `${base}/notes/${id}`, viewer, { body: 'Updated' })).statusCode).toBe(
      200,
    );
    expect((await req('PUT', `${base}/notes/${id}`, viewer2, { body: 'Nope' })).statusCode).toBe(
      403,
    );
    expect((await req('DELETE', `${base}/notes/${id}`, viewer2)).statusCode).toBe(403);
    expect((await req('DELETE', `${base}/notes/${id}`, editor)).statusCode).toBe(200);

    const theirs = (await req('POST', `${base}/notes`, editor, SAMPLES.notes)).json().item.id;
    expect((await req('DELETE', `${base}/notes/${theirs}`, viewer)).statusCode).toBe(403);
    expect((await req('GET', `${base}/notes?mine=1`, viewer)).json().total).toBe(0);
  });

  it('rejects bad input with the field that failed', async () => {
    const v = await vehicle();
    const base = `/api/vehicles/${v.serial}/records`;
    const cases: [RecordKind, Json, string][] = [
      ['service', { ...SAMPLES.service, description: '' }, 'description'],
      ['service', { ...SAMPLES.service, date: isoDay(5) }, 'date'],
      ['fuel', { ...SAMPLES.fuel, liters: 0 }, 'liters'],
      ['fluids', { ...SAMPLES.fluids, fluidType: 'nope' }, 'fluidType'],
      ['movements', { ...SAMPLES.movements, toLocation: 'rt_a' }, 'toLocation'],
      ['inspections', { ...SAMPLES.inspections, validUntil: isoDay(-10) }, 'validUntil'],
      ['malfunctions', { ...SAMPLES.malfunctions, severity: 'SEVERE' }, 'severity'],
    ];
    for (const [kind, body, field] of cases) {
      const res = await req('POST', `${base}/${kind}`, editor, body);
      expect(res.statusCode, `${kind} ${field}`).toBe(400);
      expect(res.json().issues.map((i: Json) => i.path)).toContain(field);
    }
    expect((await req('POST', `${base}/tyres`, editor, {})).statusCode).toBe(400);
    expect((await req('GET', `/api/vehicles/NOPE/records/service`, editor)).statusCode).toBe(404);
    expect(await app.db.serviceRecord.count({ where: { vehicleId: v.id } })).toBe(0);
  });

  it('records keep the vehicle’s usage, location, next service and expiries up to date', async () => {
    const v = await vehicle();
    const base = `/api/vehicles/${v.serial}/records`;
    await req('POST', `${base}/fuel`, editor, { ...SAMPLES.fuel, odometerKm: 2_400 });
    // A lower reading is kept on the record but never winds the odometer back.
    await req('POST', `${base}/service`, editor, {
      ...SAMPLES.service,
      odometerKm: 2_000,
      nextServiceKm: 12_000,
      nextServiceDate: isoDay(90),
    });
    await req('POST', `${base}/movements`, editor, { ...SAMPLES.movements, date: isoDay(-2) });
    await req('POST', `${base}/movements`, editor, {
      date: isoDay(-1),
      fromLocation: 'rt_b',
      toLocation: 'rt_a',
    });
    await req('POST', `${base}/inspections`, editor, SAMPLES.inspections);
    const row = await app.db.vehicle.findUniqueOrThrow({
      where: { id: v.id },
      include: { location: true },
    });
    expect(row.odometerKm).toBe(2_400);
    expect(row.nextServiceKm).toBe(12_000);
    expect(row.nextServiceDate?.toISOString().slice(0, 10)).toBe(isoDay(90));
    expect(row.location?.code).toBe('rt_a');
    expect(row.safetyCheckExpiry?.toISOString().slice(0, 10)).toBe(isoDay(300));
  });

  it('sorts, filters, searches and pages', async () => {
    const v = await vehicle();
    const base = `/api/vehicles/${v.serial}/records/malfunctions`;
    for (const [severity, state, description, ago] of [
      ['LOW', 'RESOLVED', 'Wiper noise', -9],
      ['HIGH', 'OPEN', 'Hydraulic leak', -5],
      ['MEDIUM', 'IN_PROGRESS', 'Seat broken', -1],
    ] as const) {
      await req('POST', base, editor, {
        ...SAMPLES.malfunctions,
        severity,
        state,
        description,
        reportedAt: isoDay(ago),
      });
    }
    const get = async (qs: string) => (await req('GET', `${base}?${qs}`, viewer)).json();
    expect((await get('')).items.map((m: Json) => m.description)).toEqual([
      'Seat broken',
      'Hydraulic leak',
      'Wiper noise',
    ]);
    expect((await get('sort=severity&dir=desc')).items[0].severity).toBe('HIGH');
    expect((await get('state=OPEN')).total).toBe(1);
    expect((await get('q=hydraul')).items[0].description).toBe('Hydraulic leak');
    expect((await get(`from=${isoDay(-6)}&to=${isoDay(-2)}`)).total).toBe(1);
    const page = await get('limit=2');
    expect(page).toMatchObject({ total: 3, nextOffset: 2 });
    expect((await get('limit=2&offset=2')).items).toHaveLength(1);
    expect((await get('sort=nonsense')).items).toHaveLength(3);
  });

  it('fuel rows carry their economy and the sudden-drop flag', async () => {
    const v = await vehicle({ equipment: true });
    const base = `/api/vehicles/${v.serial}/records/fuel`;
    // 5 L/h for four fill-ups, then 8 L/h: a sudden drop.
    const fills = [100, 100, 100, 100, 160];
    for (const [i, liters] of fills.entries()) {
      await req('POST', base, editor, {
        date: isoDay(i - 10),
        liters,
        engineHours: 100 + i * 20,
        odometerKm: null,
      });
    }
    const all = (await req('GET', base, viewer)).json().items;
    expect(all[0]).toMatchObject({ economy: 8, baseline: 5, drop: true });
    expect(all.at(-1)).toMatchObject({ economy: null, drop: false });
    expect((await req('GET', `${base}?drops=1`, viewer)).json().total).toBe(1);
    const chart = (await req('GET', `/api/vehicles/${v.serial}/fuel-economy`, viewer)).json();
    expect(chart.unit).toBe('HOURS');
    expect(chart.points).toHaveLength(4);
  });
});

describe('ownership, documents and quotes', () => {
  it('editors update ownership, which logs which fields changed', async () => {
    const v = await vehicle();
    const supplier = await app.db.supplier.create({ data: { name: 'Fake Dealer Ltd' } });
    const url = `/api/vehicles/${v.serial}/ownership`;
    const body = {
      purchaseDate: isoDay(-700),
      supplierId: supplier.id,
      purchasePrice: 350_000,
      warrantyTerms: '24 months',
      warrantyExpiry: isoDay(30),
    };
    expect((await req('PUT', url, viewer, body)).statusCode).toBe(403);
    const res = await req('PUT', url, editor, body);
    expect(res.json().changed).toHaveLength(5);
    expect((await req('PUT', url, editor, body)).json().changed).toEqual([]);
    const got = (await req('GET', url, viewer)).json();
    expect(got).toMatchObject({ purchasePrice: 350_000, supplier: { name: 'Fake Dealer Ltd' } });
    const e = (await events(v.id)).filter((x) => x.type === 'VEHICLE_UPDATED');
    expect(e).toHaveLength(1);
  });

  it('lists the vehicle’s documents and only the quotes the user may see', async () => {
    const v = await vehicle();
    const supplier = await app.db.supplier.create({ data: { name: 'Parts Co' } });
    const viewerRow = await app.db.user.findUniqueOrThrow({ where: { id: viewerId } });
    const otherId = (await app.db.user.findFirstOrThrow({ where: { NOT: { id: viewerId } } })).id;
    await app.db.document.create({
      data: {
        date: new Date(),
        vendor: 'Tyre shop',
        amount: 900,
        vehicles: { create: { vehicleId: v.id } },
      },
    });
    for (const visibility of ['PUBLIC', 'STANDARD', 'ADMINS'] as const) {
      await app.db.quote.create({
        data: {
          supplierId: supplier.id,
          date: new Date(),
          visibility,
          createdById: visibility === 'PUBLIC' ? otherId : viewerRow.id,
          lines: { create: [{ item: 'Filter', quantity: 2, unitPrice: 50 }] },
          vehicles: { create: { vehicleId: v.id } },
        },
      });
    }
    const docs = (await req('GET', `/api/vehicles/${v.serial}/documents`, viewer2)).json();
    expect(docs.items).toEqual([expect.objectContaining({ vendor: 'Tyre shop', amount: 900 })]);
    const quotes = async (cookie: string) =>
      (await req('GET', `/api/vehicles/${v.serial}/quotes`, cookie)).json().items.length;
    expect(await quotes(viewer2)).toBe(1); // public only
    // Public, plus both of their own: creators keep sight of an admins-only quote (2026-10-27).
    expect(await quotes(viewer)).toBe(3);
    expect(await quotes(admin)).toBe(3);
    const first = (await req('GET', `/api/vehicles/${v.serial}/quotes`, admin)).json().items[0];
    expect(first.total).toBe(100);
  });

  it('no record, export or ownership response ever carries a start code', async () => {
    const v = await vehicle({
      extra: {
        hasStartCode: true,
        startCodeEnc: encryptStartCode(PLAIN, process.env.FLEET_CODE_KEY!),
      },
    });
    for (const kind of RECORD_KINDS)
      await req('POST', `/api/vehicles/${v.serial}/records/${kind}`, editor, SAMPLES[kind]);
    const urls = [
      ...RECORD_KINDS.map((k) => `/api/vehicles/${v.serial}/records/${k}?all=1`),
      `/api/vehicles/${v.serial}/ownership`,
      `/api/vehicles/${v.serial}/documents`,
      `/api/vehicles/${v.serial}/quotes`,
      `/api/vehicles/${v.serial}/fuel-economy`,
    ];
    for (const url of urls) {
      const res = await req('GET', url, admin);
      expect(res.statusCode, url).toBe(200);
      expect(res.body, url).not.toContain(PLAIN);
      expect(res.body, url).not.toMatch(/startCode/i);
    }
  });
});

/** A multipart body with the given files, as a browser sends it. */
function multipart(files: { name: string; type: string; data: Buffer }[]) {
  const boundary = '----fh' + Math.random().toString(16).slice(2);
  const parts = files.map((f) =>
    Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${f.name}"\r\nContent-Type: ${f.type}\r\n\r\n`,
      ),
      f.data,
      Buffer.from('\r\n'),
    ]),
  );
  return {
    payload: Buffer.concat([...parts, Buffer.from(`--${boundary}--\r\n`)]),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

describe('attachments', () => {
  let png: Buffer;
  beforeAll(async () => {
    png = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#ffcd11' } })
      .png()
      .toBuffer();
  });
  const upload = (
    cookie: string,
    ownerType: string,
    ownerId: string,
    files: Parameters<typeof multipart>[0],
  ) => {
    const body = multipart(files);
    return app.inject({
      method: 'POST',
      url: `/api/attachments?ownerType=${ownerType}&ownerId=${ownerId}`,
      headers: { ...headers(cookie), 'content-type': body.contentType },
      payload: body.payload,
    });
  };

  it('stores photos and PDFs with a thumbnail, serves them only to signed-in users, and lists them on the record', async () => {
    const v = await vehicle();
    const { item } = (
      await req('POST', `/api/vehicles/${v.serial}/records/service`, editor, SAMPLES.service)
    ).json();
    const res = await upload(editor, 'ServiceRecord', item.id, [
      { name: '../../invoice.png', type: 'image/png', data: png },
      { name: 'report.pdf', type: 'application/pdf', data: Buffer.from('%PDF-1.4\n%fake\n') },
    ]);
    expect(res.statusCode, res.body).toBe(201);
    const [photo, pdf] = res.json().items;
    expect(photo).toMatchObject({ fileName: 'invoice.png', mimeType: 'image/png', hasThumb: true });
    expect(pdf).toMatchObject({ mimeType: 'application/pdf', hasThumb: false });

    const file = await req('GET', `/api/attachments/${photo.id}`, viewer);
    expect(file.statusCode).toBe(200);
    expect(file.headers['content-type']).toBe('image/png');
    expect(file.rawPayload.equals(png)).toBe(true);
    const thumb = await req('GET', `/api/attachments/${photo.id}/thumb`, viewer);
    expect(thumb.headers['content-type']).toBe('image/webp');
    expect(thumb.rawPayload.length).toBeLessThan(png.length);
    expect(
      (await app.inject({ method: 'GET', url: `/api/attachments/${photo.id}` })).statusCode,
    ).toBe(401);

    const list = (await req('GET', `/api/vehicles/${v.serial}/records/service`, viewer)).json();
    expect(list.items[0].attachments).toHaveLength(2);

    // Removing a file can be undone; a deleted record hides its files.
    expect((await req('DELETE', `/api/attachments/${pdf.id}`, viewer)).statusCode).toBe(403);
    expect((await req('DELETE', `/api/attachments/${pdf.id}`, editor)).statusCode).toBe(200);
    expect((await req('GET', `/api/attachments/${pdf.id}`, viewer)).statusCode).toBe(404);
    expect((await req('POST', `/api/attachments/${pdf.id}/restore`, editor)).statusCode).toBe(200);
    await req('DELETE', `/api/vehicles/${v.serial}/records/service/${item.id}`, editor);
    expect((await req('GET', `/api/attachments/${photo.id}`, viewer)).statusCode).toBe(404);
  });

  it('refuses other file types, files over the limit, and records the user may not change', async () => {
    const v = await vehicle();
    const { item } = (
      await req('POST', `/api/vehicles/${v.serial}/records/fuel`, editor, SAMPLES.fuel)
    ).json();
    const exe = await upload(editor, 'FuelEntry', item.id, [
      { name: 'photo.png', type: 'image/png', data: Buffer.from('MZ\x90\x00not an image') },
    ]);
    expect(exe.statusCode).toBe(415);
    const big = await upload(editor, 'FuelEntry', item.id, [
      {
        name: 'big.pdf',
        type: 'application/pdf',
        data: Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(1_100_000)]),
      },
    ]);
    expect(big.statusCode).toBe(413);
    expect(
      (
        await upload(viewer, 'FuelEntry', item.id, [
          { name: 'a.png', type: 'image/png', data: png },
        ])
      ).statusCode,
    ).toBe(404);
    expect(
      // Not a receipt id, so there is nothing to attach to.
      (await upload(editor, 'Document', item.id, [{ name: 'a.png', type: 'image/png', data: png }]))
        .statusCode,
    ).toBe(404);
    expect(await app.db.attachment.count({ where: { ownerId: item.id } })).toBe(0);

    // A viewer may attach files to their own note.
    const note = (
      await req('POST', `/api/vehicles/${v.serial}/records/notes`, viewer, SAMPLES.notes)
    ).json().item;
    expect(
      (await upload(viewer, 'Note', note.id, [{ name: 'a.png', type: 'image/png', data: png }]))
        .statusCode,
    ).toBe(201);
  });

  it('keeps stored paths inside the upload folder and file names plain', () => {
    expect(() => resolveStored('/srv/uploads', '../etc/passwd')).toThrow();
    expect(() => resolveStored('/srv/uploads', '/etc/passwd')).toThrow();
    expect(resolveStored('/srv/uploads', '2026/10/a.png')).toBe('/srv/uploads/2026/10/a.png');
    expect(cleanFileName('..\\..\\evil\u0000.pdf')).toBe('evil.pdf');
    expect(cleanFileName('')).toBe('file');
  });
});
