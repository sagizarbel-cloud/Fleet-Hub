import { box, extrude, model, wheel, type V2, type V3 } from '../kit';

/**
 * Double-cab pickup, in drawing units (44 per metre; render with unit 1), following the
 * hand-drawn side view (its y = 130 - z). Open bed with walls, wheel arches cut into the body,
 * a cab with a raked windscreen, mirrors, lights and bumpers.
 */

/** A wheel arch over a tyre centred at (cx, 20), meeting the sill at z = 26. */
const arch = (cx: number, r: number): V2[] => {
  const a0 = Math.asin(6 / r);
  return Array.from({ length: 13 }, (_, i) => {
    const a = Math.PI - a0 - (i / 12) * (Math.PI - 2 * a0);
    return [cx + r * Math.cos(a), 20 + r * Math.sin(a)] as const;
  });
};

const NEAR = 102;
const FAR = 8;
const rect = (x0: number, x1: number, y: number, z0: number, z1: number): V3[] => [
  [x0, y, z0],
  [x1, y, z0],
  [x1, y, z1],
  [x0, y, z1],
  [x0, y, z0],
];
const front = (y0: number, y1: number, z0: number, z1: number, x = 252): V3[] => [
  [x, y0, z0],
  [x, y1, z0],
  [x, y1, z1],
  [x, y0, z1],
  [x, y0, z0],
];

export const pickup3d = () =>
  model(
    // Tyres, both sides.
    ...[62, 208].flatMap((x) => [
      wheel('wheels', x, 20, 20, [4, 18]),
      wheel('wheels', x, 20, 20, [92, 106]),
    ]),
    // Lower body with the wheel arches: bed floor at the back, the hood at the front.
    extrude(
      'body',
      [
        [18, 26],
        ...arch(62, 24),
        ...arch(208, 24),
        [248, 26],
        [252, 30],
        [252, 56],
        [248, 63],
        [206, 68],
        [118, 62],
        [118, 46],
        [18, 46],
      ],
      [FAR, NEAR],
      [
        // Door edges, stopping above the front arch.
        [
          [126, NEAR, 32],
          [126, NEAR, 62],
        ],
        [
          [190, NEAR, 48],
          [190, NEAR, 64],
        ],
        [
          [154, NEAR, 34],
          [154, NEAR, 62],
        ],
        // Door handles.
        [
          [132, NEAR, 56],
          [140, NEAR, 56],
        ],
        [
          [160, NEAR, 56],
          [168, NEAR, 56],
        ],
        // Headlights and grille on the nose.
        front(16, 30, 50, 57),
        front(80, 94, 50, 57),
        ...[38, 43, 48].map((z): V3[] => [
          [252, 36, z],
          [252, 74, z],
        ]),
      ],
    ),
    // The bed: side walls, front wall and tailgate standing on the floor.
    box('bed', [22, 118], [FAR, 13], [46, 62]),
    box(
      'bed',
      [22, 118],
      [97, NEAR],
      [46, 62],
      [
        [
          [22, NEAR, 52],
          [114, NEAR, 52],
        ],
      ],
    ),
    box('bed', [113, 118], [13, 97], [46, 62]),
    box(
      'bed',
      [18, 22],
      [FAR, NEAR],
      [46, 62],
      [
        // Tail lights on the back corners.
        ...[
          [10, 17],
          [93, 100],
        ].map(([y0, y1]) => front(y0!, y1!, 46, 58, 18)),
      ],
    ),
    // Cab: raked windscreen, roof, side windows split by the pillar.
    extrude(
      'cab',
      [
        [118, 62],
        [198, 62],
        [206, 68],
        [184, 96],
        [176, 100],
        [128, 100],
        [122, 96],
      ],
      [12, 98],
      [
        rect(128, 152, 98, 70, 93),
        [
          [156, 98, 70],
          [192, 98, 70],
          [176, 98, 93],
          [156, 98, 93],
          [156, 98, 70],
        ],
        // Windscreen.
        [
          [202.5, 20, 71],
          [202.5, 90, 71],
          [186.5, 90, 92],
          [186.5, 20, 92],
          [202.5, 20, 71],
        ],
        // Rear window.
        [
          [118, 28, 72],
          [118, 82, 72],
          [118, 82, 92],
          [118, 28, 92],
          [118, 28, 72],
        ],
      ],
    ),
    // Mirrors on the doors' front corners.
    box('cab', [188, 196], [98, 106], [70, 78]),
    box('cab', [188, 196], [4, 12], [70, 78]),
    // Bumpers.
    box('body', [252, 257], [10, 100], [28, 38]),
    box('body', [13, 18], [12, 98], [28, 36]),
  );
