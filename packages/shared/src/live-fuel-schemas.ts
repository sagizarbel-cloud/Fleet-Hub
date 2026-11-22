import { z } from 'zod';
import { FUEL_MAX_BATCH } from './live-fuel';

/** Ingest and manual-level schemas for current fuel (see live-fuel.ts and docs/LIVE-DATA.md). */

const pct = z.number().min(0).max(100);
const liters = z.number().min(0).max(100_000);

/** Setting the level by hand (an editor reading the gauge). */
export const fuelLevelBody = z.object({
  pct,
  liters: liters.nullish(),
});
export type FuelLevelBody = z.infer<typeof fuelLevelBody>;

/**
 * One reading from a connected vehicle (docs/LIVE-DATA.md). A connection tied to one vehicle may
 * leave out `serial` and `vin`; a gateway connection names the vehicle in every reading. At least
 * one of `fuelLevelPct`, `fuelLiters` and `engineHours` is needed. Fields the shape doesn't know are ignored, so a
 * provider can pass its own along.
 */
export const fuelReadingInput = z
  .object({
    serial: z.string().trim().min(1).max(40).optional(),
    vin: z.string().trim().min(1).max(40).optional(),
    at: z.iso.datetime({ offset: true }).optional(),
    fuelLevelPct: pct.optional(),
    fuelLiters: liters.optional(),
    /** The engine's hour meter (2026-11-22): updates the vehicle's engine hours live. */
    engineHours: z.number().min(0).max(1_000_000).optional(),
  })
  .refine(
    (r) =>
      r.fuelLevelPct !== undefined || r.fuelLiters !== undefined || r.engineHours !== undefined,
    'noData',
  );
export type FuelReadingInput = z.infer<typeof fuelReadingInput>;

/**
 * The ingest body: `{ "readings": [...] }`, a bare array of readings, or one reading on its own.
 * Each reading is checked on its own (fuelReadingInput), so one bad reading doesn't sink a batch.
 */
export const fuelIngestBody = z.preprocess(
  (b) =>
    Array.isArray(b)
      ? { readings: b }
      : b && typeof b === 'object' && !('readings' in b)
        ? { readings: [b] }
        : b,
  z.object({ readings: z.array(z.unknown()).min(1).max(FUEL_MAX_BATCH) }),
);

export const connectionBody = z.object({
  name: z.string().trim().min(1).max(80),
  /** The vehicle this connection reports for; empty = a gateway that names the vehicle per reading. */
  serial: z.string().trim().max(40).nullish(),
});
export type ConnectionBody = z.infer<typeof connectionBody>;
