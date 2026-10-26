import { z } from 'zod';
import { ROLES } from './enums';

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
