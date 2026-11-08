import { box, cylinder, extrude, model, type V2, type V3 } from '../kit';

/**
 * Double-cab pickup at one-tonne size, in metres (+x front, +y the near side, z up), measured off
 * dimensioned side, front and plan views (Sagi, 2026-11-08): 5.34 m long, 1.82 m high, 3.09 m
 * wheelbase. Open bed with walls, wheel-well humps and a ribbed floor, flared arches, four
 * doors, a sloping hood with creases, side steps, mirrors, lights and bumpers.
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

const R = 0.37;
const REAR = -1.48;
const FRONT = 1.61;
const SILL = 0.45;
const ARCH = 0.5;
const FAR = 0.05;
const NEAR = 1.81;
const BELT = 1.3;
const FLOOR = 0.92;
const RAIL = 1.34;
const CAB_BACK = -0.89;
const HOOD: V2 = [0.97, 1.32];
const NOSE: V2 = [2.6, 1.05];

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
const screen = (z: number) => 0.97 - (0.92 * (z - BELT)) / 0.44;
/** Height of the hood's top at x. */
const hood = (x: number) => HOOD[1] + ((NOSE[1] - HOOD[1]) * (x - HOOD[0])) / (NOSE[0] - HOOD[0]);

const CAB_Y = NEAR - 0.06;

