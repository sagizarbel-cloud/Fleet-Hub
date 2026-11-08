import { box, cylinder, extrude, model, ram, wheel, type V2, type V3 } from '../kit';

/**
 * A 20-tonne class wheel loader, in metres (+x front, +y the near side, z up). Articulated frame:
 * engine case at the rear, cab in the middle on the rear frame, lift arms and bucket in front.
 */

const arc = (cx: number, cz: number, r: number, from: number, to: number, n = 3): V2[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = ((from + ((to - from) * i) / n) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cz + r * Math.sin(a)] as const;
  });

/** A mudguard: plates bent round a wheel, `t` thick. */
const fender = (cx: number, cz: number, r: number, y: V2, from: number, to: number, t = 0.07) =>
  extrude('body', [...arc(cx, cz, r + t, from, to), ...arc(cx, cz, r, to, from)], y);

const REAR = -1.75;
const FRONT = 1.7;
const R = 0.87;

export const wheelLoader3d = () =>
  model(
    // Tyres, both sides.
    ...[REAR, FRONT].flatMap((x) => [
      wheel('wheels', x, R, R, [0, 0.7]),
      wheel('wheels', x, R, R, [2.1, 2.8]),
    ]),
    // Mudguards: the rear ones curl up behind the cab, the front ones have a flat top.
    ...[
      [-0.05, 0.75],
      [2.05, 2.85],
    ].flatMap(([y0, y1]) => [
      fender(REAR, R, 0.95, [y0!, y1!], 15, 125),
      fender(FRONT, R, 0.95, [y0!, y1!], 20, 160),
    ]),
    // Engine case, stopping at the back of the cab above the frame.
    extrude(
      'body',
      [
        [-3.5, 0.95],
        [-0.7, 0.95],
        [-0.7, 1.5],
        [-1.35, 1.5],
        [-1.35, 2.42],
        [-3.1, 2.35],
        [-3.5, 2.0],
      ],
      [0.5, 2.3],
      [
        // Engine door and louvres on the near side.
        [
          [-3.3, 2.3, 1.15],
          [-2.5, 2.3, 1.15],
          [-2.5, 2.3, 2.1],
          [-3.25, 2.3, 2.05],
          [-3.3, 2.3, 1.15],
        ],
        // Louvres sit above the rear mudguard, where they show.
        ...[1.98, 2.1, 2.22].map((z): V3[] => [
          [-2.3, 2.3, z],
          [-1.5, 2.3, z],
        ]),
        // Radiator grille on the back.
        ...[0.8, 1.1, 1.4, 1.7, 2.0].map((y): V3[] => [
          [-3.5, y, 1.1],
          [-3.5, y, 1.85],
        ]),
      ],
    ),
    // Front frame, from under the cab to the bucket.
    box('body', [-0.8, 2.3], [0.75, 2.05], [0.75, 1.55]),
    // Rear counterweight, a little wider than the engine case.
    box(
      'body',
      [-3.65, -3.4],
      [0.4, 2.4],
      [0.85, 1.5],
      [
        [
          [-3.4, 2.4, 1.05],
          [-3.4, 2.4, 1.3],
        ],
      ],
    ),
    // Exhaust stack and air pre-cleaner on the engine case.
    cylinder('body', 'z', [2.3, 2.85], [-2.68, 1.05], 0.08, 16),
    cylinder('body', 'z', [2.38, 2.72], [-1.82, 1.65], 0.14, 20),
    // Ladder up to the cab door on the near side, between the wheels.
    box(
      'body',
      [-0.7, -0.3],
      [2.3, 2.45],
      [0.4, 1.5],
      [0.7, 0.95, 1.2].map((z): V3[] => [
        [-0.7, 2.45, z],
        [-0.3, 2.45, z],
      ]),
    ),
    // Cab with its side and front windows.
    extrude(
      'cab',
      [
        [-1.35, 1.5],
        [0.45, 1.5],
        [0.3, 3.6],
        [-1.25, 3.6],
      ],
      [0.6, 2.2],
      [
        [
          [-1.15, 2.2, 2.25],
          [0.3, 2.2, 2.25],
          [0.2, 2.2, 3.45],
          [-1.1, 2.2, 3.45],
          [-1.15, 2.2, 2.25],
        ],
        [
          [-0.45, 2.2, 1.6],
          [-0.45, 2.2, 3.45],
        ],
        [
          [0.41, 0.75, 2.1],
          [0.31, 0.75, 3.45],
          [0.31, 2.05, 3.45],
          [0.41, 2.05, 2.1],
          [0.41, 0.75, 2.1],
        ],
      ],
    ),
    // Roof plate, beacon and front work lights.
    box('cab', [-1.45, 0.55], [0.5, 2.3], [3.6, 3.7]),
    cylinder('cab', 'z', [3.7, 3.88], [-0.52, 1.42], 0.1, 16),
    box('cab', [0.3, 0.5], [0.55, 0.75], [3.7, 3.82]),
    box('cab', [0.3, 0.5], [2.05, 2.25], [3.7, 3.82]),
    // Two lift arms.
    ...[
      [0.85, 1.15],
      [1.65, 1.95],
    ].map(([y0, y1]) =>
      extrude(
        'boom',
        [
          [0.2, 1.9],
          [0.7, 2.45],
          [3.35, 1.25],
          [3.1, 0.7],
        ],
        [y0!, y1!],
      ),
    ),
    // Lift rams from the front frame up to the arms, one outside each arm.
    ram('boom', [0.05, 0.8, 1.1], [1.55, 0.8, 1.62], 0.1),
    ram('boom', [0.05, 2.0, 1.1], [1.55, 2.0, 1.62], 0.1),
    // Tilt linkage: a lever across the arms with its ram back to the frame.
    box('boom', [1.75, 1.95], [0.85, 1.95], [1.55, 2.05]),
    ram('boom', [0.5, 1.4, 1.5], [1.8, 1.4, 1.95], 0.09),
    // Bucket and its teeth.
    extrude(
      'bucket',
      [
        [3.0, 1.5],
        [3.6, 1.65],
        [4.35, 0.22],
        [3.5, 0.08],
        [3.0, 0.45],
      ],
      [-0.05, 2.85],
    ),
    ...[0.2, 0.7, 1.2, 1.7, 2.2].map((y) =>
      extrude(
        'bucket',
        [
          [4.15, 0.1],
          [4.6, 0.12],
          [4.25, 0.33],
        ],
        [y, y + 0.22],
      ),
    ),
  );
