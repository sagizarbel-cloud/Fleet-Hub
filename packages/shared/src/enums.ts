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

/** Codes of the vehicle types: the 11 in SPEC A4 plus an equipment trailer and a mobile compressor (2026-10-26). Display names live in the VehicleType lookup. */
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
  'trailer',
  'compressor',
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
  'QUOTE_UNLINKED',
  'NOTE_ADDED',
  'WORK_CARD',
  'MALFUNCTION_PROGRESS',
  'TOOL_CHANGED',
  'RECORD_EDITED',
  'RECORD_DELETED',
  'RECORD_RESTORED',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** Revisions 1: work cards. */
export const WORK_TYPES = ['ROUTINE', 'MECHANICAL'] as const;
export type WorkType = (typeof WORK_TYPES)[number];
export const WORK_PERFORMERS = ['IN_HOUSE', 'CONTRACTED'] as const;
export type WorkPerformer = (typeof WORK_PERFORMERS)[number];

/** Revisions 1: tools an excavator's arm can carry; the drawing shows the current one. */
export const EXCAVATOR_TOOLS = ['bucket', 'hammer', 'ripper', 'grab'] as const;
export type ExcavatorTool = (typeof EXCAVATOR_TOOLS)[number];
/** Vehicle types whose arm takes a tool. */
export const TOOL_TYPES = ['tracked_excavator', 'wheeled_excavator'] as const;

/** Keys of the extra fields an admin can add to a record kind (Revisions 1): up to three. */
export const CUSTOM_FIELD_KEYS = ['c1', 'c2', 'c3'] as const;
export type CustomFieldKey = (typeof CUSTOM_FIELD_KEYS)[number];
export const CUSTOM_FIELD_TYPES = ['text', 'number', 'date'] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];
