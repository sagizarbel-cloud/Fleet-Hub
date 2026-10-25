export const ROLES = ['VIEWER', 'EDITOR', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

const ROLE_RANK: Record<Role, number> = { VIEWER: 0, EDITOR: 1, ADMIN: 2 };

/** True when `role` is at least as powerful as `required`. */
export function hasRole(role: Role, required: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[required];
}

export const VEHICLE_STATUSES = ['GREEN', 'AMBER', 'RED'] as const;
export type VehicleStatus = (typeof VEHICLE_STATUSES)[number];

export const VEHICLE_CATEGORIES = ['ROAD', 'EQUIPMENT'] as const;
export type VehicleCategory = (typeof VEHICLE_CATEGORIES)[number];

/** Codes of the 11 vehicle types in SPEC A4. Display names live in the VehicleType lookup. */
export const VEHICLE_TYPE_CODES = [
  'tracked_excavator',
  'wheeled_excavator',
  'backhoe_loader',
  'wheel_loader',
  'skid_steer',
  'tractor',
  'forklift',
  'truck',
  'pickup',
  'van',
  'other',
] as const;
export type VehicleTypeCode = (typeof VEHICLE_TYPE_CODES)[number];

export const MALFUNCTION_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type MalfunctionSeverity = (typeof MALFUNCTION_SEVERITIES)[number];

export const MALFUNCTION_STATES = ['OPEN', 'IN_PROGRESS', 'RESOLVED'] as const;
export type MalfunctionState = (typeof MALFUNCTION_STATES)[number];

export const EVENT_TYPES = [
  'VEHICLE_CREATED',
  'VEHICLE_UPDATED',
  'STATUS_CHANGED',
  'STATUS_OVERRIDDEN',
  'SERVICE',
  'MALFUNCTION_REPORTED',
  'MALFUNCTION_UPDATED',
  'MALFUNCTION_RESOLVED',
  'FLUID_ADDED',
  'FUEL_ADDED',
  'MOVEMENT',
  'INSPECTION',
  'ITEM_ASSIGNED',
  'ITEM_REMOVED',
  'DOCUMENT_ADDED',
  'QUOTE_LINKED',
  'NOTE_ADDED',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];
