import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createUser, login, makeApp, ORIGIN, PASSWORD } from './helpers';

let app: Awaited<ReturnType<typeof makeApp>>;
let admin: string;
let adminId: string;
let editor: string;
let viewer: string;

const req = (
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  cookie: string | null,
  payload?: object,
) =>
  app.inject({
    method,
    url,
    headers: cookie ? { cookie, origin: ORIGIN } : { origin: ORIGIN },
    payload,
  });
const tokenOf = (path: string) => path.split('/').at(-1)!;

beforeAll(async () => {
  app = await makeApp();
  const adminEmail = await createUser(app, 'ADMIN');
  admin = await login(app, adminEmail);
  adminId = (await app.db.user.findUniqueOrThrow({ where: { email: adminEmail } })).id;
  editor = await login(app, await createUser(app, 'EDITOR'));
  viewer = await login(app, await createUser(app, 'VIEWER'));
});
afterAll(async () => {
  await app.close();
});

describe('settings lists', () => {
  it('editors and admins manage them, viewers cannot', async () => {
    expect((await req('GET', '/api/settings/lookups', viewer)).statusCode).toBe(403);
    expect(
      (
        await req('POST', '/api/settings/lookups/departments', viewer, {
          code: 'st_x',
          nameEn: 'X',
          nameHe: 'איקס',
        })
      ).statusCode,
    ).toBe(403);
    const res = await req('POST', '/api/settings/lookups/departments', editor, {
      code: 'st_roads',
      nameEn: 'Roads',
      nameHe: 'כבישים',
    });
    expect(res.statusCode).toBe(201);
    const list = (await req('GET', '/api/settings/lookups', admin)).json();
    expect(list.departments.find((d: { code: string }) => d.code === 'st_roads')).toMatchObject({
      nameHe: 'כבישים',
      inUse: 0,
      active: true,
    });
  });

  it('rejects a taken code and a vehicle type without its unit', async () => {
    const body = { code: 'st_dup', nameEn: 'Dup', nameHe: 'כפול' };
    expect((await req('POST', '/api/settings/lookups/locations', editor, body)).statusCode).toBe(
      201,
    );
    const again = await req('POST', '/api/settings/lookups/locations', editor, body);
    expect(again.statusCode).toBe(400);
    expect(again.json().issues).toEqual([{ path: 'code', code: 'taken' }]);
    const type = await req('POST', '/api/settings/lookups/vehicleTypes', editor, {
      code: 'st_type',
      nameEn: 'Type',
      nameHe: 'סוג',
      category: 'ROAD',
    });
    expect(type.statusCode).toBe(400);
    expect(type.json().issues[0].path).toBe('usageUnit');
  });

  it('a value in use can be hidden or renamed but not deleted or re-coded', async () => {
    const type = (
      await req('POST', '/api/settings/lookups/vehicleTypes', editor, {
        code: 'st_loader',
        nameEn: 'Loader',
        nameHe: 'שופל',
        category: 'EQUIPMENT',
        usageUnit: 'HOURS',
      })
    ).json();
    await app.db.vehicle.create({
      data: { serial: 'ST-1', make: 'Test', model: 'Unit', typeId: type.id },
    });
    const del = await req('DELETE', `/api/settings/lookups/vehicleTypes/${type.id}`, editor);
    expect(del.statusCode).toBe(409);
    const recode = await req('PUT', `/api/settings/lookups/vehicleTypes/${type.id}`, editor, {
      code: 'st_other',
      nameEn: 'Loader',
      nameHe: 'שופל',
    });
    expect(recode.json().issues).toEqual([{ path: 'code', code: 'inUse' }]);
    const hide = await req('PUT', `/api/settings/lookups/vehicleTypes/${type.id}`, editor, {
      code: 'st_loader',
      nameEn: 'Wheel loader',
      nameHe: 'שופל',
      active: false,
    });
    expect(hide.statusCode).toBe(200);
    expect(hide.json()).toMatchObject({ nameEn: 'Wheel loader', active: false });
  });

  it('saves a new order and deletes an unused value', async () => {
    const a = (
      await req('POST', '/api/settings/lookups/fluidTypes', editor, {
        code: 'st_a',
        nameEn: 'A',
        nameHe: 'א',
      })
    ).json();
    const b = (
      await req('POST', '/api/settings/lookups/fluidTypes', editor, {
        code: 'st_b',
        nameEn: 'B',
        nameHe: 'ב',
      })
    ).json();
    expect(
      (await req('PUT', '/api/settings/lookups/fluidTypes/order', editor, { ids: [b.id, a.id] }))
        .statusCode,
    ).toBe(200);
    const codes = (await req('GET', '/api/settings/lookups', editor))
      .json()
      .fluidTypes.map((f: { code: string }) => f.code);
    expect(codes.indexOf('st_b')).toBeLessThan(codes.indexOf('st_a'));
    expect(
      (await req('DELETE', `/api/settings/lookups/fluidTypes/${a.id}`, editor)).statusCode,
    ).toBe(200);
  });
});

