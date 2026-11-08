import * as THREE from 'three';
import type { ExcavatorTool } from '@fleet-hub/shared';
import { box, cylinder, extrude, model, ram, wheel, type V2, type V3 } from '../kit';

/**
 * Excavators, in metres (+x front, +y the near side, z up): a 30-tonne class crawler and a
 * wheeled excavator sharing one upper structure. The arm digs out in front for the side and
 * isometric views and folds in for the top view. Boom, stick and tool each have their rams and
 * pins; the crawler tracks show their rollers, sprocket and idler. Proportions follow a 30-tonne
 * class machine: cab roof a little above the engine house, flat counterweight, bucket curling back.
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

const outline = (pts: V3[]): V3[] => [...pts, pts[0]!];

/** A rectangle on a face of constant y. */
const onY = (y: number, [x0, x1]: V2, [z0, z1]: V2): V3[] =>
  outline([
    [x0, y, z0],
    [x1, y, z0],
    [x1, y, z1],
    [x0, y, z1],
  ]);

/** A pin through a joint, across the arm. */
const pin = (part: 'boom' | 'bucket', x: number, z: number, [y0, y1]: V2, r = 0.09) =>
  cylinder(part, 'y', [y0, y1], [x, z], r, 16);

/** A crawler track: a long loop round the sprocket and idler, with its rollers on the side. */
function track(y: V2) {
  const [y0, y1] = y;
  const shoes = Array.from({ length: 11 }, (_, i): V3[] => {
    const x = -1.9 + i * 0.38;
    return [
      [x, y0, 1.0],
      [x, y1, 1.0],
    ];
  });
  const side = (yy: number): V3[][] => [
    // Track frame, rollers, sprocket at the back and idler at the front.
    outline([
      [-1.6, yy, 0.32],
      [1.6, yy, 0.32],
      [1.6, yy, 0.78],
      [-1.6, yy, 0.78],
    ]),
    ...[-1.2, -0.6, 0, 0.6, 1.2].map((x) => ring(x, yy, 0.2, 0.11)),
    ring(-1.95, yy, 0.5, 0.32),
    ring(-1.95, yy, 0.5, 0.12),
    ring(1.95, yy, 0.5, 0.3),
  ];
  return extrude(
    'tracks',
    [...arc(1.95, 0.5, 0.5, -90, 90), ...arc(-1.95, 0.5, 0.5, 90, 270)],
    y,
    [...shoes, ...side(y0), ...side(y1)],
    true,
  );
}

/** Moves profile points by (dx, dz). */
const move = (pts: V2[], dx: number, dz: number): V2[] => pts.map(([x, z]) => [x + dx, z + dz]);

/**
 * The tool on the end of the stick, hung from its pin at (6.3, 1.5) when digging. The bucket
 * curls toward the machine: rounded back away from it, teeth pointing back at the tracks.
 */
function tool(kind: ExcavatorTool, mid: number, dx: number, dz: number): THREE.Object3D[] {
  const at = (pts: V2[]) => move(pts, dx, dz);
  if (kind === 'hammer') {
    return [
      extrude(
        'bucket',
        at([
          [6.05, 1.6],
          [6.6, 1.6],
          [6.55, 0.5],
          [6.42, 0.38],
          [6.23, 0.38],
          [6.1, 0.5],
        ]),
        [mid - 0.3, mid + 0.3],
        [
          [
            [6.08 + dx, mid + 0.3, 1.25 + dz],
            [6.58 + dx, mid + 0.3, 1.25 + dz],
          ],
        ],
      ),
      cylinder('bucket', 'z', [0.05 + dz, 0.38 + dz], [6.33 + dx, mid], 0.07, 16),
    ];
  }
  const width: V2 = [mid - 0.65, mid + 0.65];
  const shell: V2[] = [
    [6.0, 1.62],
    [6.75, 1.65],
    ...arc(6.55, 0.85, 0.66, 50, -60, 6),
    [6.55, 0.03],
    [5.65, 0.02],
    [5.35, 0.12],
  ];
  return [
    extrude('bucket', at(shell), width, [
      // Wear strips round the back of the bucket.
      ...[10, -25].map((deg): V3[] => {
        const a = (deg * Math.PI) / 180;
        const [x, z] = [6.55 + dx + 0.66 * Math.cos(a), 0.85 + dz + 0.66 * Math.sin(a)];
        return [
          [x, width[0], z],
          [x, width[1], z],
        ];
      }),
    ]),
    // Side plates, a little proud of the shell.
    ...[width[0] - 0.04, width[1]].map((y) =>
      extrude(
        'bucket',
        at([
          [6.0, 1.66],
          [6.8, 1.68],
          [6.6, 0.9],
          [5.4, 0.16],
          [5.6, 0.55],
        ]),
        [y, y + 0.04],
      ),
    ),
    // Teeth along the lip, pointing back toward the machine.
    ...[-0.5, -0.25, 0, 0.25, 0.5].map((dy) =>
      extrude(
        'bucket',
        at([
          [5.5, 0.04],
          [5.5, 0.22],
          [5.16, 0.1],
          [5.18, 0.04],
        ]),
        [mid + dy - 0.06, mid + dy + 0.06],
      ),
    ),
  ];
}

