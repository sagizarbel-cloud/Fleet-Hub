import type { VehicleTypeCode } from '@fleet-hub/shared';
import { sideView, topView } from './derive';
import type { VehicleDrawingDef, VehicleDrawingSource } from './model';
import { pickup } from './types/pickup';
import { trackedExcavator, wheeledExcavator } from './types/excavators';
import { wheelLoader } from './types/wheel-loader';
import { trailer } from './types/trailer';
import { compressor, forklift, other, skidSteer, tractor } from './types/small-machines';
import { truck, van } from './types/road';

const complete = (src: VehicleDrawingSource): VehicleDrawingDef => ({
  iso: src.iso,
  top: src.top ?? topView(src.iso),
  side: src.side ?? sideView(src.iso),
});

const SOURCES: VehicleDrawingSource[] = [
  trackedExcavator,
  wheeledExcavator,
  wheelLoader,
  skidSteer,
  tractor,
  forklift,
  truck,
  pickup,
  van,
  trailer,
  compressor,
  other,
];

/**
 * One drawing per vehicle type, filed under the type the drawing itself shows, so a drawing
 * can never appear under another type's name. Types without one (the backhoe loader, which
 * this fleet doesn't have) use the generic "other" drawing.
 */
export const DRAWINGS: Partial<Record<VehicleTypeCode, VehicleDrawingDef>> = Object.fromEntries(
  SOURCES.map((src) => [src.represents, complete(src)]),
);

/** True when `type` has a drawing of its own (not the generic one). */
export const hasOwnDrawing = (type: string) => type in DRAWINGS;

export function drawingFor(type: string): VehicleDrawingDef {
  return DRAWINGS[type as VehicleTypeCode] ?? DRAWINGS.other!;
}
