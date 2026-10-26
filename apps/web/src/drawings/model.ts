import type { ReactNode } from 'react';
import type { VehicleTypeCode } from '@fleet-hub/shared';
import type { Solid } from './iso';

/** Named part groups, so each part can tint and animate on its own (SPEC A4). */
export type PartName = 'wheels' | 'tracks' | 'body' | 'cab' | 'boom' | 'bucket' | 'bed' | 'mast';

export interface ViewDrawing {
  /** viewBox width and height, in drawing units. */
  width: number;
  height: number;
  /** Layers in paint order (first is lowest); each belongs to a named part. */
  layers: readonly { part: PartName; node: ReactNode }[];
}

/** How a type is defined: 3D solids, with optional hand-drawn top and side views. */
export interface VehicleDrawingSource {
  /** The type this drawing shows. The registry files each drawing under this name only. */
  represents: VehicleTypeCode;
  iso: readonly Solid[];
  top?: ViewDrawing;
  side?: ViewDrawing;
}

export interface VehicleDrawingDef {
  /** Top-down view, front facing up. Used in the grid; the selection transition tilts it into the isometric view. */
  top: ViewDrawing;
  /** Side profile, front facing right. Used on the detail page. */
  side: ViewDrawing;
  /** The same vehicle as 3D solids, projected for the isometric view. */
  iso: readonly Solid[];
}

export const PAINT_ORDER: PartName[] = [
  'tracks',
  'wheels',
  'body',
  'bed',
  'mast',
  'boom',
  'bucket',
  'cab',
];

/** Hand-drawn views list one group per part; this puts them in the standard paint order. */
export function byPart(parts: Partial<Record<PartName, ReactNode>>): ViewDrawing['layers'] {
  return PAINT_ORDER.filter((p) => parts[p]).map((part) => ({ part, node: parts[part] }));
}
