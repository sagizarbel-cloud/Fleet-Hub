import type * as THREE from 'three';
import { EXCAVATOR_TOOLS, type ExcavatorTool } from '@fleet-hub/shared';
import type { VehicleDrawingSource } from '../../model';
import type { ViewName } from '../render';
import type { Solid } from '../../iso';
import { crawler, wheeled } from '../../types/excavators';
import { trailer } from '../../types/trailer';
import { compressor, other, skidSteer } from '../../types/small-machines';
import { van } from '../../types/road';
import { fromSolids } from './from-solids';
import { forklift3d } from './forklift';
import { pickup3d } from './pickup';
import { tractor3d } from './tractor';
import { truck3d } from './truck';
import { wheelLoader3d } from './wheel-loader';

export interface ModelSpec {
  /** The model for a view (excavators park their arm folded for the top view). */
  build: (view: ViewName) => THREE.Group;
  /** Drawing units per model unit: 44 for models in metres, 1 for converted drawings. */
  unit: number;
}

const converted = (src: VehicleDrawingSource): ModelSpec => ({
  build: () => fromSolids(src.iso),
  unit: 1,
});

/** Excavators: digging pose for side and isometric, arm folded in for the top view. */
const digger = (
  solids: (folded: boolean, tool: ExcavatorTool) => Solid[],
  tool: ExcavatorTool,
): ModelSpec => ({
  build: (view) => fromSolids(solids(view === 'top', tool)),
  unit: 1,
});

/** Every type (and excavator tool, as `type.tool`) drawn from a 3D model. */
export const MODELS: Record<string, ModelSpec> = {
  wheel_loader: { build: () => wheelLoader3d(), unit: 44 },
  pickup: { build: () => pickup3d(), unit: 1 },
  truck: { build: () => truck3d(), unit: 44 },
  van: converted(van),
  trailer: converted(trailer),
  tractor: { build: () => tractor3d(), unit: 44 },
  forklift: { build: () => forklift3d(), unit: 44 },
  skid_steer: converted(skidSteer),
  compressor: converted(compressor),
  other: converted(other),
  ...Object.fromEntries(
    EXCAVATOR_TOOLS.flatMap((tool) => {
      const suffix = tool === 'bucket' ? '' : `.${tool}`;
      return [
        [`tracked_excavator${suffix}`, digger(crawler, tool)],
        [`wheeled_excavator${suffix}`, digger(wheeled, tool)],
      ];
    }),
  ),
};
