import type { InfoKey } from './vitals';

/**
 * The callout lines on the side drawing, in order (Sagi, 2026-10-26: hours, VIN, last location,
 * last fuel). To change them, edit this list: any value from vitals.tsx can be a callout.
 * `usage` shows engine hours on machines and the odometer on road vehicles.
 */
export const CALLOUTS: InfoKey[] = ['usage', 'vin', 'lastLocation', 'lastFuel'];

/** Where on the vehicle each callout points. */
type Part = 'engine' | 'body' | 'ground' | 'tank';
const PART: Partial<Record<InfoKey, Part>> = {
  usage: 'engine',
  vin: 'body',
  lastLocation: 'ground',
  lastFuel: 'tank',
};

type Anchors = Record<Part, readonly [x: number, y: number]>;

// Anchor points as fractions of each type's side drawing (0,0 top left; the front faces right).
const DEFAULT: Anchors = {
  engine: [0.2, 0.45],
  body: [0.5, 0.6],
  ground: [0.5, 0.9],
  tank: [0.35, 0.62],
};
const BY_TYPE: Record<string, Partial<Anchors>> = {
  tracked_excavator: {
    engine: [0.06, 0.55],
    tank: [0.3, 0.6],
    body: [0.2, 0.8],
    ground: [0.32, 0.93],
  },
  wheeled_excavator: {
    engine: [0.06, 0.55],
    tank: [0.3, 0.6],
    body: [0.22, 0.75],
    ground: [0.13, 0.9],
  },
  wheel_loader: { engine: [0.08, 0.5], tank: [0.28, 0.68], body: [0.45, 0.6], ground: [0.2, 0.85] },
  pickup: { engine: [0.86, 0.55], tank: [0.3, 0.6], body: [0.58, 0.62], ground: [0.74, 0.88] },
  truck: { engine: [0.88, 0.7], tank: [0.6, 0.76], body: [0.4, 0.45], ground: [0.14, 0.88] },
  van: { engine: [0.9, 0.7], tank: [0.3, 0.7], body: [0.5, 0.45], ground: [0.78, 0.88] },
  trailer: { engine: [0.38, 0.88], tank: [0.62, 0.4], body: [0.27, 0.55], ground: [0.55, 0.9] },
};

export function anchorFor(type: string, key: InfoKey): readonly [number, number] {
  const part = PART[key] ?? 'body';
  return BY_TYPE[type]?.[part] ?? DEFAULT[part];
}
