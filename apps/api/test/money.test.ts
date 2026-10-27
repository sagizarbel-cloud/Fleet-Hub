import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createUser, login, makeApp, ORIGIN } from './helpers';

let app: Awaited<ReturnType<typeof makeApp>>;
let admin: string;
let editor: string;
let viewer: string;
let viewer2: string;
const ids: Record<'admin' | 'editor' | 'viewer' | 'viewer2', string> = {
  admin: '',
  editor: '',
  viewer: '',
  viewer2: '',
};
const vehicles: Record<string, string> = {};
const SERIALS = ['MT-1', 'MT-2', 'MT-3'];
const DAY = 86_400_000;
const isoDay = (offset = 0) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);

type Json = Record<string, unknown>;
const get = (url: string, cookie: string) =>
  app.inject({ method: 'GET', url, headers: { cookie } });
const send = (method: 'POST' | 'PUT' | 'DELETE', url: string, cookie: string, payload?: object) =>
  app.inject({ method, url, headers: { cookie, origin: ORIGIN }, payload });
const events = (vehicleId: string, sourceId: string) =>
  app.db.event.findMany({ where: { vehicleId, sourceId }, orderBy: { occurredAt: 'asc' } });

beforeAll(async () => {
  app = await makeApp();
  for (const [key, role] of [
    ['admin', 'ADMIN'],
    ['editor', 'EDITOR'],
    ['viewer', 'VIEWER'],
    ['viewer2', 'VIEWER'],
  ] as const) {
    const email = await createUser(app, role);
    ids[key] = (await app.db.user.findUniqueOrThrow({ where: { email } })).id;
    const cookie = await login(app, email);
    if (key === 'admin') admin = cookie;
    else if (key === 'editor') editor = cookie;
    else if (key === 'viewer') viewer = cookie;
    else viewer2 = cookie;
  }
  const type = await app.db.vehicleType.create({
    data: { code: 'money_test', nameEn: 'M', nameHe: 'מ', category: 'ROAD', usageUnit: 'KM' },
  });
  for (const serial of SERIALS) {
    vehicles[serial] = (
      await app.db.vehicle.create({ data: { serial, make: 'Test', model: 'T', typeId: type.id } })
    ).id;
  }
  for (const code of ['fuel', 'parts'])
    await app.db.receiptCategory.upsert({
      where: { code },
      create: { code, nameEn: code, nameHe: code },
      update: {},
    });
});
afterAll(async () => {
  await app.close();
});