/**
 * Boom, stick, rams and tool, in the crawler's heights (raised by `dz` on the wheeled one).
 * Digging: the boom rises steeply from beside the cab and arches out, the stick hangs almost
 * straight down to the bucket on the ground. Folded (top view only): the stick tucks back in.
 */
function arm(dz: number, mid: number, folded: boolean, kind: ExcavatorTool): THREE.Object3D[] {
  const P = (x: number, z: number): V2 => [x, z + dz];
  const boom: V2[] = [
    P(0.75, 1.55),
    P(1.25, 1.6),
    P(1.75, 2.9),
    P(2.5, 3.75),
    P(3.6, 4.25),
    P(4.9, 4.3),
    P(5.45, 4.55),
    P(5.35, 4.95),
    P(3.6, 4.85),
    P(2.25, 4.4),
    P(1.3, 3.55),
    P(0.7, 2.2),
  ];
  const stick: V2[] = folded
    ? [P(4.75, 5.25), P(5.1, 5.45), P(3.95, 1.55), P(3.6, 1.7)]
    : [P(4.75, 5.2), P(5.1, 5.45), P(6.5, 1.65), P(6.15, 1.4)];
  const wrist = folded ? P(3.75, 1.6) : P(6.3, 1.5);
  const knee = P(5.15, 4.62);
  const top = P(4.95, 5.35);
  return [
    extrude(
      'boom',
      boom,
      [mid - 0.38, mid + 0.38],
      [
        // A stiffening plate along the near side of the boom.
        [
          [1.3, mid + 0.38, 2.4 + dz],
          [2.3, mid + 0.38, 3.85 + dz],
          [3.6, mid + 0.38, 4.5 + dz],
          [4.8, mid + 0.38, 4.55 + dz],
        ],
      ],
    ),
    extrude('boom', stick, [mid - 0.26, mid + 0.26]),
    // Lift rams from the front of the house up under the boom, either side of it.
    ...[mid - 0.5, mid + 0.5].map((y) =>
      ram('boom', [1.55, y, 1.7 + dz], [2.15, y, 3.55 + dz], 0.12),
    ),
    // Stick ram along the top of the boom to the head of the stick.
    ram('boom', [2.3, mid, 4.55 + dz], [top[0], mid, top[1]], 0.11),
    // Tool ram down the outside of the stick.
    folded
      ? ram('boom', [5.15, mid, 5.15 + dz], [4.1, mid, 2.0 + dz], 0.08)
      : ram('boom', [5.2, mid, 5.15 + dz], [6.55, mid, 2.05 + dz], 0.08),
    pin('boom', 1.0, 1.85 + dz, [mid - 0.45, mid + 0.45]),
    pin('boom', knee[0], knee[1], [mid - 0.34, mid + 0.34]),
    pin('boom', wrist[0], wrist[1], [mid - 0.34, mid + 0.34], 0.08),
    ...tool(kind, mid, folded ? -2.55 : 0, dz + (folded ? 0.1 : 0)),
  ];
}

/**
 * Upper structure on its slewing ring. The cab stands on the deck at the front corner of the far side
 * (the operator's left, behind the boom in the side view), its
 * roof only a little above the engine house; the house runs behind it to a flat counterweight
 * with a chamfered top edge, and forward on the near side to the boom foot.
 */
