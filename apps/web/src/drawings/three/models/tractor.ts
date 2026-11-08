import { box, cylinder, extrude, model, type V2, type V3 } from '../kit';

/**
 * Farm tractor, in metres (+x front, +y the near side, z up). Big rear tyres under curved
 * mudguards, small front tyres on a beam axle, a long hood with a sloped nose, a stack of front
 * weights, a cab over the rear axle with glass on every side, and the three-point hitch.
 */

const arc = (cx: number, cz: number, r: number, from: number, to: number, n = 8): V2[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = ((from + ((to - from) * i) / n) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cz + r * Math.sin(a)] as const;
  });

const ring = (cx: number, y: number, cz: number, r: number): V3[] =>
  Array.from({ length: 25 }, (_, i) => {
    const a = (i / 24) * Math.PI * 2;
    return [cx + r * Math.cos(a), y, cz + r * Math.sin(a)];
  });

/** A tyre with its rim and hub drawn on both faces. */
const tyre = (cx: number, r: number, [y0, y1]: V2) =>
  cylinder('wheels', 'y', [y0, y1], [cx, r], r, 32, [
    ...[y0, y1].flatMap((y) => [ring(cx, y, r, r * 0.68), ring(cx, y, r, r * 0.3)]),
  ]);

/** A mudguard bent round a tyre. */
const fender = (cx: number, cz: number, r: number, y: V2, from: number, to: number, t = 0.06) =>
  extrude('body', [...arc(cx, cz, r + t, from, to), ...arc(cx, cz, r, to, from)], y);

const outline = (pts: V3[]): V3[] => [...pts, pts[0]!];

const RX = -1.0;
const RR = 0.8;
const FX = 1.3;
const FR = 0.5;

/** x of the cab's front glass at height z (it leans back a little). */
const screen = (z: number) => -0.25 - (0.1 * (z - 1.7)) / 1.05;

