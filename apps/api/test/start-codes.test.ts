import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { encryptStartCode } from '@fleet-hub/shared/crypto';
import { createUser, login, makeApp } from './helpers';

let app: Awaited<ReturnType<typeof makeApp>>;
const PLAIN = '7319';

beforeAll(async () => {
  app = await makeApp();
  const type = await app.db.vehicleType.create({
    data: { code: 'pickup_test', nameEn: 'Pickup', nameHe: 'טנדר', category: 'ROAD', usageUnit: 'KM' },
  });
  await app.db.vehicle.create({
    data: {
      serial: 'ZZ-001',
      make: 'Test',
      model: 'Pickup',
      typeId: type.id,
      hasStartCode: true,
      startCodeEnc: encryptStartCode(PLAIN, process.env.FLEET_CODE_KEY!),
    },
  });
});
afterAll(async () => {
  await app.close();
});

describe('start codes', () => {
  it('are encrypted at rest', async () => {
    const row = await app.db.vehicle.findUniqueOrThrow({ where: { serial: 'ZZ-001' } });
    expect(row.startCodeEnc).toBeTruthy();
    expect(row.startCodeEnc).not.toContain(PLAIN);
  });

  it('never appear in the vehicle list, even for a user allowed to view them', async () => {
    const cookie = await login(app, await createUser(app, 'ADMIN', { canViewStartCodes: true }));
    const res = await app.inject({ method: 'GET', url: '/api/vehicles', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const vehicle = res.json().items.find((v: { serial: string }) => v.serial === 'ZZ-001');
    expect(vehicle).toBeDefined();
    expect(vehicle.hasStartCode).toBe(true);
    expect(vehicle).not.toHaveProperty('startCodeEnc');
    expect(res.body).not.toContain('startCode"');
    expect(res.body).not.toContain(PLAIN);
  });
});
