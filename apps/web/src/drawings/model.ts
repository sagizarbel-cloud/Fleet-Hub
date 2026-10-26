import type { ReactNode } from 'react';

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
  /** Top-down view, front facing up. Used in the grid and, tilted, as the isometric view. */
  top: ViewDrawing;
  /** Side profile, front facing right. Used on the detail page. */
  side: ViewDrawing;
  /** Isometric lift per part, as a fraction of the rendered size. */
  lift: Partial<Record<PartName, number>>;
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