describe('receipts', () => {
  const body = (over: Json = {}) => ({
    vehicles: ['MT-1'],
    date: isoDay(-2),
    vendor: 'Fake Tyres Ltd',
    amount: 300,
    category: 'parts',
    ...over,
  });

  it('editors add approved receipts that show on each tagged vehicle’s timeline', async () => {
    const res = await send('POST', '/api/receipts', editor, body({ vehicles: ['MT-1', 'MT-2'] }));
    expect(res.statusCode).toBe(201);
    const r = res.json();
    expect(r).toMatchObject({ state: 'approved', amount: 300, category: 'parts', canEdit: true });
    expect(r.vehicles.map((v: Json) => v.serial)).toEqual(['MT-1', 'MT-2']);
    for (const s of ['MT-1', 'MT-2']) {
      const e = await events(vehicles[s]!, r.id);
      expect(e).toMatchObject([{ type: 'DOCUMENT_ADDED', hiddenAt: null }]);
    }
  });

  it('a viewer’s receipt waits as suggested, hidden from totals and the timeline until approved', async () => {
    const r = (
      await send('POST', '/api/receipts', viewer, body({ vehicles: ['MT-3'], amount: 50 }))
    ).json();
    expect(r).toMatchObject({ state: 'suggested', canEdit: true });
    expect((await events(vehicles['MT-3']!, r.id))[0]!.hiddenAt).not.toBeNull();
    const list = (await get('/api/receipts?vehicle=MT-3', viewer)).json();
    expect(list.items).toHaveLength(1);
    expect(list.totals.sum).toBe(0);

    // Another viewer can't touch it, nor can its author approve it.
    expect((await send('PUT', `/api/receipts/${r.id}`, viewer2, body())).statusCode).toBe(403);
    const review = `/api/receipts/${r.id}/review`;
    expect((await send('POST', review, viewer, { approve: true })).statusCode).toBe(403);
    // Its author may still fix it while it waits.
    expect(
      (await send('PUT', `/api/receipts/${r.id}`, viewer, body({ vehicles: ['MT-3'], amount: 60 })))
        .statusCode,
    ).toBe(200);

    const approved = (await send('POST', review, editor, { approve: true })).json();
    expect(approved).toMatchObject({ state: 'approved', amount: 60 });
    expect((await events(vehicles['MT-3']!, r.id))[0]!.hiddenAt).toBeNull();
    expect((await get('/api/receipts?vehicle=MT-3', viewer)).json().totals.sum).toBe(60);
    // Once approved it is out of the viewer's hands.
    expect((await send('DELETE', `/api/receipts/${r.id}`, viewer)).statusCode).toBe(403);
    expect((await send('POST', review, editor, { approve: true })).statusCode).toBe(409);
  });

  it('rejecting a suggestion deletes it without a trace on the timeline', async () => {
    const r = (await send('POST', '/api/receipts', viewer, body({ vehicles: ['MT-3'] }))).json();
    expect(
      (await send('POST', `/api/receipts/${r.id}/review`, admin, { approve: false })).statusCode,
    ).toBe(200);
    expect((await get(`/api/receipts/${r.id}`, viewer)).statusCode).toBe(404);
    const visible = (await events(vehicles['MT-3']!, r.id)).filter((e) => !e.hiddenAt);
    expect(visible).toEqual([]);
  });

  it('totals split a shared receipt between its vehicles and count it once overall', async () => {
    const list = (await get('/api/receipts?q=Fake%20Tyres&state=approved', editor)).json();
    const shared = list.items.find((i: Json) => (i.vehicles as unknown[]).length === 2);
    expect(shared).toBeTruthy();
    const by = Object.fromEntries(
      (list.totals.byVehicle as { serial: string; amount: number }[]).map((v) => [
        v.serial,
        v.amount,
      ]),
    );
    expect(by['MT-1']).toBe(150);
    expect(by['MT-2']).toBe(150);
    expect(list.totals.sum).toBe(360); // 300 shared once + 60 on MT-3
    expect(list.totals.byMonth.length).toBeGreaterThan(0);
  });

  it('filters by category, amount and date, and checks every input', async () => {
    expect((await get('/api/receipts?category=fuel&vehicle=MT-1', viewer)).json().items).toEqual(
      [],
    );
    expect((await get('/api/receipts?min=1000&vehicle=MT-1', viewer)).json().items).toEqual([]);
    expect(
      (await get(`/api/receipts?from=${isoDay(1)}&vehicle=MT-1`, viewer)).json().items,
    ).toEqual([]);
    for (const bad of [
      body({ vehicles: [] }),
      body({ vehicles: ['NOPE'] }),
      body({ category: 'nope' }),
      body({ amount: -1 }),
      body({ date: isoDay(5) }),
      body({ linked: { kind: 'service', id: 'missing' } }),
    ]) {
      expect([400, 404]).toContain((await send('POST', '/api/receipts', editor, bad)).statusCode);
    }
  });

  it('links to a record of a tagged vehicle only; linked receipts add nothing to costs', async () => {
    const service = await app.db.serviceRecord.create({
      data: { vehicleId: vehicles['MT-2']!, date: new Date(), description: 'Oil', cost: 1000 },
    });
    const wrong = body({ vehicles: ['MT-1'], linked: { kind: 'service', id: service.id } });
    expect((await send('POST', '/api/receipts', editor, wrong)).statusCode).toBe(400);
    const linked = (
      await send(
        'POST',
        '/api/receipts',
        editor,
        body({ vehicles: ['MT-2'], amount: 1000, linked: { kind: 'service', id: service.id } }),
      )
    ).json();
    expect(linked.linked).toEqual({ kind: 'service', id: service.id });
    await send(
      'POST',
      '/api/receipts',
      editor,
      body({ vehicles: ['MT-2'], amount: 80, category: 'fuel' }),
    );

    const row = (await get('/api/fleet/table', viewer))
      .json()
      .rows.find((r: Json) => r.serial === 'MT-2');
    // Service 1000 + half of the shared 300 parts receipt; fuel receipt 80; the linked one adds 0.
    expect(row.costs).toMatchObject({ maintenance12m: 1150, fuel12m: 80, total12m: 1230 });
  });

  it('delete and Undo hide and bring back its timeline entries', async () => {
    const r = (await send('POST', '/api/receipts', editor, body())).json();
    expect((await send('DELETE', `/api/receipts/${r.id}`, editor)).statusCode).toBe(200);
    let e = await events(vehicles['MT-1']!, r.id);
    expect(e.map((x) => [x.type, !!x.hiddenAt])).toEqual([
      ['DOCUMENT_ADDED', true],
      ['RECORD_DELETED', false],
    ]);
    expect((await send('POST', `/api/receipts/${r.id}/restore`, editor)).statusCode).toBe(200);
    e = await events(vehicles['MT-1']!, r.id);
    expect(e.filter((x) => !x.hiddenAt).map((x) => x.type)).toEqual([
      'DOCUMENT_ADDED',
      'RECORD_DELETED',
      'RECORD_RESTORED',
    ]);
  });
});

