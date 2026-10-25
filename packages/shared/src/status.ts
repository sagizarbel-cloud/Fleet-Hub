import type { MalfunctionSeverity, MalfunctionState, VehicleStatus } from './enums';

export interface StatusInput {
  malfunctions: { severity: MalfunctionSeverity; state: MalfunctionState }[];
  annualTestExpiry: Date | null;
  insuranceExpiry: Date | null;
  override?: VehicleStatus | null;
}

/**
 * Derived vehicle status (SPEC A7): a critical open malfunction or an expired
 * annual test or insurance is red; any other open malfunction is amber; else green.
 * "Open" means not resolved. A manual override wins.
 */
export function deriveStatus(input: StatusInput, now: Date = new Date()): VehicleStatus {
  if (input.override) return input.override;
  const open = input.malfunctions.filter((m) => m.state !== 'RESOLVED');
  const expired = (d: Date | null) => d !== null && d.getTime() < now.getTime();
  if (open.some((m) => m.severity === 'CRITICAL')) return 'RED';
  if (expired(input.annualTestExpiry) || expired(input.insuranceExpiry)) return 'RED';
  if (open.length > 0) return 'AMBER';
  return 'GREEN';
}
