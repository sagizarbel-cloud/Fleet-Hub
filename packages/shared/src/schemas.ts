import { z } from 'zod';
import { ROLES } from './enums';
import { DETAIL_VIEWS, VITAL_KEYS } from './vitals';

export const loginBody = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(200),
});
export type LoginBody = z.infer<typeof loginBody>;

export const sessionUser = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  role: z.enum(ROLES),
  canViewStartCodes: z.boolean(),
});
export type SessionUser = z.infer<typeof sessionUser>;

export const lookupItem = z.object({
  id: z.string(),
  code: z.string(),
  nameEn: z.string(),
  nameHe: z.string(),
});
export type LookupItem = z.infer<typeof lookupItem>;

export const listQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListQuery = z.infer<typeof listQuery>;

export const preferencesBody = z.object({
  pinnedVitals: z
    .array(z.enum(VITAL_KEYS))
    .max(VITAL_KEYS.length)
    .refine((keys) => new Set(keys).size === keys.length, 'duplicate')
    .optional(),
  detailView: z.enum(DETAIL_VIEWS).optional(),
});
export type PreferencesBody = z.infer<typeof preferencesBody>;

export const serialParam = z.object({ serial: z.string().min(1).max(40) });
export const idParam = z.object({ id: z.string().min(1).max(40) });

export const assignItemBody = z.object({ vehicle: z.string().min(1).max(40) });
