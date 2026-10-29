import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeApp } from './helpers';
import { firstRun } from '../src/lib/first-run';

let app: Awaited<ReturnType<typeof makeApp>>;

beforeAll(async () => {
  app = await makeApp();
  // Start as a new install would: no active admins (earlier test files leave some behind).
  await app.db.user.updateMany({ where: { role: 'ADMIN' }, data: { active: false } });
});
afterAll(() => app.close());

describe('first run (create-admin)', () => {
  it('adds the base lists and an admin with a one-time link', async () => {
    const result = await firstRun(app.db, { email: 'First@fleethub.test', name: 'First admin' });
    expect(result).toMatchObject({ ok: true, created: true });
    const user = await app.db.user.findUniqueOrThrow({ where: { email: 'first@fleethub.test' } });
    expect(user).toMatchObject({ role: 'ADMIN', canViewStartCodes: true, active: true });
    expect(await app.db.vehicleType.count()).toBeGreaterThanOrEqual(13);
    expect(await app.db.receiptCategory.findUnique({ where: { code: 'fuel' } })).not.toBeNull();

    const token = result.ok ? result.path.split('/').at(-1)! : '';
    const res = await app.inject({ method: 'GET', url: `/api/auth/reset/${token}` });
    expect(res.statusCode).toBe(200);
  });

  it('issues a fresh link for the same admin and retires the old one', async () => {
    const result = await firstRun(app.db, { email: 'first@fleethub.test', name: 'First admin' });
    expect(result).toMatchObject({ ok: true, created: false });
    const user = await app.db.user.findUniqueOrThrow({ where: { email: 'first@fleethub.test' } });
    expect(
      await app.db.passwordResetToken.count({ where: { userId: user.id, usedAt: null } }),
    ).toBe(1);
  });

  it('refuses once another admin exists', async () => {
    expect(await firstRun(app.db, { email: 'second@fleethub.test', name: 'Second' })).toEqual({
      ok: false,
      reason: 'admin_exists',
    });
    expect(await app.db.user.findUnique({ where: { email: 'second@fleethub.test' } })).toBeNull();
  });
});
