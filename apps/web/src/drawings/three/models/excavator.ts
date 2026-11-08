import * as THREE from 'three';
import type { ExcavatorTool } from '@fleet-hub/shared';
import { box, cylinder, extrude, model, ram, wheel, type V2, type V3 } from '../kit';

/**
 * Excavators, in metres (+x front, +y the near side, z up): a 30-tonne class crawler and a
 * wheeled excavator sharing one upper structure. The arm digs out in front for the side and
 * isometric views and folds in for the top view. Boom, stick and tool each have their rams and
 * pins; the crawler tracks show their rollers, sprocket and idler.
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

/** The tool on the end of the stick, with its tip at (tx, tz) and its pin at (px, pz). */
function tool(kind: ExcavatorTool, mid: number, dx: number, teeth: boolean): THREE.Object3D[] {
  const shift = (pts: V2[]): V2[] => pts.map(([x, z]) => [x + dx, z] as const);
  if (kind === 'hammer') {
    return [
      extrude(
        'bucket',
        shift([
          [6.25, 0.95],
          [6.85, 0.95],
          [6.8, 0.4],
          [6.65, 0.3],
          [6.45, 0.3],
          [6.3, 0.4],
        ]),
        [mid - 0.32, mid + 0.32],
        [
          [
            [6.3 + dx, mid + 0.32, 0.78],
            [6.8 + dx, mid + 0.32, 0.78],
          ],
        ],
      ),
      cylinder('bucket', 'z', [0.02, 0.32], [6.55 + dx, mid], 0.07, 16),
    ];
  }
  const width: V2 = [mid - 0.6, mid + 0.6];
  return [
    extrude(
      'bucket',
      teeth
        ? [
            [6.2, 1.0],
            [6.95, 0.9],
            [7.25, 0.2],
            [6.95, 0.0],
            [6.35, 0.25],
          ]
        : [
            [2.9, 0.9],
            [3.75, 0.95],
            [3.85, 0.3],
            [3.4, 0.05],
            [2.9, 0.35],
          ],
      width,
      teeth
        ? [
            // Wear strips across the back of the bucket.
            ...[0.35, 0.6].map((t): V3[] => [
              [6.95 + 0.3 * t, mid + 0.6, 0.9 - 0.7 * t],
              [6.95 + 0.3 * t, mid - 0.6, 0.9 - 0.7 * t],
            ]),
          ]
        : [],
    ),
    // Side cutters, a little proud of the bucket's sides.
    ...[width[0] - 0.04, width[1]].map((y) =>
      extrude(
        'bucket',
        teeth
          ? [
              [6.6, 0.95],
              [6.95, 0.9],
              [7.25, 0.2],
              [7.05, 0.15],
            ]
          : [
              [3.3, 0.93],
              [3.75, 0.95],
              [3.85, 0.3],
              [3.65, 0.25],
            ],
        [y, y + 0.04],
      ),
    ),
    ...(teeth
      ? [-0.45, -0.22, 0, 0.22, 0.45].map((dy) =>
          extrude(
            'bucket',
            [
              [7.14, 0.42],
              [7.27, 0.3],
              [7.36, 0.04],
              [7.2, 0.12],
            ],
            [mid + dy - 0.06, mid + dy + 0.06],
          ),
        )
      : []),
  ];
}

/** Boom, stick, rams and tool: out digging, or folded in as parked. */
function arm(z: number, mid: number, folded: boolean, kind: ExcavatorTool): THREE.Object3D[] {
  const boom: V2[] = folded
    ? [
        [0.9, z + 0.5],
        [1.6, z + 0.4],
        [3.0, z + 2.2],
        [3.95, z + 1.5],
        [4.15, z + 1.85],
        [2.95, z + 2.8],
        [0.9, z + 1.2],
      ]
    : [
        [0.9, z + 0.5],
        [1.6, z + 0.4],
        [3.8, z + 2.3],
        [5.9, z + 1.3],
        [6.0, z + 1.75],
        [3.7, z + 2.9],
        [0.9, z + 1.2],
      ];
  const stick: V2[] = folded
    ? [
        [3.75, z + 1.95],
        [4.2, z + 1.85],
        [3.7, 0.75],
        [3.3, 0.85],
      ]
    : [
        [5.65, z + 1.9],
        [6.1, z + 2.0],
        [6.75, 0.8],
        [6.35, 0.6],
      ];
  const knee = folded ? ([4.0, z + 1.7] as const) : ([5.92, z + 1.55] as const);
  const wrist = folded ? ([3.55, 0.9] as const) : ([6.55, 0.75] as const);
  const lift: [V3, V3] = folded
    ? [
        [1.3, 0, z + 0.35],
        [2.3, 0, z + 1.3],
      ]
    : [
        [1.3, 0, z + 0.35],
        [2.6, 0, z + 1.3],
      ];
  const dipper: [V3, V3] = folded
    ? [
        [2.5, mid, z + 2.52],
        [3.95, mid, z + 2.15],
      ]
    : [
        [2.95, mid, z + 2.55],
        [5.85, mid, z + 2.08],
      ];
  return [
    extrude(
      'boom',
      boom,
      [mid - 0.35, mid + 0.35],
      [
        // A stiffening plate along the near side.
        folded
          ? [
              [1.4, mid + 0.35, z + 0.85],
              [2.6, mid + 0.35, z + 2.2],
            ]
          : [
              [1.5, mid + 0.35, z + 0.9],
              [3.1, mid + 0.35, z + 2.2],
            ],
      ],
    ),
    extrude('boom', stick, [mid - 0.25, mid + 0.25]),
    // Two lift rams beside the boom, the stick ram on top of it, the tool ram along the stick.
    ...[mid - 0.47, mid + 0.47].map((y) =>
      ram('boom', [lift[0][0], y, lift[0][2]], [lift[1][0], y, lift[1][2]], 0.11),
    ),
    ram('boom', dipper[0], dipper[1], 0.1),
    folded
      ? ram('boom', [4.1, mid, z + 1.45], [3.75, mid, 1.15], 0.07)
      : ram('boom', [6.15, mid, z + 1.7], [6.75, mid, 1.1], 0.07),
    pin('boom', 1.2, z + 0.8, [mid - 0.42, mid + 0.42]),
    pin('boom', knee[0], knee[1], [mid - 0.32, mid + 0.32]),
    pin('boom', wrist[0], wrist[1], [mid - 0.32, mid + 0.32], 0.08),
    ...tool(kind, mid, folded ? -3.05 : 0, !folded),
  ];
}

