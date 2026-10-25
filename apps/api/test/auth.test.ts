import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { requireRole } from '../src/plugins/auth';
import { createUser, login, makeApp, ORIGIN, PASSWORD } from './helpers';

let app: Awaited<ReturnType<typeof makeApp>>;

beforeAll(async () => {
  app = await makeApp();
});
afterAll(async () => {
  await app.close();
});

describe('login', () => {
  it('sets an httpOnly, signed session cookie and returns the user', async () => {
    const email = await createUser(app, 'EDITOR');
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { origin: ORIGIN },
      payload: { email, password: PASSWORD },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user).toMatchObject({ email, role: 'EDITOR', canViewStartCodes: false });
    const cookie = res.cookies.find((c) => c.name === 'fh_session')!;
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe('Lax');
    expect(res.json().user).not.toHaveProperty('passwordHash');
  });

  it('rejects a wrong password and an unknown email the same way', async () => {
    const email = await createUser(app, 'VIEWER');
    const wrong = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { origin: ORIGIN, 'x-forwarded-for': '10.0.0.1' },
      payload: { email, password: 'nope' },
    });
    const unknown = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { origin: ORIGIN },
      payload: { email: 'nobody@fleethub.test', password: 'nope' },
    });
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.json()).toEqual(unknown.json());
  });

  it('validates the body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { origin: ORIGIN },
      payload: { email: 'not-an-email' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('validation_failed');
  });

  it('rate-limits after 5 attempts a minute', async () => {
    const limited = await makeApp();
    const attempt = () =>
      limited.inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: { origin: ORIGIN },
        payload: { email: 'nobody@fleethub.test', password: 'x' },
      });
    for (let i = 0; i < 5; i++) expect((await attempt()).statusCode).toBe(401);
    expect((await attempt()).statusCode).toBe(429);
    await limited.close();
  });

  it('rejects writes from another origin', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { origin: 'https://evil.example' },
      payload: { email: 'a@b.co', password: 'x' },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('session', () => {
  it('me returns the user, and logout ends the session', async () => {
    const email = await createUser(app, 'ADMIN', { canViewStartCodes: true });
    const cookie = await login(app, email);

    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(me.json().user).toMatchObject({ email, role: 'ADMIN', canViewStartCodes: true });

    const out = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie, origin: ORIGIN } });
    expect(out.statusCode).toBe(200);
    const after = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(after.statusCode).toBe(401);
  });

  it('rejects a forged cookie', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: 'fh_session=forged.value' } });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a deactivated user', async () => {
    const email = await createUser(app, 'EDITOR');
    const cookie = await login(app, email);
    await app.db.user.update({ where: { email }, data: { active: false } });
    const res = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(res.statusCode).toBe(401);
  });
});

describe('role guards', () => {
  it('gives a viewer 403 on an editor-only route, and lets an editor through', async () => {
    const custom = await makeApp((a) => {
      a.get('/api/test/editor-only', { preHandler: requireRole('EDITOR') }, async () => ({ ok: true }));
    });

    const viewer = await login(custom, await createUser(custom, 'VIEWER'));
    const editor = await login(custom, await createUser(custom, 'EDITOR'));
    const anon = await custom.inject({ method: 'GET', url: '/api/test/editor-only' });
    const asViewer = await custom.inject({ method: 'GET', url: '/api/test/editor-only', headers: { cookie: viewer } });
    const asEditor = await custom.inject({ method: 'GET', url: '/api/test/editor-only', headers: { cookie: editor } });
    expect(anon.statusCode).toBe(401);
    expect(asViewer.statusCode).toBe(403);
    expect(asEditor.statusCode).toBe(200);
    await custom.close();
  });
});
