import type { Prisma } from '@prisma/client';
import {
  appSettingsBody,
  DEFAULT_APP_SETTINGS,
  missingFuelFields,
  type AppSettings,
  type FuelDetailField,
} from '@fleet-hub/shared';
import { HttpError } from './http';

type Tx = Prisma.TransactionClient;
type Key = keyof AppSettings;

/** Every app setting, with defaults for keys never saved; a stored value that no longer parses falls back too. */
export async function readAppSettings(tx: Tx): Promise<AppSettings> {
  const rows = await tx.appSetting.findMany();
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const merged = { ...DEFAULT_APP_SETTINGS, ...stored };
  const parsed = appSettingsBody.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_APP_SETTINGS;
}

/** Saves the settings that changed and logs each change (who, before, after) in the audit log. */
export async function writeAppSettings(tx: Tx, userId: string, next: AppSettings) {
  const current = await readAppSettings(tx);
  for (const key of Object.keys(next) as Key[]) {
    if (JSON.stringify(current[key]) === JSON.stringify(next[key])) continue;
    const value = next[key] as Prisma.InputJsonObject;
    await tx.appSetting.upsert({
      where: { key },
      create: { key, value, updatedById: userId },
      update: { value, updatedById: userId },
    });
    await tx.auditLog.create({
      data: {
        userId,
        action: 'setting.changed',
        targetType: 'AppSetting',
        targetId: key,
        meta: { before: current[key] as Prisma.InputJsonObject, after: value },
      },
    });
  }
  return readAppSettings(tx);
}

/**
 * Refuses a fuel entry that leaves out a field an admin made mandatory. Checked on the add and
 * edit routes only, so an Excel import of old sheets still goes through.
 */
export async function checkFuelRequired(tx: Tx, input: Partial<Record<FuelDetailField, unknown>>) {
  const { fuelRequired } = await readAppSettings(tx);
  const missing = missingFuelFields(fuelRequired, input);
  if (missing.length)
    throw Object.assign(new HttpError(400, 'validation_failed'), {
      issues: missing.map((path) => ({ path, code: 'required' })),
    });
}
