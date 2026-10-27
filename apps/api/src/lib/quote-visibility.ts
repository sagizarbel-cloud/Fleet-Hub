import type { Prisma } from '@prisma/client';
import type { QuoteVisibility, SessionUser } from '@fleet-hub/shared';

/**
 * The one quote visibility filter (SPEC 5.6). Every query that returns quotes, quote counts
 * or quote events goes through this: admins see all; others see every quote they created,
 * whatever its level (Sagi, 2026-10-27), plus PUBLIC ones.
 */
export function visibleQuotesWhere(user: SessionUser): Prisma.QuoteWhereInput {
  if (user.role === 'ADMIN') return { deletedAt: null };
  return {
    deletedAt: null,
    OR: [{ visibility: 'PUBLIC' }, { createdById: user.id }],
  };
}

/** Editing and deleting: admins, or the creator unless an admin locked it as ADMINS. */
export function canEditQuote(
  user: SessionUser,
  quote: { createdById: string; visibility: QuoteVisibility },
): boolean {
  if (user.role === 'ADMIN') return true;
  return quote.createdById === user.id && quote.visibility !== 'ADMINS';
}

/** Event types tied to a quote, hidden with it. */
export const QUOTE_EVENTS = ['QUOTE_LINKED', 'QUOTE_UNLINKED'] as const;
