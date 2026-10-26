import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { deriveStatus } from '@fleet-hub/shared';

type Tx = Prisma.TransactionClient;

/**
 * Recomputes one vehicle's cached status (SPEC A7) and, when it changed, writes a
 * STATUS_CHANGED event with the old and new colour. Call it inside the write's transaction.
 */
export async function refreshStatus(
  tx: Tx,
  vehicleId: string,
  userId: string | null,
  { now = new Date(), silent = false }: { now?: Date; silent?: boolean } = {},
) {
  const vehicle = await tx.vehicle.findUniqueOrThrow({
    where: { id: vehicleId },
    select: {
      status: true,
      statusOverride: true,
      annualTestExpiry: true,
      insuranceExpiry: true,
      malfunctions: {
        where: { deletedAt: null, state: { not: 'RESOLVED' } },
        select: { severity: true, state: true },
      },
    },
  });
  const next = deriveStatus(
    {
      malfunctions: vehicle.malfunctions,
      annualTestExpiry: vehicle.annualTestExpiry,
      insuranceExpiry: vehicle.insuranceExpiry,
      override: vehicle.statusOverride,
    },
    now,
  );
  if (next === vehicle.status) return next;
  await tx.vehicle.update({ where: { id: vehicleId }, data: { status: next } });
  // An override logs its own STATUS_OVERRIDDEN event instead.
  if (silent) return next;
  await tx.event.create({
    data: {
      type: 'STATUS_CHANGED',
      vehicleId,
      occurredAt: now,
      userId,
      params: { from: vehicle.status, to: next },
    },
  });
  return next;
}

/**
 * Dates expire with nobody saving anything, so every vehicle is re-checked on start-up and
 * then hourly. Returns how many vehicles changed colour.
 */
export async function sweepStatuses(app: FastifyInstance, now: Date = new Date()) {
  const vehicles = await app.db.vehicle.findMany({ select: { id: true, status: true } });
  let changed = 0;
  for (const v of vehicles) {
    const next = await app.db.$transaction((tx) => refreshStatus(tx, v.id, null, { now }));
    if (next !== v.status) changed++;
  }
  return changed;
}

export const SWEEP_EVERY_MS = 60 * 60 * 1000;