/** Upper structure on its slewing ring: house, round counterweight, engine cover, cab, arm. */
function upper(z: number, w: number, folded: boolean, kind: ExcavatorTool): THREE.Object3D[] {
  const mid = w / 2;
  const near = w - 0.1;
  return [
    cylinder('body', 'z', [z - 0.12, z], [-0.2, mid], 1.0, 32),
    box(
      'body',
      [-1.9, 1.3],
      [0.1, near],
      [z, z + 1.1],
      [
        // Service doors on the near side.
        ...[-1.55, -0.75].map((x) =>
          outline([
            [x, near, z + 0.2],
            [x + 0.7, near, z + 0.2],
            [x + 0.7, near, z + 0.95],
            [x, near, z + 0.95],
          ]),
        ),
      ],
    ),
    // Counterweight with a rounded back.
    extrude(
      'body',
      [[-1.6, z + 0.02], [-1.6, z + 1.22], ...arc(-1.95, z + 0.62, 0.6, 90, 270)],
      [0.1, near],
    ),
    // Engine cover with a grille, the exhaust stack and the handrail along the near edge.
    box(
      'body',
      [-1.8, -0.2],
      [0.2, w - 1.2],
      [z + 1.1, z + 1.4],
      [
        outline([
          [-1.6, 0.4, z + 1.4],
          [-0.4, 0.4, z + 1.4],
          [-0.4, w - 1.4, z + 1.4],
          [-1.6, w - 1.4, z + 1.4],
        ]),
        ...[-1.35, -1.1, -0.85, -0.6].map((x): V3[] => [
          [x, 0.45, z + 1.4],
          [x, w - 1.45, z + 1.4],
        ]),
      ],
    ),
    cylinder('body', 'z', [z + 1.4, z + 1.95], [-0.95, 0.55], 0.07, 16),
    ...[-1.7, -0.4].map((x) => box('body', [x, x + 0.05], [near - 0.08, near], [z + 1.1, z + 1.5])),
    box('body', [-1.7, -0.35], [near - 0.08, near], [z + 1.45, z + 1.5]),
    // Cab: door with its window, windscreen, and a roof with a small overhang.
    extrude(
      'cab',
      [
        [0.1, z + 1.1],
        [1.3, z + 1.1],
        [1.15, z + 2.05],
        [0.1, z + 2.05],
      ],
      [w - 1.1, near],
      [
        outline([
          [0.15, near, z + 1.15],
          [0.75, near, z + 1.15],
          [0.75, near, z + 1.95],
          [0.15, near, z + 1.95],
        ]),
        outline([
          [0.22, near, z + 1.4],
          [0.68, near, z + 1.4],
          [0.68, near, z + 1.88],
          [0.22, near, z + 1.88],
        ]),
        outline([
          [0.82, near, z + 1.4],
          [1.2, near, z + 1.4],
          [1.11, near, z + 1.9],
          [0.82, near, z + 1.9],
        ]),
        outline([
          [1.28, w - 1.0, z + 1.25],
          [1.16, w - 1.0, z + 1.95],
          [1.16, near - 0.1, z + 1.95],
          [1.28, near - 0.1, z + 1.25],
        ]),
      ],
    ),
    box('cab', [0.05, 1.22], [w - 1.15, near + 0.05], [z + 2.05, z + 2.11]),
    box('cab', [1.2, 1.28], [near, near + 0.12], [z + 1.7, z + 1.95]),
    ...arm(z, mid, folded, kind),
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
