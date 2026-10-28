import type { FastifyPluginAsync } from 'fastify';
import { hash, verify } from '@node-rs/argon2';
import { changePasswordBody, loginBody, resetPasswordBody } from '@fleet-hub/shared';
import { HttpError, parse } from '../lib/http';
import { hashToken, newToken } from '../lib/tokens';
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
    if (req.sessionId)
      await app.db.session.delete({ where: { id: req.sessionId } }).catch(() => {});
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/me', { preHandler: requireUser }, async (req) => ({ user: req.user }));

  // Changing your own password needs the current one, and signs out your other devices.
  app.post(
    '/password',
    {
      preHandler: requireUser,
      config: {
        rateLimit: { max: 5, timeWindow: '1 minute', keyGenerator: (r) => r.user?.id ?? r.ip },
      },
    },
    async (req) => {
      const body = parse(changePasswordBody, req.body);
      const me = req.user!;
      const user = await app.db.user.findUniqueOrThrow({ where: { id: me.id } });
      if (!(await verify(user.passwordHash, body.current)))
        throw Object.assign(new HttpError(400, 'validation_failed'), {
          issues: [{ path: 'current', code: 'wrong' }],
        });
      await app.db.$transaction([
        app.db.user.update({ where: { id: me.id }, data: { passwordHash: await hash(body.next) } }),
        app.db.session.deleteMany({ where: { userId: me.id, id: { not: req.sessionId ?? '' } } }),
        app.db.auditLog.create({
          data: {
            userId: me.id,
            action: 'user.passwordChanged',
            targetType: 'User',
            targetId: me.id,
            ip: req.ip,
          },
        }),
      ]);
      return { ok: true };
    },
  );

  /** A reset link is good once, for 24 h; anything else gets the same answer. */
  const findReset = async (token: string) => {
    const row = await app.db.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: { select: { id: true, name: true, email: true, active: true } } },
    });
    if (!row || row.usedAt || row.expiresAt.getTime() < Date.now() || !row.user.active)
      throw new HttpError(410, 'link_invalid');
    return row;
  };
  const resetLimit = { rateLimit: { max: 20, timeWindow: '1 minute' } };

  app.get('/reset/:token', { config: resetLimit }, async (req) => {
    const { token } = parse(resetPasswordBody.pick({ token: true }), req.params);
    const row = await findReset(token);
    return { name: row.user.name, email: row.user.email };
  });

  app.post('/reset', { config: resetLimit }, async (req) => {
    const body = parse(resetPasswordBody, req.body);
    const row = await findReset(body.token);
    // Marked used in the same statement that checks it, so two quick clicks can't both win.
    const claimed = await app.db.passwordResetToken.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) throw new HttpError(410, 'link_invalid');
    await app.db.$transaction([
      app.db.user.update({
        where: { id: row.userId },
        data: { passwordHash: await hash(body.password) },
      }),
      app.db.session.deleteMany({ where: { userId: row.userId } }),
      app.db.auditLog.create({
        data: {
          userId: row.userId,
          action: 'user.passwordReset',
          targetType: 'User',
          targetId: row.userId,
          ip: req.ip,
        },
      }),
    ]);
    return { ok: true, email: row.user.email };
  });
};
