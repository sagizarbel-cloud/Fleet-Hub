import type { Prisma } from '@prisma/client';
import type { SessionUser } from '@fleet-hub/shared';

/**
 * The one quote visibility filter (SPEC 5.6). Every query that returns quotes, quote counts
 * or quote events goes through this: admins see all; others see their own STANDARD quotes
 * plus PUBLIC ones. ADMINS quotes are hidden even from their creator.
 */
export function visibleQuotesWhere(user: SessionUser): Prisma.QuoteWhereInput {
  if (user.role === 'ADMIN') return { deletedAt: null };
  return {
    deletedAt: null,
    OR: [{ visibility: 'PUBLIC' }, { visibility: 'STANDARD', createdById: user.id }],
  };
}
