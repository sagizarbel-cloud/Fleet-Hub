import { box, cylinder, extrude, model, type V2, type V3 } from '../kit';

/**
 * Double-cab pickup, in metres (+x front, +y the near side, z up), proportioned after side photos
 * (Sagi, 2026-11-08): a short, tall nose, high beltline and bed rails, big tyres under flared
 * arches. Open bed with walls and a tailgate, four doors, side steps, mirrors, lights and bumpers.
 */

const arc = (cx: number, cz: number, r: number, from: number, to: number, n = 10): V2[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = ((from + ((to - from) * i) / n) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cz + r * Math.sin(a)] as const;
  });

const ring = (cx: number, y: number, cz: number, r: number): V3[] =>
  Array.from({ length: 25 }, (_, i) => {
    const a = (i / 24) * Math.PI * 2;
    return [cx + r * Math.cos(a), y, cz + r * Math.sin(a)];
  });

const R = 0.43;
const REAR = -1.4;
const FRONT = 1.85;
const SILL = 0.62;
const ARCH = 0.58;
const FAR = 0.05;
const NEAR = 2.3;
const BELT = 1.72;
const FLOOR = 1.3;
const RAIL = 1.86;

/** A wheel arch over a tyre, meeting the sill. */
const arch = (cx: number): V2[] => {
  const a0 = (Math.asin((SILL - R) / ARCH) * 180) / Math.PI;
  return arc(cx, R, ARCH, 180 - a0, a0);
};

/** A tyre with the rim and hub drawn on both faces. */
const tyre = (cx: number, [y0, y1]: V2) =>
  cylinder('wheels', 'y', [y0, y1], [cx, R], R, 32, [
    ...[y0, y1].flatMap((y) => [ring(cx, y, R, R * 0.66), ring(cx, y, R, R * 0.22)]),
  ]);

const outline = (pts: V3[]): V3[] => [...pts, pts[0]!];
const onX = (x: number, [y0, y1]: V2, [z0, z1]: V2): V3[] =>
  outline([
    [x, y0, z0],
    [x, y1, z0],
    [x, y1, z1],
    [x, y0, z1],
  ]);

/** x of the windscreen at height z. */
const screen = (z: number) => 1.42 - (0.53 * (z - BELT)) / 0.61;

const CAB_Y = NEAR - 0.05;