describe('quote visibility (SPEC 5.6, changed 2026-10-27)', () => {
  // quotes[author][level] = id
  const quotes: Record<string, Record<string, string>> = {};
  const line = { item: 'Hydraulic pump', partNo: 'HP-100', quantity: 1, unitPrice: 5000 };
  const quoteBody = (over: Json = {}) => ({
    supplier: { name: 'Fake Hydraulics Ltd' },
    date: isoDay(-1),
    validUntil: isoDay(20),
    lines: [line],
    vehicles: ['MT-1'],
    ...over,
  });

  beforeAll(async () => {
    for (const author of ['viewer', 'viewer2', 'admin'] as const) {
      quotes[author] = {};
      const cookie = { viewer, viewer2, admin }[author];
      for (const level of ['STANDARD', 'PUBLIC', 'ADMINS'] as const) {
        const res = await send('POST', '/api/quotes', cookie, quoteBody());
        expect(res.statusCode).toBe(201);
        const id = res.json().id as string;
        if (level !== 'STANDARD')
          expect(
            (await send('PUT', `/api/quotes/${id}/visibility`, admin, { visibility: level }))
              .statusCode,
          ).toBe(200);
        quotes[author][level] = id;
      }
    }
  });

  /** Which of the nine quotes a user should see: their own at any level, everyone's public. */
  const expected = (who: 'viewer' | 'viewer2' | 'admin') =>
    Object.entries(quotes)
      .flatMap(([author, byLevel]) =>
        Object.entries(byLevel)
          .filter(([level]) => who === 'admin' || author === who || level === 'PUBLIC')
          .map(([, id]) => id),
      )
      .sort();
  const all = () => Object.values(quotes).flatMap((q) => Object.values(q));
  const pick = (list: { id: string }[]) =>
    list
      .map((q) => q.id)
      .filter((id) => all().includes(id))
      .sort();
  const users = { viewer: () => viewer, viewer2: () => viewer2, admin: () => admin };

  it('new quotes start as standard, and only admins change the level', async () => {
    const q = (await get(`/api/quotes/${quotes.viewer!.STANDARD}`, viewer)).json();
    expect(q).toMatchObject({ visibility: 'STANDARD', mine: true, canEdit: true });
    for (const cookie of [viewer, editor]) {
      const res = await send('PUT', `/api/quotes/${quotes.viewer!.STANDARD}/visibility`, cookie, {
        visibility: 'PUBLIC',
      });
      expect([403, 404]).toContain(res.statusCode);
    }
    // Nor can a non-admin create one at another level.
    expect(
      (await send('POST', '/api/quotes', viewer, quoteBody({ visibility: 'PUBLIC' }))).statusCode,
    ).toBe(403);
  });

  for (const who of ['viewer', 'viewer2', 'admin'] as const) {
    it(`${who}: list, detail, vehicle tab and count, compare, search, export and timeline agree`, async () => {
      const cookie = users[who]();
      const want = expected(who);
      expect(pick((await get('/api/quotes?limit=200', cookie)).json().items)).toEqual(want);
      expect(pick((await get('/api/quotes?all=1', cookie)).json().items)).toEqual(want);
      expect(pick((await get('/api/quotes?q=HP-100&limit=200', cookie)).json().items)).toEqual(
        want,
      );
      expect(pick((await get('/api/quotes?vehicle=MT-1&limit=200', cookie)).json().items)).toEqual(
        want,
      );
      expect(pick((await get('/api/vehicles/MT-1/quotes', cookie)).json().items)).toEqual(want);
      const detail = (await get('/api/vehicles/MT-1', cookie)).json();
      expect(detail.counts.quotes).toBe(want.length);

      const compare = (await get('/api/quotes/compare?part=%23hp-100', cookie)).json();
      expect(
        [...new Set(compare.lines.map((l: { quote: { id: string } }) => l.quote.id))]
          .filter((id) => all().includes(id as string))
          .sort(),
      ).toEqual(want);
      const parts = (await get('/api/quotes/parts', cookie)).json().items;
      expect(parts.find((p: Json) => p.key === '#hp-100').quotes).toBe(want.length);

      const timeline = (
        await get(`/api/events?vehicle=MT-1&types=QUOTE_LINKED&limit=100`, cookie)
      ).json();
      expect(
        [...new Set(timeline.items.map((e: { sourceId: string }) => e.sourceId))]
          .filter((id) => all().includes(id as string))
          .sort(),
      ).toEqual(want);

      for (const id of all()) {
        const seen = want.includes(id);
        expect((await get(`/api/quotes/${id}`, cookie)).statusCode).toBe(seen ? 200 : 404);
        const two = await get(`/api/quotes/compare?ids=${id},${want[0]}`, cookie);
        expect(two.statusCode).toBe(seen ? (id === want[0] ? 400 : 200) : 404);
      }
    });
  }

  it('creators keep sight of an admins-only quote but can no longer change it', async () => {
    const id = quotes.viewer!.ADMINS!;
    const q = (await get(`/api/quotes/${id}`, viewer)).json();
    expect(q).toMatchObject({ visibility: 'ADMINS', mine: true, canEdit: false });
    expect((await send('PUT', `/api/quotes/${id}`, viewer, quoteBody())).statusCode).toBe(403);
    expect((await send('DELETE', `/api/quotes/${id}`, viewer)).statusCode).toBe(403);
    expect(
      (await send('POST', `/api/quotes/${id}/status`, viewer, { status: 'RECEIVED' })).statusCode,
    ).toBe(403);
    // Another viewer is told it doesn't exist, on every route.
    expect((await get(`/api/quotes/${id}`, viewer2)).statusCode).toBe(404);
    expect((await send('PUT', `/api/quotes/${id}`, viewer2, quoteBody())).statusCode).toBe(404);
    expect((await send('DELETE', `/api/quotes/${id}`, viewer2)).statusCode).toBe(404);
    expect(
      (await send('PUT', `/api/quotes/${id}/vehicles`, viewer2, { vehicles: [] })).statusCode,
    ).toBe(404);
    // Admins can.
    expect((await send('PUT', `/api/quotes/${id}`, admin, quoteBody())).statusCode).toBe(200);
  });

  it('public quotes are read-only for everyone but their creator and admins', async () => {
    const id = quotes.viewer!.PUBLIC!;
    expect((await get(`/api/quotes/${id}`, viewer2)).json().canEdit).toBe(false);
    expect((await send('PUT', `/api/quotes/${id}`, viewer2, quoteBody())).statusCode).toBe(403);
    expect((await send('DELETE', `/api/quotes/${id}`, editor)).statusCode).toBe(403);
    expect((await send('PUT', `/api/quotes/${id}`, viewer, quoteBody())).statusCode).toBe(200);
  });

  it('files on a quote follow its visibility', async () => {
    const id = quotes.viewer2!.STANDARD!;
    const att = await app.db.attachment.create({
      data: {
        ownerType: 'Quote',
        ownerId: id,
        fileName: 'q.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 4,
        storagePath: 'missing.pdf',
      },
    });
    expect((await get(`/api/attachments/${att.id}`, viewer)).statusCode).toBe(404);
  });
});

