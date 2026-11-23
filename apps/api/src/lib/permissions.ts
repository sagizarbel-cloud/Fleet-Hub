import type { FastifyRequest } from 'fastify';
import type { Prisma } from '@prisma/client';
import {
  canEditCard,
  canEditField,
  PERMISSION_FIELDS,
  vehicleBody,
  type PermissionCard,
  type Permissions,
  type SessionUser,
  type VehicleInput,
} from '@fleet-hub/shared';
import { readAppSettings } from './app-settings';
import { HttpError } from './http';
import { vehicleForm } from './vehicle-write';

type Tx = Prisma.TransactionClient;

/** A preHandler: signed in, and allowed to edit `card` by the admin's settings (2026-11-22). */
export function requireCard(card: PermissionCard) {
  return async (req: FastifyRequest) => {
    const user = req.user;
    if (!user) throw new HttpError(401, 'unauthenticated');
    const { permissions } = await readAppSettings(req.server.db as unknown as Tx);
    if (!canEditCard(user.role, permissions, card)) throw new HttpError(403, 'forbidden');
  };
}

/** May the user open a vehicle's form at all: the card, or at least one of its fields. */
export const canOpenVehicleForm = (user: SessionUser, p: Permissions) =>
  canEditCard(user.role, p, 'vehicle') ||
  PERMISSION_FIELDS.some((f) => canEditField(user.role, p, f));

const same = (a: unknown, b: unknown) =>
  a instanceof Date || b instanceof Date
    ? (a as Date | null)?.getTime?.() === (b as Date | null)?.getTime?.()
    : JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Refuses a vehicle add or edit that sets a field the user may not change: on an add, any value
 * in it; on an edit, any change to it. Each such field is reported as `locked`.
 */
export async function checkVehicleFields(
  tx: Tx,
  user: SessionUser,
  p: Permissions,
  serial: string | null,
  input: VehicleInput,
) {
  const locked = PERMISSION_FIELDS.filter((f) => !canEditField(user.role, p, f));
  if (!locked.length) return;
  let current: Partial<VehicleInput> = {};
  if (serial) {
    const form = await vehicleForm(tx, serial);
    if (!form) throw new HttpError(404, 'vehicle_not_found');
    const parsed = vehicleBody.safeParse(form.values);
    current = parsed.success ? parsed.data : (form.values as unknown as Partial<VehicleInput>);
  }
  const issues = locked
    .filter((f) => {
      const next = (input as Record<string, unknown>)[f];
      const before = (current as Record<string, unknown>)[f];
      return serial ? !same(next, before) : next !== null && next !== undefined && next !== '';
    })
    .map((path) => ({ path, code: 'locked' }));
  if (issues.length) throw Object.assign(new HttpError(400, 'validation_failed'), { issues });
}
