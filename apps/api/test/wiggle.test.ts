import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createUser, login, makeApp, ORIGIN } from './helpers';

/** Wiggle tests (Sagi, 2026-11-08): heavy machinery only, V / X per item, tied to who did it. */
let app: Awaited<ReturnType<typeof makeApp>>;
let admin: string;
let editor: string;
let viewer: string;
let viewer2: string;
let seq = 0;

const req = (
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  cookie: string,
  payload?: object,
) => app.inject({ method, url, headers: { cookie, origin: ORIGIN }, payload });

const LOADER = {
  articulation: 'PASS',
  steeringCylinders: 'PASS',
  steeringResponse: 'PASS',
  cameras: 'PASS',
  lidars: 'FAIL',
  communications: 'PASS',
};
const EXCAVATOR = {
  tracksTravel: 'PASS',
  swing: 'PASS',
  undercarriage: 'PASS',
  cameras: 'PASS',
  lidars: 'PASS',
  communications: 'PASS',
};

async function vehicle(type: string) {
  const serial = `WG-${++seq}`;
  const t = await app.db.vehicleType.findUniqueOrThrow({ where: { code: type } });
  await app.db.vehicle.create({ data: { serial, make: 'Test', model: 'Unit', typeId: t.id } });
  return `/api/vehicles/${serial}`;
}

beforeAll(async () => {
  app = await makeApp();
  admin = await login(app, await createUser(app, 'ADMIN'));
  editor = await login(app, await createUser(app, 'EDITOR'));
  viewer = await login(app, await createUser(app, 'VIEWER'));
  viewer2 = await login(app, await createUser(app, 'VIEWER'));
  for (const [code, category] of [
    ['wheel_loader', 'EQUIPMENT'],
    ['tracked_excavator', 'EQUIPMENT'],
    ['pickup', 'ROAD'],
  ] as const)
    await app.db.vehicleType.upsert({
      where: { code },
      create: { code, nameEn: code, nameHe: code, category, usageUnit: 'HOURS' },
      update: {},
    });
});

afterAll(async () => {
  await app.db.appSetting.deleteMany({ where: { key: 'wiggleTypes' } });
  await app.close();
});

describe('wiggle tests', () => {
  it('a viewer adds one on a loader; it is theirs, counted and logged', async () => {
    const base = await vehicle('wheel_loader');
    const res = await req('POST', `${base}/records/wiggleTests`, viewer, {
      results: LOADER,
      notes: 'Mirror loose',
    });
    expect(res.statusCode).toBe(201);
    const { item } = res.json();
    expect(item).toMatchObject({ profile: 'loader', failCount: 1, notes: 'Mirror loose' });
    expect(item.createdBy).toBeTruthy();
    expect(new Date(item.date).getTime()).toBeGreaterThan(Date.now() - 60_000);

    const ev = await app.db.event.findFirstOrThrow({
      where: { sourceType: 'WiggleTest', sourceId: item.id, type: 'WIGGLE_TEST' },
    });
    expect(ev.params).toEqual({ failed: ['lidars'] });

    const detail = (await req('GET', base, viewer)).json();
    expect(detail.counts.wiggleTests).toBe(1);
    expect(detail.counts.lastWiggle.failCount).toBe(1);
  });

  it('needs every item of the machine’s own checklist, and only those', async () => {
    const loader = await vehicle('wheel_loader');
    const { communications: _c, ...missing } = LOADER;
    const a = await req('POST', `${loader}/records/wiggleTests`, editor, { results: missing });
    expect(a.statusCode).toBe(400);
    expect(a.json().issues).toEqual([{ path: 'results.communications', code: 'required' }]);
    // Excavator items on a loader: the steering checks differ.
    const b = await req('POST', `${loader}/records/wiggleTests`, editor, { results: EXCAVATOR });
    expect(b.statusCode).toBe(400);
    const c = await req('POST', `${loader}/records/wiggleTests`, editor, {
      results: { ...LOADER, cameras: 'MAYBE' },
    });
    expect(c.statusCode).toBe(400);

    const ex = await vehicle('tracked_excavator');
    const d = await req('POST', `${ex}/records/wiggleTests`, editor, { results: EXCAVATOR });
    expect(d.statusCode).toBe(201);
    expect(d.json().item).toMatchObject({ profile: 'excavator', failCount: 0, notes: null });
  });

  it('is refused on a vehicle type that takes none, until an admin adds the type', async () => {
    const pickup = await vehicle('pickup');
    const a = await req('POST', `${pickup}/records/wiggleTests`, editor, { results: EXCAVATOR });
    expect(a.statusCode).toBe(400);
    expect(a.json().error).toBe('no_wiggle_test');

    const settings = (await req('GET', '/api/settings/app', admin)).json();
    expect(settings.wiggleTypes).toMatchObject({ wheel_loader: 'loader' });
    // Only admins change the list.
    const body = { ...settings, wiggleTypes: { ...settings.wiggleTypes, pickup: 'excavator' } };
    expect((await req('PUT', '/api/settings/app', editor, body)).statusCode).toBe(403);
    expect((await req('PUT', '/api/settings/app', admin, body)).statusCode).toBe(200);
    const b = await req('POST', `${pickup}/records/wiggleTests`, editor, { results: EXCAVATOR });
    expect(b.statusCode).toBe(201);
  });

  it('viewers change only their own; editors change any', async () => {
    const base = await vehicle('wheel_loader');
    const mine = (
      await req('POST', `${base}/records/wiggleTests`, viewer, { results: LOADER })
    ).json().item.id;
    const fixed = { ...LOADER, lidars: 'PASS' };
    expect(
      (await req('PUT', `${base}/records/wiggleTests/${mine}`, viewer2, { results: fixed }))
        .statusCode,
    ).toBe(403);
    const edited = await req('PUT', `${base}/records/wiggleTests/${mine}`, viewer, {
      results: fixed,
    });
    expect(edited.statusCode).toBe(200);
    expect(edited.json().item.failCount).toBe(0);
    expect((await req('DELETE', `${base}/records/wiggleTests/${mine}`, editor)).statusCode).toBe(
      200,
    );
  });

  it('lists a vehicle’s history newest first, filters to tests with an X and by dates', async () => {
    const base = await vehicle('wheel_loader');
    await req('POST', `${base}/records/wiggleTests`, editor, { results: LOADER });
    await req('POST', `${base}/records/wiggleTests`, viewer, {
      results: { ...LOADER, lidars: 'PASS' },
    });
    const all = (await req('GET', `${base}/records/wiggleTests?all=1`, viewer)).json();
    expect(all.total).toBe(2);
    expect(all.items[0].failCount).toBe(0);
    const failed = (await req('GET', `${base}/records/wiggleTests?failed=1`, viewer)).json();
    expect(failed.items.map((i: { failCount: number }) => i.failCount)).toEqual([1]);
    const old = (await req('GET', `${base}/records/wiggleTests?to=2020-01-01`, viewer)).json();
    expect(old.total).toBe(0);
  });
});
