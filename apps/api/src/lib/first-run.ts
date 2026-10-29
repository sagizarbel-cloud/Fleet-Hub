import type { PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/argon2';
import { createResetLink } from '../routes/users';
import { addBaseLists } from './base-lists';
import { newToken } from './tokens';

export type FirstRunResult =
  | { ok: true; created: boolean; path: string; expiresAt: Date }
  | { ok: false; reason: 'admin_exists' | 'email_taken' };

/**
 * First run on a new server (Phase 9): adds the base lists and the first admin, and returns a
 * one-time link for the admin to choose a password, so no password passes through a terminal.
 * Running it again for the same admin only issues a new link (e.g. the first one expired);
 * once any other admin exists it refuses, since admins then add users from Settings.
 */
export async function firstRun(
  db: PrismaClient,
  { email, name }: { email: string; name: string },
): Promise<FirstRunResult> {
  await addBaseLists(db);
  email = email.trim().toLowerCase();
  return db.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { email } });
    const otherAdmin = await tx.user.findFirst({
      where: { role: 'ADMIN', active: true, NOT: { email } },
      select: { id: true },
    });
    if (otherAdmin) return { ok: false, reason: 'admin_exists' } as const;
    if (existing && existing.role !== 'ADMIN') return { ok: false, reason: 'email_taken' } as const;

    const user =
      existing ??
      (await tx.user.create({
        data: {
          email,
          name,
          role: 'ADMIN',
          canViewStartCodes: true,
          // An unguessable hash nobody knows, until the link sets a real password.
          passwordHash: await hash(newToken().token),
        },
      }));
    if (!user.active) await tx.user.update({ where: { id: user.id }, data: { active: true } });
    await tx.auditLog.create({
      data: {
        action: existing ? 'user.resetLink' : 'user.create',
        targetType: 'User',
        targetId: user.id,
        meta: { via: 'first-run', role: 'ADMIN', canViewStartCodes: true },
      },
    });
    return { ok: true, created: !existing, ...(await createResetLink(tx, user.id, null)) } as const;
  });
}
