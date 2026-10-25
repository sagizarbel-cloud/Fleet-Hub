import type { FastifyPluginAsync } from 'fastify';
import { hash, verify } from '@node-rs/argon2';
import { loginBody } from '@fleet-hub/shared';
import { HttpError, parse } from '../lib/http';
import { newToken } from '../lib/tokens';
import { requireUser, SESSION_COOKIE, SESSION_TTL_MS } from '../plugins/auth';

// Verified when the email is unknown, so a miss costs the same time as a wrong password.
const DUMMY_HASH = await hash('not-a-real-password');

export const authRoutes: FastifyPluginAsync<{ secureCookies: boolean }> = async (app, opts) => {
  app.post(
    '/login',
    {
      config: {
        // Per account and IP, so a whole office behind one address isn't locked out together.
        rateLimit: {
          max: 5,
          timeWindow: '1 minute',
          hook: 'preHandler',
          keyGenerator: (req) => {
            const email = (req.body as { email?: unknown } | undefined)?.email;
            return `${req.ip}:${typeof email === 'string' ? email.toLowerCase() : ''}`;
          },
        },
      },
    },
    async (req, reply) => {
      const body = parse(loginBody, req.body);
      const user = await app.db.user.findUnique({ where: { email: body.email.toLowerCase() } });
      const ok = await verify(user?.passwordHash ?? DUMMY_HASH, body.password);
      if (!user || !ok || !user.active) throw new HttpError(401, 'invalid_credentials');

      const { token, hash: tokenHash } = newToken();
      await app.db.session.create({
        data: {
          tokenHash,
          userId: user.id,
          expiresAt: new Date(Date.now() + SESSION_TTL_MS),
          userAgent: req.headers['user-agent']?.slice(0, 300) ?? null,
        },
      });
      reply.setCookie(SESSION_COOKIE, token, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: opts.secureCookies,
        signed: true,
        maxAge: SESSION_TTL_MS / 1000,
      });
      return {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          canViewStartCodes: user.canViewStartCodes,
        },
      };
    },
  );

  app.post('/logout', async (req, reply) => {
    if (req.sessionId) await app.db.session.delete({ where: { id: req.sessionId } }).catch(() => {});
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/me', { preHandler: requireUser }, async (req) => ({ user: req.user }));
};