function upper(z: number, w: number, folded: boolean, kind: ExcavatorTool): THREE.Object3D[] {
  const near = w - 0.1;
  const cabY = 1.05;
  // The boom sits just off the cab, a little toward the near side, as on the real machines.
  const mid = Math.max(w / 2, cabY + 0.65);
  const H = 1.25;
  return [
    cylinder('body', 'z', [z - 0.12, z], [-0.2, w / 2], 1.0, 32),
    // Deck under the cab and the house.
    box('body', [-2.65, 1.3], [0.1, near], [z, z + 0.12]),
    // Engine house and counterweight, full width behind the cab.
    extrude(
      'body',
      [
        [-2.65, z + 0.12],
        [-0.45, z + 0.12],
        [-0.45, z + H],
        [-2.45, z + H],
        [-2.65, z + H - 0.22],
      ],
      [0.1, near],
      [
        // Louvred side panels and a service door on the near side.
        ...[0.45, 0.62, 0.79].map((dzz): V3[] => [
          [-1.95, near, z + dzz],
          [-1.45, near, z + dzz],
        ]),
        outline([
          [-2.5, near, z + 0.3],
          [-2.05, near, z + 0.3],
          [-2.05, near, z + 1.05],
          [-2.5, near, z + 1.05],
        ]),
        // Counterweight seam and tail lights on the flat back.
        [
          [-2.65, 0.1, z + 0.6],
          [-2.65, near, z + 0.6],
        ],
        outline([
          [-2.65, 0.3, z + 0.32],
          [-2.65, 0.55, z + 0.32],
          [-2.65, 0.55, z + 0.42],
          [-2.65, 0.3, z + 0.42],
        ]),
        outline([
          [-2.65, near - 0.45, z + 0.32],
          [-2.65, near - 0.2, z + 0.32],
          [-2.65, near - 0.2, z + 0.42],
          [-2.65, near - 0.45, z + 0.42],
        ]),
      ],
    ),
    // Right side, beside the boom: boom foot housing in the middle, then a toolbox at the
    // front and the hydraulic tank behind it, stepping up to the house like a stair.
    box('body', [-0.45, 1.3], [cabY + 0.05, mid + 0.45], [z + 0.12, z + 0.6]),
    box(
      'body',
      [0.15, 1.3],
      [mid + 0.45, near],
      [z + 0.12, z + 0.72],
      [
        onY(near, [0.3, 1.15], [z + 0.22, z + 0.62]),
        [
          [1.05, near, z + 0.4],
          [1.05, near, z + 0.48],
        ],
      ],
    ),
    box(
      'body',
      [-0.45, 0.15],
      [mid + 0.45, near],
      [z + 0.12, z + 1.0],
      [onY(near, [-0.35, 0.05], [z + 0.25, z + 0.9])],
    ),
    // Step plates up the front of the toolbox and the tank.
    box('body', [1.3, 1.45], [near - 0.55, near - 0.05], [z + 0.33, z + 0.37]),
    box('body', [0.15, 0.3], [near - 0.55, near - 0.05], [z + 0.95, z + 1.0]),
    // Handrail beside the steps and a guard rail round the front corner of the house top.
    ...[1.2, 0.2].map((x) => box('body', [x, x + 0.05], [near - 0.05, near], [z + 0.72, z + 1.55])),
    box('body', [0.2, 1.25], [near - 0.05, near], [z + 1.5, z + 1.55]),
    ...[
      [-0.55, near - 0.05],
      [-0.55, near - 0.75],
      [-1.15, near - 0.05],
    ].map(([x, y]) => box('body', [x!, x! + 0.05], [y!, y! + 0.05], [z + H, z + H + 0.75])),
    box('body', [-0.55, -0.5], [near - 0.75, near], [z + H + 0.7, z + H + 0.75]),
    box('body', [-1.15, -0.5], [near - 0.05, near], [z + H + 0.7, z + H + 0.75]),
    // Dark radiator grille panel on the right side of the house.
    box(
      'body',
      [-1.35, -0.6],
      [near, near + 0.03],
      [z + 0.25, z + 1.1],
      [
        ...[0.38, 0.52, 0.66, 0.8, 0.94].map((dzz): V3[] => [
          [-1.3, near + 0.03, z + dzz],
          [-0.65, near + 0.03, z + dzz],
        ]),
      ],
    ),
    // Engine hood grille and the exhaust.
    box(
      'body',
      [-2.2, -0.75],
      [0.35, w - 1.4],
      [z + H, z + H + 0.08],
      [
        ...[-1.95, -1.7, -1.45, -1.2, -0.95].map((x): V3[] => [
          [x, 0.45, z + H + 0.08],
          [x, w - 1.5, z + H + 0.08],
        ]),
      ],
    ),
    cylinder('body', 'z', [z + H, z + H + 0.4], [-1.0, 0.6], 0.07, 16),

    // Cab on the deck: big door glass, a raked front screen, roof just above the house.
    extrude(
      'cab',
      [
        [-0.45, z + 0.12],
        [1.25, z + 0.12],
        [1.3, z + 0.85],
        [1.15, z + 1.72],
        [1.0, z + 1.8],
        [-0.45, z + 1.8],
      ],
      [0.1, cabY],
      [
        outline([
          [-0.3, cabY, z + 0.25],
          [0.55, cabY, z + 0.25],
          [0.55, cabY, z + 1.7],
          [-0.3, cabY, z + 1.7],
        ]),
        outline([
          [-0.22, cabY, z + 0.75],
          [0.47, cabY, z + 0.75],
          [0.47, cabY, z + 1.62],
          [-0.22, cabY, z + 1.62],
        ]),
        outline([
          [0.63, cabY, z + 0.75],
          [1.24, cabY, z + 0.75],
          [1.13, cabY, z + 1.62],
          [0.63, cabY, z + 1.62],
        ]),
        [
          [0.42, cabY, z + 1.05],
          [0.42, cabY, z + 1.2],
        ],
        outline([
          [1.27, 0.2, z + 0.6],
          [1.15, 0.2, z + 1.65],
          [1.15, cabY - 0.1, z + 1.65],
          [1.27, cabY - 0.1, z + 0.6],
        ]),
      ],
    ),
    box('cab', [-0.5, 1.1], [0.07, cabY + 0.03], [z + 1.8, z + 1.86]),
    box('cab', [1.15, 1.25], [-0.02, 0.1], [z + 1.35, z + 1.6]),
    ...arm(z - 1.1, mid, folded, kind),
  ];
}

