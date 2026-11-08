import { box, cylinder, extrude, hull, model, type V2, type V3 } from '../kit';

/**
 * Double-cab pickup at one-tonne size, in metres (+x front, +y the near side, z up), traced off
 * dimensioned side, front and plan views (Sagi, 2026-11-08): 5.34 m long, 1.86 m wide, 1.81 m
 * high, about 3.1 m wheelbase. Open bed with walls, wheel-well humps and a ribbed floor; a cab
 * whose glass leans in to a narrower roof; a long hood that slopes to a nose rounded in plan;
 * flared arches, four doors, mirrors, lights and bumpers.
 */

const arc = (cx: number, cz: number, r: number, from: number, to: number, n = 12): V2[] =>
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
const onX = (x: number, [y0, y1]: V2, [z0, z1]: V2): V3[] =>
  outline([
    [x, y0, z0],
    [x, y1, z0],
    [x, y1, z1],
    [x, y0, z1],
  ]);

/** Tyres: radius, axle positions, and the arch cut-outs and flares over them. */
const R = 0.37;
const REAR = -1.47;
const FRONT = 1.64;
const REAR_ARCH = 0.5;
const FRONT_ARCH = 0.45;
/** Width: the body sides (flares stand 0.04 proud of them) and the centre line. */
const W = 1.86;
const C = W / 2;
const SIDE: V2 = [0.04, W - 0.04];
/** Heights: rocker, bottom of the bed's sides, bed floor, bed rail, beltline, roof. */
const ROCKER = 0.33;
const BED_LOW = 0.55;
const FLOOR = 0.9;
const RAIL = 1.32;
const BELT = 1.3;
const ROOF = 1.81;
/** Lengths: tailgate, bed front, cab back, windscreen base. */
const TAIL = -2.58;
const BED_FRONT = -0.97;
const CAB_BACK = -0.92;
const SCREEN = 1.3;
/** The nose: where the plan starts to round off, and the front face. */
const NOSE_START = 2.09;
const NOSE = 2.66;
/** The hood ends just shy of the bumper's front. */
const HOOD_END = 2.58;

/** The hood's top, traced off the side view: nearly flat back by the windscreen, curving down
 * towards the nose but ending at 1.08 m. */
const HOOD: [number, number][] = [
  [SCREEN, BELT],
  [2.09, 1.21],
  [2.25, 1.18],
  [2.36, 1.155],
  [2.47, 1.13],
  [HOOD_END, 1.08],
];
/** Height of the hood's top at x. */
const hood = (x: number) => {
  const i = Math.max(
    1,
    HOOD.findIndex(([hx]) => hx >= x),
  );
  const [x0, z0] = HOOD[i - 1]!;
  const [x1, z1] = HOOD[i]!;
  return z0 + ((z1 - z0) * (x - x0)) / (x1 - x0);
};
/** x of the windscreen at height z. */
const screen = (z: number) => SCREEN - ((SCREEN - 0.58) * (z - BELT)) / (1.76 - BELT);
/** Half-width of the cab's side glass at height z (it leans in from the belt to the roof). */
const glass = (z: number) => 0.8 - (0.11 * (z - BELT)) / (1.76 - BELT);
/** A point on the cab's near side glass. */
const onGlass = (x: number, z: number): V3 => [x, C + glass(z), z];
const both = (pts: [number, number, number][]): V3[] =>
  pts.flatMap(([x, h, z]) => [[x, C - h, z] as V3, [x, C + h, z] as V3]);

/** Where an arch of radius r round the axle at cx meets height z, behind (-1) or ahead (+1). */
const meet = (cx: number, r: number, z: number, side: -1 | 1) =>
  cx + side * Math.sqrt(r * r - (z - R) * (z - R));
const archArc = (cx: number, r: number, zBack: number, zFront: number): V2[] => {
  const deg = (z: number) => (Math.asin((z - R) / r) * 180) / Math.PI;
  return arc(cx, R, r, 180 - deg(zBack), deg(zFront), 14);
};

/** The nose's half-width in plan, by x (traced off the plan view). */
const TAPER: [number, number][] = [
  [NOSE_START, 0.89],
  [2.25, 0.885],
  [2.36, 0.82],
  [2.47, 0.7],
  [2.58, 0.58],
  [NOSE, 0.5],
];
/** The upper nose stops at the hood's end. */
const UPPER: [number, number][] = TAPER.map(([x, h]) => [Math.min(x, HOOD_END), h]);

/** A tyre with the rim and hub drawn on both faces. */
const tyre = (cx: number, [y0, y1]: V2) =>
  cylinder('wheels', 'y', [y0, y1], [cx, R], R, 32, [
    ...[y0, y1].flatMap((y) => [ring(cx, y, R, R * 0.66), ring(cx, y, R, R * 0.22)]),
  ]);

