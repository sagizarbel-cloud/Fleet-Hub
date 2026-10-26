import type { VehicleTypeCode } from '@fleet-hub/shared';
import { sideView, topView } from './derive';
import type { VehicleDrawingDef, VehicleDrawingSource } from './model';
import { pickup } from './types/pickup';
import { trackedExcavator, wheeledExcavator } from './types/excavators';
import { wheelLoader } from './types/wheel-loader';
import { trailer } from './types/trailer';

const complete = (src: VehicleDrawingSource): VehicleDrawingDef => ({
  iso: src.iso,
  top: src.top ?? topView(src.iso),
  side: src.side ?? sideView(src.iso),
});

/** One drawing per vehicle type. Types not drawn yet fall back to the generic drawing. */
export const DRAWINGS: Partial<Record<VehicleTypeCode, VehicleDrawingDef>> = {
  tracked_excavator: complete(trackedExcavator),
  wheeled_excavator: complete(wheeledExcavator),
  wheel_loader: complete(wheelLoader),
  trailer: complete(trailer),
  pickup: complete(pickup),
};

export function drawingFor(type: string): VehicleDrawingDef {
  return DRAWINGS[type as VehicleTypeCode] ?? DRAWINGS.other ?? DRAWINGS.pickup!;
}
