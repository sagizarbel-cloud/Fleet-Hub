// Receipts, quotes and equipment (SPEC 5.5–5.7). Plain constants, like fleet.ts.
import { hasRole, type Role } from './enums';

export const DOCUMENT_KINDS = ['RECEIPT', 'INVOICE', 'OTHER'] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

/** Suggested receipts come from viewers and wait for an editor or admin (Sagi, 2026-10-27). */
export const RECEIPT_STATES = ['approved', 'suggested'] as const;
export type ReceiptState = (typeof RECEIPT_STATES)[number];

export const QUOTE_STATUSES = ['REQUESTED', 'RECEIVED', 'APPROVED', 'ORDERED', 'REJECTED'] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

/** The status flow: each step moves forward or to Rejected; a rejected quote can be reopened. */
export const QUOTE_NEXT: Record<QuoteStatus, readonly QuoteStatus[]> = {
  REQUESTED: ['RECEIVED', 'REJECTED'],
  RECEIVED: ['APPROVED', 'REJECTED'],
  APPROVED: ['ORDERED', 'REJECTED'],
  ORDERED: [],
  REJECTED: ['REQUESTED'],
};

/** Approving and ordering is for editors and admins; viewers' quotes are suggestions until then. */
export function canSetQuoteStatus(role: Role, to: QuoteStatus): boolean {
  return to === 'APPROVED' || to === 'ORDERED' ? hasRole(role, 'EDITOR') : true;
}

export const QUOTE_VISIBILITIES = ['STANDARD', 'PUBLIC', 'ADMINS'] as const;
export type QuoteVisibility = (typeof QUOTE_VISIBILITIES)[number];

export const LINE_CONDITIONS = ['IN_STOCK', 'NEW', 'NEEDS_REPLACEMENT'] as const;
export type LineCondition = (typeof LINE_CONDITIONS)[number];

/** Kinds of attachable equipment in the catalog. */
export const ITEM_KINDS = [
  'bucket',
  'hydraulic_breaker',
  'concrete_crusher',
  'generator',
  'equipment_box',
  'adapter',
  'pallet_forks',
  'tool',
  'other',
] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

/** Receipt categories whose unlinked receipts count as fuel in the cost columns; the rest count as maintenance. */
export const FUEL_RECEIPT_CATEGORIES = ['fuel'] as const;
