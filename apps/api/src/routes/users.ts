import type { FastifyPluginAsync } from 'fastify';
import { Prisma } from '@prisma/client';
import { hash } from '@node-rs/argon2';
import { idParam, RESET_LINK_HOURS, userBody, userUpdateBody } from '@fleet-hub/shared';
import { HttpError, parse } from '../lib/http';
import { newToken } from '../lib/tokens';
import { requireRole } from '../plugins/auth';

const select = {
  id: true,
  email: true,
  name: true,
  role: true,
  canViewStartCodes: true,
  active: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

/**
 * A one-time link to set a password (SPEC: no email server, the admin sends it by WhatsApp).
 * Only the token's hash is stored; earlier unused links for the same user stop working.
 */
export async function createResetLink(
  tx: Prisma.TransactionClient,
  userId: string,
  createdById: string,
) {
  const { token, hash: tokenHash } = newToken();
  const now = new Date();
  await tx.passwordResetToken.updateMany({
    where: { userId, usedAt: null },
    data: { usedAt: now },
  });
  const expiresAt = new Date(now.getTime() + RESET_LINK_HOURS * 3_600_000);
  await tx.passwordResetToken.create({ data: { tokenHash, userId, createdById, expiresAt } });
  return { path: `/reset/${token}`, expiresAt };
}

/** Users and roles (SPEC 5.9, admins only). Users are turned off, never deleted (Sagi, 2026-10-27). */
export const userRoutes: FastifyPluginAsync = async (app) => {
  const admin = { preHandler: requireRole('ADMIN') };

  app.get('/', admin, async () => ({
    items: await app.db.user.findMany({ select, orderBy: [{ active: 'desc' }, { name: 'asc' }] }),
  }));

  // A new user gets no password: the admin shares a link and they choose one.
  app.post('/', admin, async (req, reply) => {
    const body = parse(userBody, req.body);
    const me = req.user!;
    const result = await app.db
      .$transaction(async (tx) => {
        const user = await tx.user.create({
          // An unguessable hash nobody knows, until the link sets a real password.
          data: { ...body, passwordHash: await hash(newToken().token) },
          select,
        });
        await tx.auditLog.create({
          data: {
            userId: me.id,
            action: 'user.create',
            targetType: 'User',
            targetId: user.id,
            meta: { role: user.role, canViewStartCodes: user.canViewStartCodes },
            ip: req.ip,
          },
        });
        return { user, link: await createResetLink(tx, user.id, me.id) };
      })
      .catch((err: unknown) => {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')
          throw Object.assign(new HttpError(400, 'validation_failed'), {
            issues: [{ path: 'email', code: 'taken' }],
          });
        throw err;
      });
    void reply.status(201);
    return result;
  });

  app.put('/:id', admin, async (req) => {
    const { id } = parse(idParam, req.params);
    const body = parse(userUpdateBody, req.body);
    const me = req.user!;
    // An admin can't lock themselves out by mistake.
    if (id === me.id && ((body.role && body.role !== 'ADMIN') || body.active === false))
      throw new HttpError(400, 'cannot_change_self');
    return app.db.$transaction(async (tx) => {
      const before = await tx.user.findUnique({ where: { id }, select });
      if (!before) throw new HttpError(404, 'not_found');
      const user = await tx.user.update({ where: { id }, data: body, select });
      // Turned off: every device is signed out at once.
      if (body.active === false) await tx.session.deleteMany({ where: { userId: id } });
      const changed = (Object.keys(body) as (keyof typeof body)[]).filter(
        (k) => body[k] !== undefined && body[k] !== before[k],
      );
      if (changed.length)
        await tx.auditLog.create({
          data: {
            userId: me.id,
            action: 'user.update',
            targetType: 'User',
            targetId: id,
            meta: Object.fromEntries(changed.map((k) => [k, body[k] as string | boolean])),
            ip: req.ip,
          },
        });
      return user;
    });
  });

  app.post('/:id/reset-link', admin, async (req) => {
    const { id } = parse(idParam, req.params);
    const me = req.user!;
    return app.db.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id }, select: { id: true, active: true } });
      if (!user) throw new HttpError(404, 'not_found');
      if (!user.active) throw new HttpError(409, 'user_inactive');
      await tx.auditLog.create({
        data: {
          userId: me.id,
          action: 'user.resetLink',
          targetType: 'User',
          targetId: id,
          ip: req.ip,
        },
      });
      return createResetLink(tx, id, me.id);
    });
  });
};