export const tractor3d = () =>
  model(
    // Tyres and mudguards, both sides.
    tyre(RX, RR, [0, 0.5]),
    tyre(RX, RR, [1.7, 2.2]),
    tyre(FX, FR, [0.3, 0.62]),
    tyre(FX, FR, [1.58, 1.9]),
    fender(RX, RR, 0.9, [-0.05, 0.55], 18, 150),
    fender(RX, RR, 0.9, [1.65, 2.25], 18, 150),
    fender(FX, FR, 0.56, [0.27, 0.65], 25, 150),
    fender(FX, FR, 0.56, [1.55, 1.93], 25, 150),
    // Rear axle housings and the front beam axle.
    cylinder('body', 'y', [0.5, 1.7], [RX, RR], 0.16),
    box('body', [FX - 0.1, FX + 0.1], [0.62, 1.58], [0.42, 0.58]),
    // Engine and gearbox under the hood.
    box('body', [-1.45, 2.0], [0.75, 1.45], [0.5, 1.0]),
    // Hood with a sloped nose, grille, headlights and side vents.
    extrude(
      'body',
      [
        [-0.3, 1.0],
        [2.0, 1.0],
        [2.08, 1.12],
        [2.08, 1.45],
        [1.92, 1.63],
        [-0.3, 1.68],
      ],
      [0.72, 1.48],
      [
        outline([
          [2.08, 0.84, 1.16],
          [2.08, 1.36, 1.16],
          [2.08, 1.36, 1.42],
          [2.08, 0.84, 1.42],
        ]),
        ...[1.22, 1.29, 1.36].map((z): V3[] => [
          [2.08, 0.88, z],
          [2.08, 1.32, z],
        ]),
        ...[0.92, 1.16].flatMap((y0): V3[][] => [
          outline([
            [2.08, y0 - 0.12, 1.04],
            [2.08, y0 - 0.02, 1.04],
            [2.08, y0 - 0.02, 1.12],
            [2.08, y0 - 0.12, 1.12],
          ]),
        ]),
        outline([
          [2.08, 1.38, 1.04],
          [2.08, 1.44, 1.04],
          [2.08, 1.44, 1.12],
          [2.08, 1.38, 1.12],
        ]),
        ...[1.2, 1.32, 1.44].map((z): V3[] => [
          [0.9, 1.48, z],
          [1.7, 1.48, z],
        ]),
      ],
    ),
    // Weight carrier and a stack of front weights with a lifting bar.
    box('body', [2.0, 2.12], [0.7, 1.5], [0.5, 0.95]),
    ...[0, 1, 2, 3].map((i) =>
      box('body', [2.13 + i * 0.075, 2.2 + i * 0.075], [0.78, 1.42], [0.45, 1.0]),
    ),
    box('body', [2.12, 2.43], [1.05, 1.15], [1.0, 1.06]),
    // Exhaust and air intake stacks up the hood's corners.
    cylinder('body', 'z', [1.6, 2.7], [0.1, 1.36], 0.055),
    cylinder('body', 'z', [2.7, 2.78], [0.1, 1.36], 0.075),
    cylinder('body', 'z', [1.6, 2.2], [0.1, 0.84], 0.07),
    // Steps up to the cab door.
    box('body', [-0.2, 0.1], [1.58, 1.74], [0.55, 0.6]),
    box('body', [-0.2, 0.1], [1.58, 1.74], [0.95, 1.0]),
    // Cab: glass all round, split by pillars; door with its handle.
    extrude(
      'cab',
      [
        [-1.6, 1.0],
        [-0.25, 1.0],
        [-0.25, 1.7],
        [-0.35, 2.75],
        [-1.5, 2.75],
        [-1.6, 1.6],
      ],
      [0.55, 1.65],
      [
        outline([
          [-0.75, 1.65, 1.3],
          [-0.33, 1.65, 1.3],
          [-0.42, 1.65, 2.62],
          [-0.8, 1.65, 2.62],
        ]),
        outline([
          [-1.42, 1.65, 1.65],
          [-0.9, 1.65, 1.65],
          [-0.95, 1.65, 2.62],
          [-1.38, 1.65, 2.62],
        ]),
        [
          [-0.72, 1.65, 1.85],
          [-0.6, 1.65, 1.85],
        ],
        outline([
          [screen(1.25), 0.65, 1.25],
          [screen(1.25), 1.55, 1.25],
          [screen(2.65), 1.55, 2.65],
          [screen(2.65), 0.65, 2.65],
        ]),
      ],
    ),
    // Roof with a crown, beacon, work lights and mirrors on arms.
    box('cab', [-1.7, -0.15], [0.45, 1.75], [2.75, 2.82]),
    box('cab', [-1.6, -0.3], [0.55, 1.65], [2.82, 2.9]),
    cylinder('cab', 'z', [2.9, 3.04], [-1.3, 1.45], 0.06),
    ...[0.6, 1.45].map((y) =>
      box(
        'cab',
        [-0.18, -0.1],
        [y, y + 0.15],
        [2.66, 2.75],
        [
          outline([
            [-0.1, y + 0.02, 2.67],
            [-0.1, y + 0.13, 2.67],
            [-0.1, y + 0.13, 2.74],
            [-0.1, y + 0.02, 2.74],
          ]),
        ],
      ),
    ),
    box('cab', [-0.4, -0.3], [1.65, 1.9], [2.45, 2.5]),
    box('cab', [-0.38, -0.32], [1.86, 1.96], [2.1, 2.48]),
    // Three-point hitch and the PTO shaft at the back.
    box('body', [-1.9, -1.45], [0.85, 0.98], [0.45, 0.6]),
    box('body', [-1.9, -1.45], [1.22, 1.35], [0.45, 0.6]),
    box('body', [-1.95, -1.45], [1.05, 1.15], [1.05, 1.15]),
    cylinder('body', 'x', [-1.75, -1.45], [1.1, 0.72], 0.05),
  );
