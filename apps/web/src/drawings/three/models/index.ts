import type * as THREE from 'three';
import { EXCAVATOR_TOOLS, type ExcavatorTool } from '@fleet-hub/shared';
import type { ViewName } from '../render';
import { crawler3d, wheeled3d } from './excavator';
import { forklift3d } from './forklift';
import { pickup3d } from './pickup';
import { compressor3d, other3d, skidSteer3d, trailer3d, van3d } from './small';
import { tractor3d } from './tractor';
import { truck3d } from './truck';
import { wheelLoader3d } from './wheel-loader';

export interface ModelSpec {
  /** The model for a view (excavators park their arm folded for the top view). */
  build: (view: ViewName) => THREE.Group;
  /** Drawing units per model unit (44 per metre). */
  unit: number;
}

/** Excavators: digging pose for side and isometric, arm folded in for the top view. */
const digger = (
  build: (folded: boolean, tool: ExcavatorTool) => THREE.Group,
  tool: ExcavatorTool,
): ModelSpec => ({
  build: (view) => build(view === 'top', tool),
  unit: 44,
});

/** Every type (and excavator tool, as `type.tool`) drawn from a 3D model. */
export const MODELS: Record<string, ModelSpec> = {
  wheel_loader: { build: () => wheelLoader3d(), unit: 44 },
  pickup: { build: () => pickup3d(), unit: 44 },
  truck: { build: () => truck3d(), unit: 44 },
  van: { build: () => van3d(), unit: 44 },
  trailer: { build: () => trailer3d(), unit: 44 },
  tractor: { build: () => tractor3d(), unit: 44 },
  forklift: { build: () => forklift3d(), unit: 44 },
  skid_steer: { build: () => skidSteer3d(), unit: 44 },
  compressor: { build: () => compressor3d(), unit: 44 },
  other: { build: () => other3d(), unit: 44 },
  ...Object.fromEntries(
    EXCAVATOR_TOOLS.flatMap((tool) => {
      const suffix = tool === 'bucket' ? '' : `.${tool}`;
      return [
        [`tracked_excavator${suffix}`, digger(crawler3d, tool)],
        [`wheeled_excavator${suffix}`, digger(wheeled3d, tool)],
      ];
    }),
  ),
};
