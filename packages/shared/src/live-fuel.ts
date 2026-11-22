// Plain constants only (no zod), so the dashboard can import them; schemas are in live-fuel-schemas.ts.
import type { VehicleTypeCode } from './enums';

/**
 * Current fuel (Sagi, 2026-11-15): every vehicle's latest fuel level, set by hand or pushed in
 * real time by a connected vehicle. The telematics system isn't chosen yet, so the ingest takes
 * one provider-agnostic shape (docs/LIVE-DATA.md) and an adapter on the provider's side maps to it.
 */

export const FUEL_LEVEL_SOURCES = ['MANUAL', 'LIVE'] as const;
export type FuelLevelSource = (typeof FUEL_LEVEL_SOURCES)[number];

/** A live reading older than this shows as stale: the vehicle stopped reporting. */
export const FUEL_LIVE_MAX_AGE_MIN = 15;
/** At or below this level the bar turns red. */
export const FUEL_LOW_PCT = 20;
/** Live history is kept this long; manual readings stay. */
export const FUEL_HISTORY_DAYS = 90;
/** A reading may be stamped at most this far ahead of the server clock (clock drift). */
export const FUEL_MAX_FUTURE_MIN = 5;
/** Readings per ingest request. */
export const FUEL_MAX_BATCH = 500;

/** Types with no fuel tank, left out of the fuel panel. */
export const NO_FUEL_TYPES: readonly VehicleTypeCode[] = ['trailer'];

/** Prefix of a connection token, so a leaked one is easy to spot in logs and code. */
export const CONNECTION_TOKEN_PREFIX = 'fhl_';

export type FuelState = 'live' | 'stale' | 'manual' | 'none';

/** How a level reads now: live (a fresh live reading), stale (a live one gone quiet), manual, none. */
export function fuelState(
  level: { source: FuelLevelSource; at: Date | string } | null,
  now: number = Date.now(),
): FuelState {
  if (!level) return 'none';
  if (level.source === 'MANUAL') return 'manual';
  const age = now - new Date(level.at).getTime();
  return age <= FUEL_LIVE_MAX_AGE_MIN * 60_000 ? 'live' : 'stale';
}
