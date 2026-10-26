import type { VehicleTypeCode } from '@fleet-hub/shared';
import { sideView, topView } from './derive';
import type { VehicleDrawingDef, VehicleDrawingSource } from './model';
import { pickup } from './types/pickup';
import { trackedExcavator, wheeledExcavator } from './types/excavators';
import { wheelLoader } from './types/wheel-loader';
import { trailer } from './types/trailer';
import { forklift, other, skidSteer, tractor } from './types/small-machines';
import { truck, van } from './types/road';

const complete = (src: VehicleDrawingSource): VehicleDrawingDef => ({
  iso: src.iso,
  top: src.top ?? topView(src.iso),
  side: src.side ?? sideView(src.iso),
});

/** One drawing per vehicle type. Types without one (the backhoe loader) use the generic drawing. */
export const DRAWINGS: Partial<Record<VehicleTypeCode, VehicleDrawingDef>> = {
  tracked_excavator: complete(trackedExcavator),
  wheeled_excavator: complete(wheeledExcavator),
  wheel_loader: complete(wheelLoader),
  skid_steer: complete(skidSteer),
  tractor: complete(tractor),
  forklift: complete(forklift),
  truck: complete(truck),
  pickup: complete(pickup),
  van: complete(van),
  trailer: complete(trailer),
  other: complete(other),
};

export function drawingFor(type: string): VehicleDrawingDef {
  return DRAWINGS[type as VehicleTypeCode] ?? DRAWINGS.other ?? DRAWINGS.pickup!;
}
