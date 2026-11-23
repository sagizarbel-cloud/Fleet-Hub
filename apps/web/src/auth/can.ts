import { useMemo } from 'react';
import {
  canChangeRow,
  canEditCard,
  canEditField,
  hasRole,
  type PermissionCard,
  type PermissionField,
  type Role,
} from '@fleet-hub/shared';
import { useAppSettings } from '@/vehicle/records/api';
import { useSession } from './session';

/**
 * What the signed-in user may edit, by the admin's permission settings (Sagi, 2026-11-22).
 * The server checks the same rules; this only decides which buttons and fields to show.
 */
export function useCan() {
  const { data: user } = useSession();
  const { data: settings } = useAppSettings();
  const p = settings?.permissions;
  return useMemo(() => {
    const role: Role | null = user?.role ?? null;
    const card = (c: PermissionCard) => !!role && canEditCard(role, p, c);
    const field = (f: PermissionField) => !!role && canEditField(role, p, f);
    return {
      user,
      role,
      card,
      field,
      /** May change this row of the card (its author, on cards open to viewers). */
      row: (c: PermissionCard, createdById: string | null | undefined) =>
        !!user && canChangeRow(user, p, c, createdById),
      /** May open the vehicle form: the card, or any one of its fields. */
      vehicleForm: () =>
        card('vehicle') ||
        (!!role && Object.keys(p?.fields ?? {}).some((f) => field(f as PermissionField))),
      isAdmin: !!role && hasRole(role, 'ADMIN'),
    };
  }, [user, p]);
}
