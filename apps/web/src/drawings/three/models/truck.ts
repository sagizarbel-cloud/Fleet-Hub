import { box, cylinder, extrude, model, wheel, type V2, type V3 } from '../kit';

/**
 * Three-axle tipper truck, in metres (+x front, +y the near side, z up). Cab over the front
 * axle with the wheel arch cut into it, a steel tipping body with ribbed sides and a headboard,
 * twin tyres on the rear axles, a round fuel tank, air tanks and an exhaust stack.
 */

const R = 0.52;
const FRONT = 2.6;
const REAR = [-1.6, -2.95];

/** The cab side: wheel arch over the front tyre, raked windscreen, rounded roof edge. */
const cabProfile: V2[] = [
  [2.07, 0.85],
  ...Array.from({ length: 9 }, (_, i) => {
    const a = ((148 - (i / 8) * 116) * Math.PI) / 180;
    return [FRONT + 0.62 * Math.cos(a), R + 0.62 * Math.sin(a)] as const;
  }),
  [3.6, 0.85],
  [3.6, 1.8],
  [3.46, 3.0],
  [3.32, 3.12],
  [2.15, 3.12],
  [2.07, 3.04],
];

/** x of the raked windscreen at height z. */
const screen = (z: number) => 3.6 - (0.14 * (z - 1.8)) / 1.2;

const outline = (pts: V3[]): V3[] => [...pts, pts[0]!];

export const truck3d = () =>
  model(
    // Front tyres, then twin tyres on both rear axles.
    wheel('wheels', FRONT, R, R, [0.05, 0.42]),
    wheel('wheels', FRONT, R, R, [2.08, 2.45]),
    ...REAR.flatMap((x) =>
      [
        [0, 0.3],
        [0.32, 0.62],
        [1.88, 2.18],
        [2.2, 2.5],
      ].map(([y0, y1]) => wheel('wheels', x, R, R, [y0!, y1!])),
    ),
    // Chassis rails, the subframe under the body and the rear crossmember with tail lights.
    box('body', [-3.7, 3.5], [0.6, 0.82], [0.62, 0.95]),
    box('body', [-3.7, 3.5], [1.68, 1.9], [0.62, 0.95]),
    box('body', [-3.8, 1.95], [0.55, 1.95], [0.95, 1.12]),
    box(
      'body',
      [-3.85, -3.7],
      [0, 2.5],
      [0.66, 0.9],
      [
        outline([
          [-3.85, 0.15, 0.71],
          [-3.85, 0.55, 0.71],
          [-3.85, 0.55, 0.85],
          [-3.85, 0.15, 0.85],
        ]),
        outline([
          [-3.85, 1.95, 0.71],
          [-3.85, 2.35, 0.71],
          [-3.85, 2.35, 0.85],
          [-3.85, 1.95, 0.85],
        ]),
      ],
    ),
    // Mud flaps behind the last axle.
    box('body', [-3.6, -3.55], [0.02, 0.6], [0.3, 1.12]),
    box('body', [-3.6, -3.55], [1.9, 2.48], [0.3, 1.12]),
    // Tipping body: floor, ribbed side walls with a rolled top rim, tailgate and headboard.
    box('bed', [-3.8, 1.95], [0.05, 2.45], [1.12, 1.25]),
    box('bed', [-3.8, 1.8], [0.05, 0.13], [1.25, 2.4]),
    box('bed', [-3.8, 1.8], [2.37, 2.45], [1.25, 2.4]),
    box('bed', [-3.8, 1.95], [-0.02, 0.14], [2.38, 2.47]),
    box('bed', [-3.8, 1.95], [2.36, 2.52], [2.38, 2.47]),
    box(
      'bed',
      [-3.9, -3.8],
      [0, 2.5],
      [1.12, 2.45],
      [
        ...[0.6, 1.25, 1.9].map((y): V3[] => [
          [-3.9, y, 1.2],
          [-3.9, y, 2.38],
        ]),
      ],
    ),
    box('bed', [1.8, 1.95], [0.05, 2.45], [1.25, 3.0]),
    ...[-2.6, -1.1, 0.4].flatMap((x) => [
      box('bed', [x, x + 0.08], [2.45, 2.52], [1.25, 2.38]),
      box('bed', [x, x + 0.08], [-0.02, 0.05], [1.25, 2.38]),
    ]),
    // Round fuel tank with two straps, and the air tanks behind it.
    cylinder('body', 'x', [0.3, 1.4], [2.22, 0.72], 0.22, 28, [
      ...[0.55, 1.15].map((x) =>
        Array.from({ length: 25 }, (_, i): V3 => {
          const a = (i / 24) * Math.PI * 2;
          return [x, 2.22 + 0.22 * Math.cos(a), 0.72 + 0.22 * Math.sin(a)];
        }),
      ),
    ]),
    cylinder('body', 'x', [-0.85, -0.2], [2.25, 0.72], 0.15),
    // Exhaust stack in the gap between the headboard and the cab.
    cylinder('body', 'z', [1.0, 3.35], [2.01, 2.3], 0.05),
    // Cab: door, side window, windscreen, grille.
    extrude(
      'cab',
      cabProfile,
      [0.05, 2.45],
      [
        outline([
          [2.3, 2.45, 1.2],
          [3.3, 2.45, 1.2],
          [3.3, 2.45, 2.95],
          [2.3, 2.45, 2.98],
        ]),
        outline([
          [2.45, 2.45, 2.05],
          [3.15, 2.45, 2.05],
          [3.15, 2.45, 2.82],
          [2.45, 2.45, 2.85],
        ]),
        [
          [2.45, 2.45, 1.8],
          [2.65, 2.45, 1.8],
        ],
        outline([
          [screen(1.95), 0.25, 1.95],
          [screen(1.95), 2.25, 1.95],
          [screen(2.85), 2.25, 2.85],
          [screen(2.85), 0.25, 2.85],
        ]),
        ...[1.15, 1.3, 1.45, 1.6].map((z): V3[] => [
          [3.6, 0.55, z],
          [3.6, 1.95, z],
        ]),
      ],
    ),
    // Sun visor over the windscreen.
    box('cab', [3.3, 3.62], [0.1, 2.4], [3.02, 3.08]),
    // Mirror on its arm, and the step in front of the wheel.
    box('cab', [3.3, 3.55], [2.45, 2.62], [2.4, 2.46]),
    box('cab', [3.5, 3.6], [2.55, 2.68], [1.85, 2.5]),
    box('body', [3.18, 3.52], [2.3, 2.5], [0.58, 0.64]),
    // Front bumper with the headlights.
    box(
      'body',
      [3.6, 3.78],
      [0, 2.5],
      [0.48, 0.85],
      [
        outline([
          [3.78, 0.15, 0.6],
          [3.78, 0.55, 0.6],
          [3.78, 0.55, 0.76],
          [3.78, 0.15, 0.76],
        ]),
        outline([
          [3.78, 1.95, 0.6],
          [3.78, 2.35, 0.6],
          [3.78, 2.35, 0.76],
          [3.78, 1.95, 0.76],
        ]),
      ],
    ),
  );
