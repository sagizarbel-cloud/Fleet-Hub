import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { hash } from '@node-rs/argon2';
import type { Role } from '@fleet-hub/shared';
import { buildApp } from '../src/app';
import { loadEnv } from '../src/env';

try {
  process.loadEnvFile(path.resolve(import.meta.dirname, '../../../.env'));
} catch {
  // CI provides the environment directly.
}

export const ORIGIN = 'http://localhost:5173';
export const PASSWORD = 'correct horse battery staple';

/** Builds the app against the test database. `configure` runs before ready, e.g. to add test-only routes. */
export async function makeApp(configure?: (app: Awaited<ReturnType<typeof buildApp>>) => void) {
  const env = loadEnv({
    ...process.env,
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: process.env.DATABASE_URL_TEST,
    APP_ORIGIN: ORIGIN,
    SESSION_SECRET: process.env.SESSION_SECRET || randomBytes(32).toString('base64'),
    FLEET_CODE_KEY: process.env.FLEET_CODE_KEY || randomBytes(32).toString('base64'),
  });
  const app = await buildApp(env);
  configure?.(app);
  await app.ready();
  return app;
}

type App = Awaited<ReturnType<typeof makeApp>>;

export async function createUser(
  app: App,
  role: Role,
  extra: { canViewStartCodes?: boolean } = {},
) {
  const email = `${role.toLowerCase()}-${randomBytes(4).toString('hex')}@fleethub.test`;
  await app.db.user.create({
    data: { email, name: `Test ${role}`, role, passwordHash: await hash(PASSWORD), ...extra },
  });
  return email;
}

/** Logs in and returns the Cookie header to send on later requests. */
export async function login(app: App, email: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { origin: ORIGIN },
    payload: { email, password: PASSWORD },
  });
  if (res.statusCode !== 200) throw new Error(`login failed: ${res.statusCode} ${res.body}`);
  const cookie = res.cookies.find((c) => c.name === 'fh_session');
  return `fh_session=${cookie!.value}`;
}