export const crawler3d = (folded: boolean, kind: ExcavatorTool) =>
  model(
    track([0, 0.65]),
    track([2.55, 3.2]),
    // Car body between the tracks.
    box('body', [-1.2, 1.2], [0.65, 2.55], [0.45, 1.0]),
    ...upper(1.1, 3.2, folded, kind),
  );

export const wheeled3d = (folded: boolean, kind: ExcavatorTool) =>
  model(
    ...[-1.35, 1.35].flatMap((x) => [
      wheel('wheels', x, 0.55, 0.55, [0, 0.5]),
      wheel('wheels', x, 0.55, 0.55, [2.0, 2.5]),
    ]),
    // Mudguards over the wheels.
    ...[-1.35, 1.35].flatMap((x) =>
      [
        [-0.03, 0.53],
        [1.97, 2.53],
      ].map(([y0, y1]) =>
        extrude(
          'body',
          [...arc(x, 0.55, 0.68, 25, 155, 6), ...arc(x, 0.55, 0.63, 155, 25, 6)],
          [y0!, y1!],
        ),
      ),
    ),
    // Chassis, steps and the toolbox between the wheels.
    box('body', [-2.0, 2.0], [0.4, 2.1], [0.6, 1.13]),
    box(
      'body',
      [-0.6, 0.6],
      [2.1, 2.3],
      [0.55, 1.0],
      [
        outline([
          [-0.5, 2.3, 0.62],
          [0.5, 2.3, 0.62],
          [0.5, 2.3, 0.94],
          [-0.5, 2.3, 0.94],
        ]),
      ],
    ),
    // Push frame and a curved dozer blade at the front.
    box('body', [1.9, 2.2], [0.6, 1.9], [0.35, 0.65]),
    extrude(
      'bucket',
      [[2.1, 0.1], [2.35, 0.1], ...arc(2.75, 0.5, 0.45, 205, 155, 4), [2.2, 0.85]],
      [0, 2.5],
    ),
    ...upper(1.25, 2.5, folded, kind),
  );