describe('quotes', () => {
  const body = (over: Json = {}) => ({
    supplier: { name: 'Fake Parts Co' },
    date: isoDay(-3),
    validUntil: null,
    lines: [
      { item: 'Filter kit', partNo: 'FK-1', condition: 'NEW', quantity: 2, unitPrice: 120 },
      { item: 'Seat', quantity: 1, unitPrice: 900 },
    ],
    vehicles: ['MT-1', 'MT-2'],
    ...over,
  });

  it('adds lines and a total, reuses suppliers by name and logs links and unlinks', async () => {
    const q = (await send('POST', '/api/quotes', editor, body())).json();
    expect(q).toMatchObject({
      status: 'REQUESTED',
      total: 1140,
      supplier: { name: 'Fake Parts Co' },
    });
    expect(q.lines.map((l: Json) => l.total)).toEqual([240, 900]);
    const again = (
      await send('POST', '/api/quotes', editor, body({ supplier: { name: 'fake parts co' } }))
    ).json();
    expect(again.supplier.id).toBe(q.supplier.id);

    const res = await send('PUT', `/api/quotes/${q.id}/vehicles`, editor, {
      vehicles: ['MT-2', 'MT-3'],
    });
    expect(res.json().vehicles.map((v: Json) => v.serial)).toEqual(['MT-2', 'MT-3']);
    expect((await events(vehicles['MT-1']!, q.id)).map((e) => e.type)).toEqual([
      'QUOTE_LINKED',
      'QUOTE_UNLINKED',
    ]);
    expect((await events(vehicles['MT-3']!, q.id)).map((e) => e.type)).toEqual(['QUOTE_LINKED']);

    // Deleting hides its entries; Undo brings them back.
    await send('DELETE', `/api/quotes/${q.id}`, editor);
    expect((await events(vehicles['MT-3']!, q.id)).every((e) => e.hiddenAt)).toBe(true);
    expect((await send('POST', `/api/quotes/${q.id}/restore`, editor)).statusCode).toBe(200);
    expect((await events(vehicles['MT-3']!, q.id)).some((e) => e.hiddenAt)).toBe(false);
  });

  it('moves through the status flow; approving and ordering is for editors and admins', async () => {
    const q = (await send('POST', '/api/quotes', viewer, body())).json();
    const step = (cookie: string, status: string) =>
      send('POST', `/api/quotes/${q.id}/status`, cookie, { status });
    expect((await step(viewer, 'ORDERED')).statusCode).toBe(409);
    expect((await step(viewer, 'RECEIVED')).statusCode).toBe(200);
    expect((await step(viewer, 'APPROVED')).statusCode).toBe(403);
    // The editor can't see the viewer's standard quote at all; an admin approves it.
    expect((await step(editor, 'APPROVED')).statusCode).toBe(404);
    expect((await step(admin, 'APPROVED')).json().status).toBe('APPROVED');
    expect((await step(admin, 'ORDERED')).json().status).toBe('ORDERED');
    expect((await step(admin, 'REJECTED')).statusCode).toBe(409);
  });

  it('checks every input', async () => {
    for (const bad of [
      body({ lines: [] }),
      body({ lines: [{ item: '', quantity: 1, unitPrice: 1 }] }),
      body({ lines: [{ item: 'x', quantity: 0, unitPrice: 1 }] }),
      body({ validUntil: isoDay(-10) }),
      body({ supplier: { id: 'missing' } }),
      body({ vehicles: ['NOPE'] }),
    ]) {
      expect([400, 404]).toContain((await send('POST', '/api/quotes', editor, bad)).statusCode);
    }
    expect((await get('/api/quotes/compare?ids=only-one', editor)).statusCode).toBe(400);
  });
});

