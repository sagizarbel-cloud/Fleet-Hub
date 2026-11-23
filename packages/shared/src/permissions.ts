import { z } from 'zod';
import { hasRole, type Role } from './enums';
import { RECORD_KINDS } from './records';

/**
 * Who may edit what (Sagi, 2026-11-22): an admin sets, for each card and each vehicle field,
 * the lowest role that may add and change it: viewers, editors or admins only. Saved as an app
 * setting, so every change is in the audit log with who made it and what it was before.
 */
export const EDIT_LEVELS = ['VIEWER', 'EDITOR', 'ADMIN'] as const satisfies readonly Role[];
export type EditLevel = (typeof EDIT_LEVELS)[number];

/** The cards of a vehicle page that can be edited: the record kinds, plus these. */
export const PERMISSION_CARDS = [
  'vehicle',
  ...RECORD_KINDS,
  'ownership',
  'items',
  'tool',
  'fuelLevel',
] as const;
export type PermissionCard = (typeof PERMISSION_CARDS)[number];

/** The vehicle's own fields (the Add / Edit vehicle form), each of which can have its own level. */
export const PERMISSION_FIELDS = [
  'type',
  'serial',
  'vin',
  'licenseNo',
  'make',
  'model',
  'year',
  'department',
  'location',
  'operatorName',
  'odometerKm',
  'engineHours',
  'nextServiceDate',
  'nextServiceKm',
  'nextServiceHours',
  'annualTestExpiry',
  'insuranceExpiry',
  'safetyCheckExpiry',
  'purchaseDate',
  'purchasePrice',
  'supplier',
  'warrantyTerms',
  'warrantyExpiry',
] as const;
export type PermissionField = (typeof PERMISSION_FIELDS)[number];

const level = z.enum(EDIT_LEVELS);
export const permissionsSchema = z.object({
  cards: z.partialRecord(z.enum(PERMISSION_CARDS), level).default({}),
  /** A field without its own level follows the "vehicle" card. */
  fields: z.partialRecord(z.enum(PERMISSION_FIELDS), level).default({}),
});
export type Permissions = z.output<typeof permissionsSchema>;

/** As things were before this setting: viewers add notes and wiggle tests, editors the rest. */
export const DEFAULT_CARD_LEVELS: Record<PermissionCard, EditLevel> = {
  vehicle: 'EDITOR',
  service: 'EDITOR',
  malfunctions: 'EDITOR',
  fluids: 'EDITOR',
  fuel: 'EDITOR',
  movements: 'EDITOR',
  inspections: 'EDITOR',
  notes: 'VIEWER',
  workCards: 'EDITOR',
  wiggleTests: 'VIEWER',
  ownership: 'EDITOR',
  items: 'EDITOR',
  tool: 'EDITOR',
  fuelLevel: 'EDITOR',
};
export const DEFAULT_PERMISSIONS: Permissions = { cards: {}, fields: {} };

export const cardLevel = (p: Permissions | undefined, card: PermissionCard): EditLevel =>
  p?.cards[card] ?? DEFAULT_CARD_LEVELS[card];

export const fieldLevel = (p: Permissions | undefined, field: PermissionField): EditLevel =>
  p?.fields[field] ?? cardLevel(p, 'vehicle');

/** May this role add to the card (and change rows it may change; see canChangeRow)? */
export const canEditCard = (role: Role, p: Permissions | undefined, card: PermissionCard) =>
  hasRole(role, cardLevel(p, card));

export const canEditField = (role: Role, p: Permissions | undefined, field: PermissionField) =>
  hasRole(role, fieldLevel(p, field));

/**
 * A row of a card open to viewers can be changed by its author or by an editor; on other cards
 * whoever may add may also change.
 */
export function canChangeRow(
  user: { id: string; role: Role },
  p: Permissions | undefined,
  card: PermissionCard,
  createdById: string | null | undefined,
) {
  const lvl = cardLevel(p, card);
  if (lvl === 'VIEWER') return hasRole(user.role, 'EDITOR') || createdById === user.id;
  return hasRole(user.role, lvl);
}

/** Vehicle fields this role may not change. */
export const lockedFields = (role: Role, p: Permissions | undefined) =>
  PERMISSION_FIELDS.filter((f) => !canEditField(role, p, f));
