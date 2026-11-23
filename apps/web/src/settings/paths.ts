import type { Role } from '@fleet-hub/shared';

export const SETTINGS_SECTIONS = [
  'mine',
  'lists',
  'required',
  'permissions',
  'report',
  'users',
  'import',
  'live',
] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

/** Each settings section's address and the least role that opens it. */
export const SETTINGS_PATHS: Record<SettingsSection, { path: string; role: Role }> = {
  mine: { path: '/settings', role: 'VIEWER' },
  // Editors manage the lists too (Sagi, 2026-10-27).
  lists: { path: '/settings/lists', role: 'EDITOR' },
  // Which fields must be filled, and each card's extra fields (Revisions 1): admins only.
  required: { path: '/settings/required', role: 'ADMIN' },
  // Who may edit which card and field, with its history (Sagi, 2026-11-22).
  permissions: { path: '/settings/permissions', role: 'ADMIN' },
  // The logo printed on vehicle reports (Revisions 1).
  report: { path: '/settings/report', role: 'ADMIN' },
  users: { path: '/settings/users', role: 'ADMIN' },
  import: { path: '/settings/import', role: 'ADMIN' },
  // Live data connections (2026-11-15): tokens for connected vehicles.
  live: { path: '/settings/live', role: 'ADMIN' },
};