export const pickup3d = () =>
  model(
    ...[REAR, FRONT].flatMap((x) => [tyre(x, [FAR, FAR + 0.26]), tyre(x, [NEAR - 0.26, NEAR])]),
    // Lower body: arches, the bed floor behind the cab, the hood sloping down to the nose.
    extrude(
      'body',
      [
        [-2.62, SILL + 0.1],
        [-2.5, SILL],
        ...arch(REAR),
        ...arch(FRONT),
        [2.5, SILL],
        [2.67, 0.62],
        [2.67, 0.98],
        NOSE,
        HOOD,
        [CAB_BACK, BELT],
        [CAB_BACK, FLOOR],
        [-2.62, FLOOR],
      ],
      [FAR, NEAR],
      [
        // Door edges and handles.
        ...[1.15, 0.02, CAB_BACK + 0.04].map((x): V3[] => [
          [x, NEAR, SILL + 0.03],
          [x, NEAR, BELT],
        ]),
        ...[0.55, -0.42].map((x): V3[] => [
          [x, NEAR, 1.2],
          [x + 0.15, NEAR, 1.2],
        ]),
        // The crease along the side, from the tail lamp to the headlight.
        [
          [-2.55, NEAR, 1.08],
          [2.45, NEAR, 1.0],
        ],
        // Creases along the hood, and the bed's ribbed floor, seen from above.
        ...[0.5, 1.36].map((y): V3[] => [
          [1.1, y, hood(1.1)],
          [2.45, y, hood(2.45)],
        ]),
        ...Array.from({ length: 8 }, (_, i): V3[] => {
          const y = 0.3 + i * 0.17;
          return [
            [-2.5, y, FLOOR],
            [CAB_BACK - 0.12, y, FLOOR],
          ];
        }),
        // Grille, swept headlights.
        onX(2.67, [0.55, 1.31], [0.64, 0.95]),
        ...[0.74, 0.85].map((z): V3[] => [
          [2.67, 0.6, z],
          [2.67, 1.26, z],
        ]),
        outline([
          [2.67, 0.1, 0.86],
          [2.67, 0.46, 0.9],
          [2.67, 0.46, 0.97],
          [2.67, 0.1, 0.97],
        ]),
        outline([
          [2.67, 1.4, 0.9],
          [2.67, 1.76, 0.86],
          [2.67, 1.76, 0.97],
          [2.67, 1.4, 0.97],
        ]),
      ],
    ),
    // Flares round both arches on the near side.
    ...[REAR, FRONT].map((x) =>
      extrude(
        'body',
        [...arc(x, R, ARCH + 0.07, 170, 10), ...arc(x, R, ARCH, 10, 170)],
        [NEAR, NEAR + 0.04],
      ),
    ),
    // The bed: side walls flush with the body, wheel-well humps, front wall and tailgate.
    box('bed', [-2.62, CAB_BACK], [FAR, FAR + 0.07], [FLOOR, RAIL]),
    box(
      'bed',
      [-2.62, CAB_BACK],
      [NEAR - 0.07, NEAR],
      [FLOOR, RAIL],
      [
        [
          [-2.55, NEAR, RAIL - 0.1],
          [CAB_BACK - 0.08, NEAR, RAIL - 0.1],
        ],
      ],
    ),
    ...[
      [FAR + 0.07, 0.36],
      [NEAR - 0.36, NEAR - 0.07],
    ].map(([y0, y1]) => box('bed', [REAR - 0.42, REAR + 0.42], [y0!, y1!], [FLOOR, FLOOR + 0.2])),
    box('bed', [CAB_BACK - 0.07, CAB_BACK], [FAR + 0.07, NEAR - 0.07], [FLOOR, RAIL]),
    box(
      'bed',
      [-2.7, -2.62],
      [FAR, NEAR],
      [0.6, RAIL],
      [
        onX(-2.7, [FAR + 0.02, FAR + 0.14], [0.9, 1.28]),
        onX(-2.7, [NEAR - 0.14, NEAR - 0.02], [0.9, 1.28]),
        [
          [-2.7, 0.75, 1.18],
          [-2.7, 1.11, 1.18],
        ],
      ],
    ),
    // Cab: raked windscreen, a roof with inset edges, door windows split by the pillar.
    extrude(
      'cab',
      [
        [CAB_BACK, BELT],
        [0.97, BELT],
        [0.05, 1.74],
        [-0.05, 1.76],
        [-0.8, 1.74],
        [-0.87, 1.66],
      ],
      [FAR + 0.06, CAB_Y],
      [
        outline([
          [0.08, CAB_Y, 1.35],
          [0.9, CAB_Y, 1.35],
          [0.1, CAB_Y, 1.71],
          [0.08, CAB_Y, 1.71],
        ]),
        outline([
          [-0.8, CAB_Y, 1.35],
          [-0.04, CAB_Y, 1.35],
          [-0.04, CAB_Y, 1.71],
          [-0.76, CAB_Y, 1.71],
        ]),
        outline([
          [screen(1.36), 0.22, 1.36],
          [screen(1.36), 1.64, 1.36],
          [screen(1.7), 1.64, 1.7],
          [screen(1.7), 0.22, 1.7],
        ]),
        onX(CAB_BACK, [0.4, 1.46], [1.38, 1.62]),
        // Roof panel, inset from its edges.
        outline([
          [-0.72, 0.25, 1.743],
          [-0.08, 0.25, 1.759],
          [-0.08, 1.61, 1.759],
          [-0.72, 1.61, 1.743],
        ]),
      ],
    ),
    // Mirrors on both doors.
    box('cab', [0.84, 0.98], [CAB_Y, NEAR + 0.16], [1.32, 1.46]),
    box('cab', [0.84, 0.98], [FAR - 0.1, FAR + 0.06], [1.32, 1.46]),
    // Side step between the arches, and both bumpers with fog lights in the front one.
    box('body', [-0.9, 1.05], [NEAR - 0.02, NEAR + 0.1], [0.36, 0.41]),
    box(
      'body',
      [2.6, 2.74],
      [FAR + 0.08, NEAR - 0.08],
      [0.33, 0.62],
      [onX(2.74, [0.22, 0.4], [0.44, 0.52]), onX(2.74, [1.46, 1.64], [0.44, 0.52])],
    ),
    box('body', [-2.78, -2.62], [FAR + 0.08, NEAR - 0.08], [0.45, 0.62]),
  );