export const pickup3d = () =>
  model(
    ...[REAR, FRONT].flatMap((x) => [tyre(x, [FAR, FAR + 0.3]), tyre(x, [NEAR - 0.3, NEAR])]),
    // Lower body: arches, the bed floor behind the cab, a short hood over a tall, flat nose.
    extrude(
      'body',
      [
        [-2.62, SILL],
        ...arch(REAR),
        ...arch(FRONT),
        [2.62, SILL],
        [2.67, 0.75],
        [2.67, 1.45],
        [2.6, 1.55],
        [1.42, BELT],
        [-0.72, BELT],
        [-0.72, FLOOR],
        [-2.62, FLOOR],
      ],
      [FAR, NEAR],
      [
        // Door edges and handles.
        ...[1.35, 0.16, -0.68].map((x): V3[] => [
          [x, NEAR, SILL + 0.04],
          [x, NEAR, BELT],
        ]),
        ...[1.0, -0.2].map((x): V3[] => [
          [x, NEAR, 1.6],
          [x + 0.16, NEAR, 1.6],
        ]),
        // The crease along the side, and the fuel flap.
        [
          [-2.55, NEAR, 1.45],
          [2.5, NEAR, 1.45],
        ],
        outline([
          [-2.05, NEAR, 1.5],
          [-1.88, NEAR, 1.5],
          [-1.88, NEAR, 1.64],
          [-2.05, NEAR, 1.64],
        ]),
        // Grille with its bars, swept headlights and fog lights.
        onX(2.67, [0.6, 1.75], [0.82, 1.38]),
        ...[0.96, 1.1, 1.24].map((z): V3[] => [
          [2.67, 0.65, z],
          [2.67, 1.7, z],
        ]),
        outline([
          [2.67, 0.12, 1.24],
          [2.67, 0.52, 1.3],
          [2.67, 0.52, 1.42],
          [2.67, 0.12, 1.42],
        ]),
        outline([
          [2.67, 1.83, 1.3],
          [2.67, 2.23, 1.24],
          [2.67, 2.23, 1.42],
          [2.67, 1.83, 1.42],
        ]),
      ],
    ),
    // Flares round both arches on the near side.
    ...[REAR, FRONT].map((x) =>
      extrude(
        'body',
        [...arc(x, R, ARCH + 0.08, 168, 12), ...arc(x, R, ARCH, 12, 168)],
        [NEAR, NEAR + 0.05],
      ),
    ),
    // The bed: side walls flush with the body, the front wall, and the tailgate with lights.
    box('bed', [-2.62, -0.72], [FAR, FAR + 0.07], [FLOOR, RAIL]),
    box(
      'bed',
      [-2.62, -0.72],
      [NEAR - 0.07, NEAR],
      [FLOOR, RAIL],
      [
        [
          [-2.55, NEAR, RAIL - 0.12],
          [-0.8, NEAR, RAIL - 0.12],
        ],
      ],
    ),
    box('bed', [-0.79, -0.72], [FAR + 0.07, NEAR - 0.07], [FLOOR, RAIL]),
    box(
      'bed',
      [-2.7, -2.62],
      [FAR, NEAR],
      [0.75, RAIL],
      [
        onX(-2.7, [FAR + 0.03, FAR + 0.15], [1.35, 1.8]),
        onX(-2.7, [NEAR - 0.15, NEAR - 0.03], [1.35, 1.8]),
        [
          [-2.7, 1.0, 1.62],
          [-2.7, 1.35, 1.62],
        ],
      ],
    ),
    // Cab: steep windscreen, roof, front and rear door windows split by the pillar, rear window.
    extrude(
      'cab',
      [
        [-0.72, BELT],
        [1.42, BELT],
        [0.89, 2.33],
        [0.75, 2.37],
        [-0.55, 2.37],
        [-0.66, 2.3],
      ],
      [FAR + 0.05, CAB_Y],
      [
        outline([
          [0.22, CAB_Y, 1.78],
          [1.3, CAB_Y, 1.78],
          [0.86, CAB_Y, 2.28],
          [0.22, CAB_Y, 2.28],
        ]),
        outline([
          [-0.6, CAB_Y, 1.78],
          [0.1, CAB_Y, 1.78],
          [0.1, CAB_Y, 2.28],
          [-0.52, CAB_Y, 2.28],
        ]),
        outline([
          [screen(1.8), 0.25, 1.8],
          [screen(1.8), 2.1, 1.8],
          [screen(2.3), 2.1, 2.3],
          [screen(2.3), 0.25, 2.3],
        ]),
        onX(-0.72, [0.45, 1.9], [1.82, 2.22]),
      ],
    ),
    // Mirrors on both doors.
    box('cab', [1.12, 1.3], [CAB_Y, NEAR + 0.18], [1.76, 1.96]),
    box('cab', [1.12, 1.3], [FAR - 0.13, FAR + 0.05], [1.76, 1.96]),
    // Side step between the arches, and both bumpers.
    box('body', [-0.75, 1.25], [NEAR - 0.02, NEAR + 0.12], [0.5, 0.56]),
    box(
      'body',
      [2.62, 2.78],
      [FAR + 0.08, NEAR - 0.08],
      [0.35, 0.75],
      [onX(2.78, [0.25, 0.45], [0.55, 0.65]), onX(2.78, [1.9, 2.1], [0.55, 0.65])],
    ),
    box('body', [-2.8, -2.62], [FAR + 0.08, NEAR - 0.08], [0.55, 0.75]),
  );
