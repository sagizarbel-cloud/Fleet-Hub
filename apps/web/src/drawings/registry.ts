import type { VehicleTypeCode } from '@fleet-hub/shared';
import type { VehicleDrawingDef } from './model';
import { pickup } from './types/pickup';

/** One drawing per vehicle type. Types not drawn yet fall back to the generic drawing. */
export const DRAWINGS: Partial<Record<VehicleTypeCode, VehicleDrawingDef>> = {
  pickup,
};

export function drawingFor(type: string): VehicleDrawingDef {
  return DRAWINGS[type as VehicleTypeCode] ?? DRAWINGS.other ?? pickup;
}
