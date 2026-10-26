/**
 * The record types a vehicle page edits (SPEC 5.3). Ownership, documents and quotes have
 * their own shapes and routes; these seven share the list / add / edit / delete / Undo API.
 */
export const RECORD_KINDS = [
  'service',
  'malfunctions',
  'fluids',
  'fuel',
  'movements',
  'inspections',
  'notes',
] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];

export const INSPECTION_KINDS = ['ANNUAL_TEST', 'INSURANCE', 'SAFETY_CHECK'] as const;
export type InspectionKind = (typeof INSPECTION_KINDS)[number];

/** Columns each kind can be sorted by. The first is the default (newest first). */
export const RECORD_SORTS = {
  service: ['date', 'cost', 'vendor'],
  malfunctions: ['reportedAt', 'severity', 'state', 'cost', 'downtimeHours'],
  fluids: ['date', 'liters'],
  fuel: ['date', 'liters', 'cost'],
  movements: ['date'],
  inspections: ['date', 'validUntil', 'kind'],
  notes: ['createdAt'],
} as const satisfies Record<RecordKind, readonly string[]>;

export const SORT_DIRS = ['asc', 'desc'] as const;

/** How long the Undo bar stays after a delete (Sagi, 2026-10-26: 30 seconds). */
export const UNDO_MS = 30_000;

export function isRecordKind(s: unknown): s is RecordKind {
  return typeof s === 'string' && (RECORD_KINDS as readonly string[]).includes(s);
}
