import type { ReactNode } from 'react';
import type { Solid } from './iso';

/** Named part groups, so each part can tint and animate on its own (SPEC A4). */
export type PartName = 'wheels' | 'tracks' | 'body' | 'cab' | 'boom' | 'bucket' | 'bed' | 'mast';

export interface ViewDrawing {
  /** viewBox width and height, in drawing units. */
  width: number;
  height: number;
  /** Parts in paint order (first is lowest). */
  parts: Partial<Record<PartName, ReactNode>>;
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
