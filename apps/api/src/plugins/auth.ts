import fp from 'fastify-plugin';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { hasRole, type Role, type SessionUser } from '@fleet-hub/shared';
import { hashToken } from '../lib/tokens';
import { HttpError } from '../lib/http';

export const SESSION_COOKIE = 'fh_session';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const TOUCH_AFTER_MS = 24 * 60 * 60 * 1000;

declare module 'fastify' {
  interface FastifyRequest {
    user: SessionUser | null;
    sessionId: string | null;
  }
}

/** Resolves the session cookie to a user on every request, with a 30-day sliding expiry. */
export const authPlugin = fp(async (app) => {
  app.decorateRequest('user', null);
  app.decorateRequest('sessionId', null);

  app.addHook('onRequest', async (req) => {
    const raw = req.cookies[SESSION_COOKIE];
    if (!raw) return;
    const unsigned = req.unsignCookie(raw);
    if (!unsigned.valid || !unsigned.value) return;

    const session = await app.db.session.findUnique({
      where: { tokenHash: hashToken(unsigned.value) },
      include: { user: true },
    });
    const now = Date.now();
    if (!session || session.expiresAt.getTime() < now || !session.user.active) return;

    if (now - session.lastSeenAt.getTime() > TOUCH_AFTER_MS) {
      await app.db.session.update({
        where: { id: session.id },
        data: { lastSeenAt: new Date(now), expiresAt: new Date(now + SESSION_TTL_MS) },
      });
    }
    const { user } = session;
    req.sessionId = session.id;
    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      canViewStartCodes: user.canViewStartCodes,
    };
  });
});

/** preHandler guard: requires a signed-in user with at least `role`. */
export function requireRole(role: Role) {
  return async (req: FastifyRequest, _reply: FastifyReply) => {
    if (!req.user) throw new HttpError(401, 'unauthenticated');
    if (!hasRole(req.user.role, role)) throw new HttpError(403, 'forbidden');
  };
}

export const requireUser = requireRole('VIEWER');

/** preHandler guard for the "view start codes" permission (used by the reveal endpoint in Phase 3). */
export async function requireStartCodeView(req: FastifyRequest) {
  if (!req.user) throw new HttpError(401, 'unauthenticated');
  if (!req.user.canViewStartCodes) throw new HttpError(403, 'forbidden');
}