describe('equipment', () => {
  it('editors add, edit, assign, move and retire items; history and events follow', async () => {
    const item = { kind: 'bucket', name: 'Test bucket', model: 'TB-1', serial: 'IT-MT-1' };
    expect((await send('POST', '/api/items', viewer, item)).statusCode).toBe(403);
    const created = (await send('POST', '/api/items', editor, item)).json();
    expect(created).toMatchObject({ name: 'Test bucket', vehicle: null });
    expect((await send('POST', '/api/items', editor, item)).statusCode).toBe(409);

    const assign = (serial: string) =>
      send('POST', `/api/items/${created.id}/assign`, editor, { vehicle: serial });
    expect((await assign('MT-1')).statusCode).toBe(200);
    expect((await assign('MT-2')).statusCode).toBe(200);
    const detail = (await get(`/api/items/${created.id}`, viewer)).json();
    expect(detail.vehicle.serial).toBe('MT-2');
    expect(detail.history.map((h: Json) => [h.serial, h.removedAt === null])).toEqual([
      ['MT-2', true],
      ['MT-1', false],
    ]);
    const types = async (serial: string) =>
      (await events(vehicles[serial]!, created.id)).map((e) => e.type);
    expect(await types('MT-1')).toEqual(['ITEM_ASSIGNED', 'ITEM_REMOVED']);

    expect((await send('POST', `/api/items/${created.id}/retire`, editor)).statusCode).toBe(409);
    await send('POST', `/api/items/${created.id}/remove`, editor);
    expect((await send('POST', `/api/items/${created.id}/retire`, editor)).statusCode).toBe(200);
    const catalog = (await get('/api/items?q=Test%20bucket', viewer)).json().items;
    expect(catalog).toEqual([]);
    const retired = (await get('/api/items?q=Test%20bucket&retired=1', viewer)).json().items;
    expect(retired).toHaveLength(1);
    expect((await assign('MT-1')).statusCode).toBe(409);
    expect(
      (await send('PUT', `/api/items/${created.id}`, editor, { ...item, name: 'Renamed' })).json()
        .name,
    ).toBe('Renamed');
  });
});
