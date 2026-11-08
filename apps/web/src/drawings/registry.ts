import { EXCAVATOR_TOOLS, type ExcavatorTool, type VehicleTypeCode } from '@fleet-hub/shared';
import { sideView, topView } from './derive';
import type { VehicleDrawingDef, VehicleDrawingSource } from './model';
import { GENERATED } from './generated';
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

/** Which drawings the app shows: the hand-made 2D ones or the ones rendered from 3D models. */
export type DrawingEngine = '2d' | '3d';
export const DEFAULT_ENGINE: DrawingEngine = '3d';

const complete = (src: VehicleDrawingSource): VehicleDrawingDef => ({
  iso: src.iso,
  top: src.top ?? topView(src.iso),
  side: src.side ?? sideView(src.iso),
});

/** The same drawing with the views rendered from its 3D model, when there is one. */
const modelled = (def: VehicleDrawingDef, key: string): VehicleDrawingDef => {
  const views = GENERATED[key];
  return views ? { ...def, top: views.top, side: views.side, isoDrawing: views.iso } : def;
};

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
const HAND_DRAWN: Partial<Record<VehicleTypeCode, VehicleDrawingDef>> = Object.fromEntries(
  SOURCES.map((src) => [src.represents, complete(src)]),
);
const RENDERED: Partial<Record<VehicleTypeCode, VehicleDrawingDef>> = Object.fromEntries(
  Object.entries(HAND_DRAWN).map(([type, def]) => [type, modelled(def, type)]),
);
export const DRAWINGS = DEFAULT_ENGINE === '3d' ? RENDERED : HAND_DRAWN;

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
export function drawingFor(
  type: string,
  tool?: string | null,
  engine: DrawingEngine = DEFAULT_ENGINE,
): VehicleDrawingDef {
  const build = WITH_TOOL[type as VehicleTypeCode];
  if (build && tool && tool !== 'bucket' && (EXCAVATOR_TOOLS as readonly string[]).includes(tool)) {
    const key = `${type}.${tool}`;
    const cacheKey = `${key}:${engine}`;
    let def = toolDrawings.get(cacheKey);
    if (!def) {
      def = complete(build(tool as ExcavatorTool));
      if (engine === '3d') def = modelled(def, key);
      toolDrawings.set(cacheKey, def);
    }
    return def;
  }
  const table = engine === '3d' ? RENDERED : HAND_DRAWN;
  return table[type as VehicleTypeCode] ?? table.other!;
}
