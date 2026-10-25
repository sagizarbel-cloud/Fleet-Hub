import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createUser, login, makeApp } from './helpers';

let app: Awaited<ReturnType<typeof makeApp>>;
let cookie: string;

beforeAll(async () => {
  app = await makeApp();
  cookie = await login(app, await createUser(app, 'VIEWER'));
  const type = await app.db.vehicleType.create({
    data: {
      code: 'truck_test',
      nameEn: 'Truck',
      nameHe: 'משאית',
      category: 'ROAD',
      usageUnit: 'KM',
    },
  });
  await app.db.vehicle.createMany({
    data: Array.from({ length: 5 }, (_, i) => ({
      serial: `PG-00${i}`,
      make: 'Test',
      model: 'T',
      typeId: type.id,
    })),
  });
});
afterAll(async () => {
  await app.close();
});

describe('lists', () => {
  it('require a session', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/vehicles' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/lookups' })).statusCode).toBe(401);
  });

  it('paginate vehicles with a cursor', async () => {
    const first = await app.inject({
      method: 'GET',
      url: '/api/vehicles?limit=2',
      headers: { cookie },
    });
    const page1 = first.json();
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).toBe(page1.items[1].serial);

    const second = await app.inject({
      method: 'GET',
      url: `/api/vehicles?limit=2&cursor=${page1.nextCursor}`,
      headers: { cookie },
    });
    const page2 = second.json();
    expect(page2.items[0].serial > page1.items[1].serial).toBe(true);
  });

  it('reject an out-of-range limit', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/vehicles?limit=5000',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(400);
  });

  it('return bilingual lookups', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/lookups', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(
      res.json().vehicleTypes.find((t: { code: string }) => t.code === 'truck_test'),
    ).toMatchObject({
      nameEn: 'Truck',
      nameHe: 'משאית',
    });
  });
});
