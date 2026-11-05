import { EXCAVATOR_TOOLS, type ExcavatorTool, type VehicleTypeCode } from '@fleet-hub/shared';
import { sideView, topView } from './derive';
import type { VehicleDrawingDef, VehicleDrawingSource } from './model';
import { pickup } from './types/pickup';
import {
  trackedExcavator,
  trackedExcavatorWith,
  wheeledExcavator,
  wheeledExcavatorWith,
} from './types/excavators';
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

const WITH_TOOL: Partial<Record<VehicleTypeCode, (tool: ExcavatorTool) => VehicleDrawingSource>> = {
  tracked_excavator: trackedExcavatorWith,
  wheeled_excavator: wheeledExcavatorWith,
};
const toolDrawings = new Map<string, VehicleDrawingDef>();

/**
 * The drawing for a type. Excavators show the tool on their arm (Revisions 1); any other tool
 * than the bucket gets its own drawing, built once.
 */
export function drawingFor(type: string, tool?: string | null): VehicleDrawingDef {
  const build = WITH_TOOL[type as VehicleTypeCode];
  if (build && tool && tool !== 'bucket' && (EXCAVATOR_TOOLS as readonly string[]).includes(tool)) {
    const key = `${type}.${tool}`;
    let def = toolDrawings.get(key);
    if (!def) {
      def = complete(build(tool as ExcavatorTool));
      toolDrawings.set(key, def);
    }
    return def;
  }
  return DRAWINGS[type as VehicleTypeCode] ?? DRAWINGS.other!;
}
