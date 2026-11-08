import { box, cylinder, extrude, model, wheel, type V2, type V3 } from '../kit';

/**
 * Counterbalance forklift, in metres (+x front, +y the near side, z up). Body with wheel arches
 * and a rounded counterweight, overhead guard on raked front posts, seat and steering wheel,
 * a two-rail mast with its lift ram and chains, the carriage with its backrest, and L-shaped
 * forks.
 */

const arc = (cx: number, cz: number, r: number, from: number, to: number, n = 8): V2[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = ((from + ((to - from) * i) / n) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cz + r * Math.sin(a)] as const;
  });

const outline = (pts: V3[]): V3[] => [...pts, pts[0]!];

const RX = -0.9;
const RR = 0.28;
const FX = 0.5;
const FR = 0.33;

export const forklift3d = () =>
  model(
    wheel('wheels', RX, RR, RR, [0.03, 0.21]),
    wheel('wheels', RX, RR, RR, [0.94, 1.12]),
    wheel('wheels', FX, FR, FR, [0, 0.24]),
    wheel('wheels', FX, FR, FR, [0.91, 1.15]),
    // Body: arches over both axles, the dash in front of the seat, a rounded counterweight.
    extrude(
      'body',
      [
        [-1.48, 0.25],
        [-1.225, 0.25],
        ...arc(RX, RR, 0.33, 170, 10),
        [-0.575, 0.25],
        [0.126, 0.25],
        ...arc(FX, FR, 0.38, 170, 30),
        [0.88, 0.52],
        [0.88, 0.85],
        [0.2, 0.9],
        [-0.55, 0.95],
        [-0.85, 1.2],
        ...arc(-1.2, 0.95, 0.3, 90, 200),
      ],
      [0.14, 1.01],
      [
        // Step plate edge and the counterweight seam on the near side.
        [
          [-0.55, 1.01, 0.62],
          [0.08, 1.01, 0.62],
        ],
        [
          [-0.85, 1.01, 0.55],
          [-0.85, 1.01, 1.18],
        ],
      ],
    ),
    // Rear lights on the counterweight and the tow pin at the back.
    ...[0.18, 0.83].map((y) =>
      box(
        'body',
        [-1.3, -1.18],
        [y, y + 0.14],
        [1.2, 1.28],
        [
          outline([
            [-1.18, y + 0.02, 1.21],
            [-1.18, y + 0.12, 1.21],
            [-1.18, y + 0.12, 1.27],
            [-1.18, y + 0.02, 1.27],
          ]),
        ],
      ),
    ),
    box('body', [-1.58, -1.48], [0.5, 0.65], [0.48, 0.64]),
    cylinder('body', 'z', [0.64, 0.7], [-1.53, 0.575], 0.03),
    // Overhead guard: upright rear posts, raked front posts, a frame with slats.
    ...[0.14, 0.93].flatMap((y) => [
      box('cab', [-0.76, -0.68], [y, y + 0.08], [0.95, 2.0]),
      extrude(
        'cab',
        [
          [0.45, 0.88],
          [0.54, 0.88],
          [0.42, 2.0],
          [0.33, 2.0],
        ],
        [y, y + 0.08],
      ),
    ]),
    box('cab', [-0.8, 0.46], [0.12, 0.2], [2.0, 2.07]),
    box('cab', [-0.8, 0.46], [0.95, 1.03], [2.0, 2.07]),
    box('cab', [-0.8, -0.72], [0.2, 0.95], [2.0, 2.07]),
    box('cab', [0.38, 0.46], [0.2, 0.95], [2.0, 2.07]),
    ...[-0.5, -0.22, 0.06].map((x) => box('cab', [x, x + 0.08], [0.2, 0.95], [2.01, 2.06])),
    // Seat with a raked backrest, steering column and wheel.
    box('cab', [-0.62, -0.15], [0.35, 0.8], [0.93, 1.05]),
    extrude(
      'cab',
      [
        [-0.68, 1.0],
        [-0.56, 1.0],
        [-0.6, 1.5],
        [-0.74, 1.5],
      ],
      [0.35, 0.8],
    ),
    extrude(
      'cab',
      [
        [0.2, 0.88],
        [0.28, 0.88],
        [0.13, 1.32],
        [0.06, 1.32],
      ],
      [0.53, 0.62],
    ),
    cylinder('cab', 'z', [1.32, 1.36], [0.09, 0.575], 0.16),
    // Mast: outer rails, crossbars, the lift ram between them and the two chains.
    box('mast', [0.9, 1.03], [0.2, 0.32], [0.1, 2.3]),
    box('mast', [0.9, 1.03], [0.83, 0.95], [0.1, 2.3]),
    ...[0.6, 1.5, 2.2].map((z) => box('mast', [0.92, 1.0], [0.32, 0.83], [z, z + 0.08])),
    cylinder('mast', 'z', [0.2, 1.95], [0.96, 0.575], 0.05),
    cylinder('mast', 'z', [1.95, 2.0], [0.96, 0.575], 0.035),
    box('mast', [1.03, 1.05], [0.4, 0.44], [0.95, 2.2]),
    box('mast', [1.03, 1.05], [0.71, 0.75], [0.95, 2.2]),
    // Carriage plate and the load backrest above it.
    box('mast', [1.04, 1.09], [0.15, 1.0], [0.12, 0.55]),
    ...[0.15, 0.37, 0.555, 0.74, 0.96].map((y) =>
      box('mast', [1.05, 1.08], [y, y + 0.04], [0.55, 1.42]),
    ),
    box('mast', [1.05, 1.08], [0.15, 1.0], [1.4, 1.46]),
    // Forks: an upright heel and a long tine with a thin tip.
    ...[
      [0.3, 0.42],
      [0.73, 0.85],
    ].map(([y0, y1]) =>
      extrude(
        'mast',
        [
          [1.09, 0.04],
          [2.2, 0.04],
          [2.2, 0.07],
          [1.15, 0.1],
          [1.15, 0.62],
          [1.09, 0.62],
        ],
        [y0!, y1!],
      ),
    ),
  );