const TYRE = 0.26;
const NEAR = SIDE[1];

export const pickup3d = () =>
  model(
    ...[REAR, FRONT].flatMap((x) => [
      tyre(x, [SIDE[0] + 0.01, SIDE[0] + 0.01 + TYRE]),
      tyre(x, [NEAR - 0.01 - TYRE, NEAR - 0.01]),
    ]),
    // Lower body: the bed's sides behind the cab, the doors, the front wing up to the hood.
    extrude(
      'body',
      [
        [TAIL, BED_LOW],
        [meet(REAR, REAR_ARCH, BED_LOW, -1), BED_LOW],
        ...archArc(REAR, REAR_ARCH, BED_LOW, ROCKER),
        [meet(FRONT, FRONT_ARCH, ROCKER, -1), ROCKER],
        ...archArc(FRONT, FRONT_ARCH, ROCKER, 0.4),
        [NOSE_START, 0.4],
        [NOSE_START, 0.86],
        [SCREEN, 0.86],
        [SCREEN, BELT],
        [CAB_BACK, BELT],
        [CAB_BACK, FLOOR],
        [TAIL, FLOOR],
      ],
      SIDE,
      [
        // Door edges, the door bottoms, and the handles.
        ...[1.16, 0.05, -0.85].map((x): V3[] => [
          [x, NEAR, 0.43],
          [x, NEAR, BELT],
        ]),
        [
          [-0.85, NEAR, 0.43],
          [1.1, NEAR, 0.43],
        ],
        ...[0.12, -0.78].map((x): V3[] =>
          outline([
            [x, NEAR, 1.14],
            [x + 0.26, NEAR, 1.14],
            [x + 0.26, NEAR, 1.19],
            [x, NEAR, 1.19],
          ]),
        ),
        // Creases: low along the doors, high along the bed side.
        [
          [-0.8, NEAR, 0.6],
          [1.05, NEAR, 0.62],
        ],
        // Ribbed bed floor, seen from above.
        ...Array.from({ length: 11 }, (_, i): V3[] => {
          const y = C - 0.7 + i * 0.14;
          return [
            [TAIL + 0.08, y, FLOOR],
            [BED_FRONT - 0.1, y, FLOOR],
          ];
        }),
      ],
    ),
    // Hood and the upper nose: shoulders rolling in, rounded off in plan towards the front.
    hull(
      'body',
      [
        ...both([
          [SCREEN, 0.89, 0.86],
          [SCREEN, 0.89, BELT - 0.11],
          [SCREEN, 0.78, BELT],
        ]),
        ...UPPER.flatMap(([x, h]) =>
          both([
            [x, h, 0.86],
            [x, h, hood(x) - 0.11],
            [x, h - 0.11, hood(x)],
          ]),
        ),
      ],
      [
        // Creases along the hood.
        ...[-1, 1].map((s): V3[] => [
          ...[1.52, NOSE_START, 2.25, 2.36, 2.4].map((x): V3 => [
            x,
            C + s * (0.6 - (0.17 * (x - 1.52)) / 0.88),
            hood(x),
          ]),
        ]),
        // Grille with its bars, and the headlights either side.
        onX(HOOD_END, [C - 0.3, C + 0.3], [0.9, 0.97]),
        ...[-1, 1].map((s) =>
          onX(HOOD_END, s < 0 ? [C - 0.48, C - 0.32] : [C + 0.32, C + 0.48], [0.91, 0.97]),
        ),
      ],
    ),
    // Front bumper below the nose, rounded the same way, with the grille, intake and fog lights.
    hull(
      'body',
      [
        ...both([
          [NOSE_START - 0.01, 0.89, 0.4],
          [NOSE_START - 0.01, 0.89, 0.86],
          [2.45, 0.6, 0.33],
        ]),
        ...TAPER.slice(1).flatMap(([x, h]) =>
          both([
            [x, h, x === NOSE ? 0.45 : 0.42],
            [x, h, 0.86],
          ]),
        ),
      ],
      [
        onX(NOSE, [C - 0.3, C + 0.3], [0.62, 0.86]),
        ...[0.68, 0.74, 0.8].map((z): V3[] => [
          [NOSE, C - 0.28, z],
          [NOSE, C + 0.28, z],
        ]),
        onX(NOSE, [C - 0.22, C + 0.22], [0.48, 0.56]),
        onX(NOSE, [C - 0.46, C - 0.36], [0.5, 0.56]),
        onX(NOSE, [C + 0.36, C + 0.46], [0.5, 0.56]),
      ],
    ),
    // Flares round both arches, on both sides.
    ...[
      [REAR, REAR_ARCH],
      [FRONT, FRONT_ARCH],
    ].flatMap(([x, r]) =>
      (
        [
          [0, SIDE[0]],
          [NEAR, W],
        ] as V2[]
      ).map((y) =>
        extrude('body', [...arc(x!, R, r! + 0.05, 172, 8), ...arc(x!, R, r!, 8, 172)], y),
      ),
    ),
    // The bed: side walls flush with the body, with the tail lamps and the bed crease; the
    // wheel-well humps, front wall and tailgate.
    box('bed', [TAIL, BED_FRONT], [SIDE[0], SIDE[0] + 0.07], [FLOOR, RAIL]),
    box(
      'bed',
      [TAIL, BED_FRONT],
      [NEAR - 0.07, NEAR],
      [FLOOR, RAIL],
      [
        [
          [-2.38, NEAR, 1.05],
          [-1.25, NEAR, 1.05],
          [-1.05, NEAR, 0.95],
        ],
        outline([
          [TAIL, NEAR, 1.24],
          [-2.52, NEAR, 1.24],
          [-2.4, NEAR, 1.04],
          [-2.45, NEAR, 0.97],
          [TAIL, NEAR, 0.97],
        ]),
      ],
    ),
    ...[
      [SIDE[0] + 0.07, C - 0.58],
      [C + 0.58, NEAR - 0.07],
    ].map(([y0, y1]) => box('bed', [-1.8, -1.08], [y0!, y1!], [FLOOR, FLOOR + 0.2])),
    box('bed', [BED_FRONT - 0.07, BED_FRONT], [SIDE[0] + 0.07, NEAR - 0.07], [FLOOR, RAIL]),
    box(
      'bed',
      [TAIL - 0.07, TAIL],
      SIDE,
      [0.78, RAIL],
      [
        onX(TAIL - 0.07, [SIDE[0] + 0.02, SIDE[0] + 0.14], [0.97, 1.24]),
        onX(TAIL - 0.07, [NEAR - 0.14, NEAR - 0.02], [0.97, 1.24]),
        onX(TAIL - 0.07, [C - 0.12, C + 0.12], [1.16, 1.2]),
      ],
    ),
    // Rear step bumper.
    box('body', [-2.68, -2.45], [C - 0.8, C + 0.8], [0.5, 0.78]),
    // Cab: glass leaning in from the belt to a narrower, crowned roof; raked windscreen.
    hull(
      'cab',
      [
        ...both([
          [CAB_BACK, glass(BELT), BELT],
          [SCREEN, glass(BELT), BELT],
          [CAB_BACK + 0.03, glass(1.76), 1.76],
          [0.58, glass(1.76), 1.76],
          [CAB_BACK + 0.07, 0.5, ROOF],
          [0.15, 0.5, ROOF],
        ]),
      ],
      [
        // Rear and front door glass, split by the pillar.
        outline([
          onGlass(-0.7, 1.34),
          onGlass(-0.03, 1.34),
          onGlass(-0.03, 1.7),
          onGlass(-0.76, 1.7),
          onGlass(-0.8, 1.5),
        ]),
        outline([
          onGlass(0.1, 1.34),
          onGlass(screen(1.34) - 0.12, 1.34),
          onGlass(screen(1.7) - 0.08, 1.7),
          onGlass(0.1, 1.7),
        ]),
        // Windscreen.
        outline([
          [screen(1.35), C - glass(1.35) + 0.1, 1.35],
          [screen(1.35), C + glass(1.35) - 0.1, 1.35],
          [screen(1.72), C + glass(1.72) - 0.08, 1.72],
          [screen(1.72), C - glass(1.72) + 0.08, 1.72],
        ]),
        // Rear window and the roof's creases.
        outline([
          [CAB_BACK + 0.008, C - 0.5, 1.4],
          [CAB_BACK + 0.008, C + 0.5, 1.4],
          [CAB_BACK + 0.026, C + 0.46, 1.68],
          [CAB_BACK + 0.026, C - 0.46, 1.68],
        ]),
        ...[-0.3, -0.12, 0.12, 0.3].map((dy): V3[] => [
          [-0.75, C + dy, ROOF],
          [0.1, C + dy * 0.85, ROOF],
        ]),
      ],
    ),
    // Mirrors on both front doors.
    box('cab', [0.86, 1.06], [NEAR - 0.02, NEAR + 0.15], [1.22, 1.38]),
    box('cab', [0.86, 1.06], [SIDE[0] - 0.15, SIDE[0] + 0.02], [1.22, 1.38]),
  );
