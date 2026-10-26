import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createUser, login, makeApp } from './helpers';

let app: Awaited<ReturnType<typeof makeApp>>;
let admin: string;
let editor: string;
let viewer: string;
let editorId: string;
let viewerId: string;
let vehicleId: string;
const DAY = 24 * 60 * 60 * 1000;
const SERIAL = 'DB-001';

const get = (url: string, cookie: string) =>
  app.inject({ method: 'GET', url, headers: { cookie } });

beforeAll(async () => {
  app = await makeApp();
  const [adminEmail, editorEmail, viewerEmail] = [
    await createUser(app, 'ADMIN'),
    await createUser(app, 'EDITOR'),
    await createUser(app, 'VIEWER'),
  ];
  admin = await login(app, adminEmail);
  editor = await login(app, editorEmail);
  viewer = await login(app, viewerEmail);
  editorId = (await app.db.user.findUniqueOrThrow({ where: { email: editorEmail } })).id;
  viewerId = (await app.db.user.findUniqueOrThrow({ where: { email: viewerEmail } })).id;

  const type = await app.db.vehicleType.create({
    data: {
      code: 'dash_test',
      nameEn: 'Dash',
      nameHe: 'דש',
      category: 'EQUIPMENT',
      usageUnit: 'HOURS',
    },
  });
  vehicleId = (
    await app.db.vehicle.create({
      data: { serial: SERIAL, make: 'Test', model: 'T', typeId: type.id },
    })
  ).id;
});
afterAll(async () => {
  await app.close();
});

describe('dashboard', () => {
  it('requires a session', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/dashboard' })).statusCode).toBe(401);
  });

  it('counts due dates within 30 days (overdue included), open malfunctions and spend this month', async () => {
    const before = (await get('/api/dashboard', viewer)).json().kpis;
    const type = await app.db.vehicleType.findUniqueOrThrow({ where: { code: 'dash_test' } });
    const now = Date.now();
    await app.db.vehicle.createMany({
      data: [
        // inside the window, overdue, and just outside
        {
          serial: 'DB-010',
          make: 'T',
          model: 'T',
          typeId: type.id,
          nextServiceDate: new Date(now + 29 * DAY),
        },
        {
          serial: 'DB-011',
          make: 'T',
          model: 'T',
          typeId: type.id,
          annualTestExpiry: new Date(now - 3 * DAY),
        },
        {
          serial: 'DB-012',
          make: 'T',
          model: 'T',
          typeId: type.id,
          insuranceExpiry: new Date(now + 31 * DAY),
        },
        { serial: 'DB-013', make: 'T', model: 'T', typeId: type.id, status: 'RED' },
      ],
    });
    await app.db.malfunction.createMany({
      data: [
        { vehicleId, reportedAt: new Date(), severity: 'HIGH', description: 'open' },
        {
          vehicleId,
          reportedAt: new Date(),
          severity: 'LOW',
          description: 'done',
          state: 'RESOLVED',
        },
        {
          vehicleId,
          reportedAt: new Date(),
          severity: 'LOW',
          description: 'gone',
          deletedAt: new Date(),
        },
      ],
    });
    await app.db.document.createMany({
      data: [
        { date: new Date(), amount: 120.5 },
        { date: new Date(now - 400 * DAY), amount: 999 }, // last year
        { date: new Date(), amount: 50, deletedAt: new Date() },
      ],
    });

    const after = (await get('/api/dashboard', viewer)).json().kpis;
    expect(after.dueWithin30Days.service - before.dueWithin30Days.service).toBe(1);
    expect(after.dueWithin30Days.annualTest - before.dueWithin30Days.annualTest).toBe(1);
    expect(after.dueWithin30Days.insurance - before.dueWithin30Days.insurance).toBe(0);
    expect(after.dueWithin30Days.total - before.dueWithin30Days.total).toBe(2);
    expect(after.openMalfunctions - before.openMalfunctions).toBe(1);
    expect(after.spendThisMonth - before.spendThisMonth).toBeCloseTo(120.5);
    expect(after.status.RED - before.status.RED).toBe(1);
    expect(after.status.GREEN - before.status.GREEN).toBe(3);
  });

  it('returns tiles without start codes', async () => {
    const res = await get('/api/dashboard', viewer);
    const tile = res.json().tiles.find((t: { serial: string }) => t.serial === SERIAL);
    expect(tile).toMatchObject({ type: 'dash_test', category: 'EQUIPMENT', openIssues: 1 });
    expect(res.body).not.toContain('startCode');
  });
});

describe('events', () => {
  let quotes: Record<'adminOnly' | 'editorStd' | 'viewerStd' | 'pub', string>;

  beforeAll(async () => {
    const supplier = await app.db.supplier.create({ data: { name: 'Test supplier' } });
    const make = async (visibility: 'STANDARD' | 'PUBLIC' | 'ADMINS', createdById: string) =>
      (
        await app.db.quote.create({
          data: { supplierId: supplier.id, date: new Date(), visibility, createdById },
        })
      ).id;
    quotes = {
      adminOnly: await make('ADMINS', editorId),
      editorStd: await make('STANDARD', editorId),
      viewerStd: await make('STANDARD', viewerId),
      pub: await make('PUBLIC', editorId),
    };
    const base = Date.UTC(2026, 0, 1);
    await app.db.event.createMany({
      data: [
        ...Array.from({ length: 5 }, (_, i) => ({
          vehicleId,
          type: 'NOTE_ADDED' as const,
          // two events share a timestamp to exercise the id tie-break
          occurredAt: new Date(base + Math.min(i, 3) * DAY),
        })),
        ...Object.values(quotes).map((id) => ({
          vehicleId,
          type: 'QUOTE_LINKED' as const,
          occurredAt: new Date(base + 10 * DAY),
          sourceType: 'Quote',
          sourceId: id,
        })),
      ],
    });
  });

  const quoteIds = async (cookie: string) =>
    (await get(`/api/events?vehicle=${SERIAL}&types=QUOTE_LINKED`, cookie))
      .json()
      .items.map((e: { sourceId: string }) => e.sourceId)
      .sort();

  it('pages newest first with a stable cursor', async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    let lastAt = Infinity;
    do {
      const url: string = `/api/events?vehicle=${SERIAL}&types=NOTE_ADDED&limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      const page = (await get(url, viewer)).json();
      for (const e of page.items) {
        const at = Date.parse(e.occurredAt);
        expect(at).toBeLessThanOrEqual(lastAt);
        lastAt = at;
        seen.push(e.id);
      }
      cursor = page.nextCursor;
    } while (cursor);
    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);
  });

  it('filters by type', async () => {
    const items = (await get(`/api/events?vehicle=${SERIAL}&types=NOTE_ADDED`, viewer)).json()
      .items;
    expect(items.every((e: { type: string }) => e.type === 'NOTE_ADDED')).toBe(true);
  });

  it('rejects unknown types and bad cursors', async () => {
    expect((await get('/api/events?types=NOPE', viewer)).statusCode).toBe(400);
    expect((await get('/api/events?cursor=garbage', viewer)).statusCode).toBe(400);
  });

  it('shows quote events only to users who can see the quote', async () => {
    expect(await quoteIds(admin)).toEqual(Object.values(quotes).sort());
    expect(await quoteIds(editor)).toEqual([quotes.editorStd, quotes.pub].sort());
    expect(await quoteIds(viewer)).toEqual([quotes.viewerStd, quotes.pub].sort());
  });
});