describe('users', () => {
  it('only admins list and add users; a new user gets a one-time link', async () => {
    expect((await req('GET', '/api/users', editor)).statusCode).toBe(403);
    const res = await req('POST', '/api/users', admin, {
      email: 'New.Person@Fleethub.test',
      name: 'New Person',
      role: 'VIEWER',
    });
    expect(res.statusCode).toBe(201);
    const { user, link } = res.json();
    expect(user.email).toBe('new.person@fleethub.test');
    expect(user).not.toHaveProperty('passwordHash');
    expect(link.path).toMatch(/^\/reset\/[A-Za-z0-9_-]{20,}$/);
    const dup = await req('POST', '/api/users', admin, {
      email: 'new.person@fleethub.test',
      name: 'Again',
      role: 'VIEWER',
    });
    expect(dup.json().issues).toEqual([{ path: 'email', code: 'taken' }]);
    const audit = await app.db.auditLog.findFirst({
      where: { action: 'user.create', targetId: user.id },
    });
    expect(audit).not.toBeNull();
  });

  it('the link sets a password once, then stops working', async () => {
    const { user, link } = (
      await req('POST', '/api/users', admin, {
        email: 'link.once@fleethub.test',
        name: 'Link Once',
        role: 'EDITOR',
      })
    ).json();
    const token = tokenOf(link.path);
    const info = await req('GET', `/api/auth/reset/${token}`, null);
    expect(info.json()).toEqual({ name: 'Link Once', email: 'link.once@fleethub.test' });
    const short = await req('POST', '/api/auth/reset', null, { token, password: 'short' });
    expect(short.json().issues).toEqual([{ path: 'password', code: 'too_small' }]);
    const ok = await req('POST', '/api/auth/reset', null, { token, password: PASSWORD });
    expect(ok.statusCode).toBe(200);
    expect(
      (await req('POST', '/api/auth/reset', null, { token, password: PASSWORD })).statusCode,
    ).toBe(410);
    expect((await req('GET', `/api/auth/reset/${token}`, null)).statusCode).toBe(410);
    await login(app, 'link.once@fleethub.test');
    const audit = await app.db.auditLog.findFirst({
      where: { action: 'user.passwordReset', targetId: user.id },
    });
    expect(audit).not.toBeNull();
  });

  it('rejects unknown and expired links, and a new link ends the old one', async () => {
    expect((await req('GET', `/api/auth/reset/${'x'.repeat(43)}`, null)).statusCode).toBe(410);
    const { user, link } = (
      await req('POST', '/api/users', admin, {
        email: 'link.old@fleethub.test',
        name: 'Link Old',
        role: 'VIEWER',
      })
    ).json();
    const second = (await req('POST', `/api/users/${user.id}/reset-link`, admin)).json();
    expect((await req('GET', `/api/auth/reset/${tokenOf(link.path)}`, null)).statusCode).toBe(410);
    expect((await req('GET', `/api/auth/reset/${tokenOf(second.path)}`, null)).statusCode).toBe(
      200,
    );
    await app.db.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await req('GET', `/api/auth/reset/${tokenOf(second.path)}`, null)).statusCode).toBe(
      410,
    );
  });

  it('turning a user off signs them out and blocks their link; nobody is deleted', async () => {
    const email = await createUser(app, 'EDITOR');
    const cookie = await login(app, email);
    const user = await app.db.user.findUniqueOrThrow({ where: { email } });
    const link = (await req('POST', `/api/users/${user.id}/reset-link`, admin)).json();
    const off = await req('PUT', `/api/users/${user.id}`, admin, { active: false });
    expect(off.json()).toMatchObject({ active: false });
    expect((await req('GET', '/api/auth/me', cookie)).statusCode).toBe(401);
    expect((await req('GET', `/api/auth/reset/${tokenOf(link.path)}`, null)).statusCode).toBe(410);
    expect((await req('POST', `/api/users/${user.id}/reset-link`, admin)).statusCode).toBe(409);
    const login2 = await req('POST', '/api/auth/login', null, { email, password: PASSWORD });
    expect(login2.statusCode).toBe(401);
    expect((await req('DELETE', `/api/users/${user.id}`, admin)).statusCode).toBe(404);
  });

  it('an admin cannot demote or turn off themselves', async () => {
    expect(
      (await req('PUT', `/api/users/${adminId}`, admin, { role: 'EDITOR' })).json().error,
    ).toBe('cannot_change_self');
    expect((await req('PUT', `/api/users/${adminId}`, admin, { active: false })).statusCode).toBe(
      400,
    );
    expect((await req('PUT', `/api/users/${adminId}`, admin, { name: 'Renamed' })).statusCode).toBe(
      200,
    );
  });
});

describe('own password', () => {
  it('needs the current password and signs out other devices', async () => {
    const email = await createUser(app, 'VIEWER');
    const here = await login(app, email);
    const other = await login(app, email);
    const wrong = await req('POST', '/api/auth/password', here, {
      current: 'not my password',
      next: 'a brand new password',
    });
    expect(wrong.json().issues).toEqual([{ path: 'current', code: 'wrong' }]);
    const ok = await req('POST', '/api/auth/password', here, {
      current: PASSWORD,
      next: 'a brand new password',
    });
    expect(ok.statusCode).toBe(200);
    expect((await req('GET', '/api/auth/me', here)).statusCode).toBe(200);
    expect((await req('GET', '/api/auth/me', other)).statusCode).toBe(401);
    const res = await req('POST', '/api/auth/login', null, {
      email,
      password: 'a brand new password',
    });
    expect(res.statusCode).toBe(200);
  });
});

describe('preferences', () => {
  it('saves language and theme, null follows the device', async () => {
    expect((await req('GET', '/api/me/preferences', viewer)).json()).toMatchObject({
      language: null,
      theme: null,
    });
    const res = await req('PUT', '/api/me/preferences', viewer, { language: 'he', theme: 'light' });
    expect(res.json()).toMatchObject({ language: 'he', theme: 'light' });
    expect((await req('GET', '/api/me/preferences', viewer)).json()).toMatchObject({
      language: 'he',
      theme: 'light',
    });
  });
});

describe('security headers', () => {
  it('sends helmet headers on API responses', async () => {
    const res = await req('GET', '/api/health', null);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
  });
});
