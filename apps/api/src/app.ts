import Fastify, { type FastifyServerOptions } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { Env } from './env';
import { HttpError } from './lib/http';
import { authPlugin } from './plugins/auth';
import { dbPlugin } from './plugins/db';
import { attachmentRoutes } from './routes/attachments';
import { authRoutes } from './routes/auth';
import { fleetRoutes } from './routes/fleet';
import { dashboardRoutes } from './routes/dashboard';
import { eventRoutes } from './routes/events';
import { lookupRoutes } from './routes/lookups';
import { itemRoutes } from './routes/items';
import { quoteRoutes } from './routes/quotes';
import { receiptRoutes } from './routes/receipts';
import { meRoutes } from './routes/me';
import { recordRoutes } from './routes/records';
import { vehicleRoutes } from './routes/vehicles';
import { settingsRoutes } from './routes/settings';
import { userRoutes } from './routes/users';
import { importRoutes } from './routes/import';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export async function buildApp(env: Env, opts: FastifyServerOptions = {}) {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      // Request bodies are never logged; also hide cookies and credentials.
      redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
    },
    trustProxy: env.NODE_ENV === 'production',
    bodyLimit: 1024 * 1024,
    ...opts,
  });

  await app.register(dbPlugin, { databaseUrl: env.DATABASE_URL });
  await app.register(cookie, { secret: env.SESSION_SECRET });
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
    },
  });
  await app.register(rateLimit, { global: false });
  await app.register(authPlugin);

  // CSRF defense on top of SameSite cookies: writes must come from our own origin.
  app.addHook('onRequest', async (req) => {
    if (SAFE_METHODS.has(req.method)) return;
    const origin = req.headers.origin;
    if (origin && origin !== env.APP_ORIGIN) throw new HttpError(403, 'bad_origin');
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) {
      const body: Record<string, unknown> = { error: err.code };
      if ('issues' in err) body.issues = err.issues;
      return reply.status(err.statusCode).send(body);
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 429) return reply.status(429).send({ error: 'rate_limited' });
    if (status && status >= 400 && status < 500)
      return reply.status(status).send({ error: 'bad_request' });
    req.log.error(err);
    return reply.status(500).send({ error: 'internal' });
  });

  app.get('/api/health', async () => {
    await app.db.$queryRaw`SELECT 1`;
    return { ok: true };
  });
  await app.register(authRoutes, {
    prefix: '/api/auth',
    secureCookies: env.NODE_ENV === 'production',
  });
  await app.register(lookupRoutes, { prefix: '/api/lookups' });
  await app.register(vehicleRoutes, {
    prefix: '/api/vehicles',
    codeKey: env.FLEET_CODE_KEY,
    uploadDir: env.UPLOAD_DIR,
    maxMb: env.UPLOAD_MAX_MB,
  });
  await app.register(recordRoutes, { prefix: '/api/vehicles' });
  await app.register(attachmentRoutes, {
    prefix: '/api/attachments',
    uploadDir: env.UPLOAD_DIR,
    maxMb: env.UPLOAD_MAX_MB,
  });
  await app.register(itemRoutes, { prefix: '/api/items' });
  await app.register(receiptRoutes, { prefix: '/api/receipts' });
  await app.register(quoteRoutes, { prefix: '/api/quotes' });
  await app.register(meRoutes, { prefix: '/api/me' });
  await app.register(dashboardRoutes, { prefix: '/api/dashboard' });
  await app.register(fleetRoutes, { prefix: '/api/fleet' });
  await app.register(eventRoutes, { prefix: '/api/events' });
  await app.register(settingsRoutes, { prefix: '/api/settings' });
  await app.register(userRoutes, { prefix: '/api/users' });
  await app.register(importRoutes, { prefix: '/api/import', codeKey: env.FLEET_CODE_KEY });

  return app;
}
