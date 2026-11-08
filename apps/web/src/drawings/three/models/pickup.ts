import { box, extrude, model, wheel, type V2, type V3 } from '../kit';

/**
 * Double-cab pickup (one-tonne class, about 5.3 m long, 1.8 m high, 3.1 m wheelbase), in metres
 * (+x front, +y the near side, z up). Open bed with walls and a tailgate, wheel arches with
 * flares, a cab with a raked windscreen, four doors, side steps, mirrors, lights and bumpers.
 */

const arc = (cx: number, cz: number, r: number, from: number, to: number, n = 10): V2[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = ((from + ((to - from) * i) / n) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cz + r * Math.sin(a)] as const;
  });

const R = 0.38;
const REAR = -1.35;
const FRONT = 1.74;
const SILL = 0.48;
const NEAR = 1.81;
const FAR = 0.05;

/** A wheel arch over a tyre, meeting the sill. */
const arch = (cx: number, r: number): V2[] => {
  const a0 = (Math.asin((SILL - R) / r) * 180) / Math.PI;
  return arc(cx, R, r, 180 - a0, a0);
};

const outline = (pts: V3[]): V3[] => [...pts, pts[0]!];
const onX = (x: number, [y0, y1]: V2, [z0, z1]: V2): V3[] =>
  outline([
    [x, y0, z0],
    [x, y1, z0],
    [x, y1, z1],
    [x, y0, z1],
  ]);

/** x of the windscreen at height z. */
const screen = (z: number) => 0.95 - (0.7 * (z - 1.15)) / 0.63;

export const pickup3d = () =>
  model(
    ...[REAR, FRONT].flatMap((x) => [
      wheel('wheels', x, R, R, [FAR, FAR + 0.26]),
      wheel('wheels', x, R, R, [NEAR - 0.26, NEAR]),
    ]),
    // Lower body: wheel arches, the bed floor at the back, the hood sloping up to the windscreen.
    extrude(
      'body',
      [
        [-2.6, SILL],
        ...arch(REAR, 0.45),
        ...arch(FRONT, 0.45),
        [2.62, SILL],
        [2.67, 0.62],
        [2.67, 0.9],
        [2.55, 1.0],
        [0.95, 1.15],
        [-0.95, 1.2],
        [-0.95, 0.78],
        [-2.6, 0.78],
      ],
      [FAR, NEAR],
      [
        // Door edges and handles.
        ...[0.9, -0.05, -0.92].map((x): V3[] => [
          [x, NEAR, SILL + 0.06],
          [x, NEAR, 1.16],
        ]),
        ...[0.62, -0.32].map((x): V3[] => [
          [x, NEAR, 1.02],
          [x + 0.14, NEAR, 1.02],
        ]),
        // Fuel flap on the bed side.
        outline([
          [-1.9, NEAR, 0.9],
          [-1.75, NEAR, 0.9],
          [-1.75, NEAR, 1.02],
          [-1.9, NEAR, 1.02],
        ]),
        // Grille and headlights on the nose.
        onX(2.67, [0.5, 1.36], [0.64, 0.88]),
        ...[0.72, 0.8].map((z): V3[] => [
          [2.67, 0.55, z],
          [2.67, 1.31, z],
        ]),
        onX(2.67, [0.12, 0.42], [0.74, 0.88]),
        onX(2.67, [1.44, 1.74], [0.74, 0.88]),
      ],
    ),
    // Wheel arch flares on the near side.
    ...[REAR, FRONT].map((x) =>
      extrude(
        'body',
        [...arc(x, R, 0.5, 170, 10), ...arc(x, R, 0.45, 10, 170)],
        [NEAR, NEAR + 0.04],
      ),
    ),
    // The bed: side walls, the front wall and the tailgate with its lights on the corners.
    box('bed', [-2.6, -0.95], [FAR, FAR + 0.07], [0.78, 1.22]),
    box(
      'bed',
      [-2.6, -0.95],
      [NEAR - 0.07, NEAR],
      [0.78, 1.22],
      [
        [
          [-2.55, NEAR, 1.1],
          [-1.0, NEAR, 1.1],
        ],
      ],
    ),
    box('bed', [-1.02, -0.95], [FAR + 0.07, NEAR - 0.07], [0.78, 1.22]),
    box(
      'bed',
      [-2.67, -2.6],
      [FAR, NEAR],
      [0.6, 1.22],
      [
        onX(-2.67, [FAR + 0.03, FAR + 0.13], [0.85, 1.15]),
        onX(-2.67, [NEAR - 0.13, NEAR - 0.03], [0.85, 1.15]),
        [
          [-2.67, 0.75, 1.08],
          [-2.67, 1.11, 1.08],
        ],
      ],
    ),
    // Cab: raked windscreen, roof, front and rear door windows, rear window.
    extrude(
      'cab',
      [
        [-0.95, 1.15],
        [0.95, 1.15],
        [0.25, 1.78],
        [0.12, 1.82],
        [-0.8, 1.82],
        [-0.93, 1.74],
      ],
      [FAR + 0.06, NEAR - 0.06],
      [
        outline([
          [-0.0, NEAR - 0.06, 1.22],
          [0.8, NEAR - 0.06, 1.22],
          [0.27, NEAR - 0.06, 1.7],
          [-0.0, NEAR - 0.06, 1.72],
        ]),
        outline([
          [-0.85, NEAR - 0.06, 1.22],
          [-0.1, NEAR - 0.06, 1.22],
          [-0.1, NEAR - 0.06, 1.72],
          [-0.78, NEAR - 0.06, 1.72],
        ]),
        outline([
          [screen(1.22), 0.2, 1.22],
          [screen(1.22), 1.66, 1.22],
          [screen(1.74), 1.66, 1.74],
          [screen(1.74), 0.2, 1.74],
        ]),
        onX(-0.95, [0.35, 1.51], [1.3, 1.66]),
      ],
    ),
    // Mirrors, side steps and bumpers.
    box('cab', [0.72, 0.84], [NEAR - 0.06, NEAR + 0.14], [1.2, 1.34]),
    box('cab', [0.72, 0.84], [FAR - 0.14, FAR + 0.06], [1.2, 1.34]),
    box('body', [-0.9, 0.9], [NEAR - 0.05, NEAR + 0.07], [0.42, 0.47]),
    box('body', [2.62, 2.76], [FAR + 0.05, NEAR - 0.05], [0.4, 0.64]),
    box('body', [-2.75, -2.62], [FAR + 0.05, NEAR - 0.05], [0.45, 0.6]),
  );
