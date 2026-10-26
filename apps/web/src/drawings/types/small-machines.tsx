import { box, metres, wheel } from '../iso';
import type { VehicleDrawingSource } from '../model';

// Smaller machines, in metres; +x is the front, +y the side facing the viewer, z up.

/** Skid-steer loader: compact body, cab between the lift arms, bucket on the ground. */
export const skidSteer: VehicleDrawingSource = {
  represents: 'skid_steer',
  iso: metres([
    wheel('wheels', -0.55, 0.38, 0.38, [0, 0.3]),
    wheel('wheels', 0.55, 0.38, 0.38, [0, 0.3]),
    ...[0.2, 1.45].map((y0) => ({
      part: 'boom' as const,
      // Lift arm: pivots high at the rear, runs past the cab, then drops to the bucket.
      profile: [
        [-1.1, 1.4],
        [-0.9, 1.7],
        [0.85, 1.6],
        [1.3, 0.75],
        [1.08, 0.62],
        [0.68, 1.38],
        [-0.95, 1.25],
      ] as const,
      y: [y0, y0 + 0.15] as const,
    })),
    {
      part: 'body',
      profile: [
        [-1.2, 0.35],
        [0.9, 0.35],
        [0.9, 1.0],
        [-1.2, 1.3],
      ],
      y: [0.35, 1.45],
    },
    {
      part: 'cab',
      profile: [
        [-0.65, 1.0],
        [0.6, 1.0],
        [0.55, 2.0],
        [-0.65, 2.0],
      ],
      y: [0.4, 1.4],
      decals: [
        [
          [-0.45, 1.4, 1.15],
          [0.4, 1.4, 1.15],
          [0.36, 1.4, 1.85],
          [-0.45, 1.4, 1.85],
        ],
      ],
    },
    {
      part: 'bucket',
      profile: [
        [1.05, 0.65],
        [1.35, 0.7],
        [1.85, 0.05],
        [1.15, 0.0],
      ],
      y: [-0.05, 1.85],
    },
    wheel('wheels', -0.55, 0.38, 0.38, [1.5, 1.8]),
    wheel('wheels', 0.55, 0.38, 0.38, [1.5, 1.8]),
  ]),
};

/** Farm tractor: big rear wheels, small front wheels, long hood, cab over the rear axle. */
export const tractor: VehicleDrawingSource = {
  represents: 'tractor',
  iso: metres([
    wheel('wheels', -1.0, 0.8, 0.8, [0, 0.5]),
    wheel('wheels', 1.3, 0.5, 0.5, [0.3, 0.6]),
    box('body', [-1.4, 2.0], [0.7, 1.5], [0.5, 1.0]),
    box(
      'body',
      [-0.3, 2.05],
      [0.7, 1.5],
      [1.0, 1.6],
      [
        [
          [2.05, 0.8, 1.1],
          [2.05, 1.4, 1.1],
          [2.05, 1.4, 1.5],
          [2.05, 0.8, 1.5],
        ],
      ],
    ),
    {
      part: 'cab',
      profile: [
        [-1.55, 1.0],
        [-0.2, 1.0],
        [-0.35, 2.75],
        [-1.45, 2.75],
      ],
      y: [0.55, 1.65],
      decals: [
        [
          [-1.35, 1.65, 1.6],
          [-0.35, 1.65, 1.6],
          [-0.47, 1.65, 2.6],
          [-1.3, 1.65, 2.6],
        ],
      ],
    },
    box('cab', [-1.7, -0.1], [0.45, 1.75], [2.75, 2.85]),
    wheel('wheels', -1.0, 0.8, 0.8, [1.7, 2.2]),
    wheel('wheels', 1.3, 0.5, 0.5, [1.6, 1.9]),
  ]),
};

/** Counterbalance forklift: weight at the rear, overhead guard, mast and forks in front. */
export const forklift: VehicleDrawingSource = {
  represents: 'forklift',
  iso: metres([
    wheel('wheels', -0.9, 0.28, 0.28, [0, 0.2]),
    wheel('wheels', 0.5, 0.33, 0.33, [0, 0.22]),
    {
      part: 'body',
      profile: [
        [-1.4, 0.25],
        [0.8, 0.25],
        [0.8, 0.85],
        [-0.55, 0.95],
        [-1.4, 1.25],
      ],
      y: [0.12, 1.03],
    },
    ...[
      [-0.72, 0.12],
      [0.5, 0.12],
      [-0.72, 0.95],
      [0.5, 0.95],
    ].map(([x, y]) => box('cab', [x!, x! + 0.08], [y!, y! + 0.08], [0.9, 2.0])),
    box('cab', [-0.75, 0.6], [0.1, 1.05], [2.0, 2.07]),
    box('mast', [0.85, 0.95], [0.2, 0.95], [0.1, 2.3]),
    box('mast', [0.95, 1.0], [0.2, 0.95], [0.05, 1.0]),
    box('mast', [1.0, 2.1], [0.3, 0.42], [0.05, 0.11]),
    box('mast', [1.0, 2.1], [0.73, 0.85], [0.05, 0.11]),
    wheel('wheels', -0.9, 0.28, 0.28, [0.95, 1.15]),
    wheel('wheels', 0.5, 0.33, 0.33, [0.93, 1.15]),
  ]),
};

/** Mobile compressor: housing on one axle with a drawbar. */
export const compressor: VehicleDrawingSource = {
  represents: 'compressor',
  iso: metres([
    wheel('wheels', -0.2, 0.36, 0.36, [-0.22, 0]),
    {
      part: 'body',
      profile: [
        [-1.2, 0.45],
        [1.2, 0.45],
        [1.2, 1.4],
        [1.0, 1.6],
        [-1.0, 1.6],
        [-1.2, 1.4],
      ],
      y: [0, 1.6],
      decals: [
        [
          [-0.9, 1.6, 0.7],
          [0.9, 1.6, 0.7],
          [0.9, 1.6, 1.3],
          [-0.9, 1.6, 1.3],
        ],
        ...[-0.5, 0, 0.5].map(
          (x) =>
            [
              [x, 1.6, 0.8],
              [x, 1.6, 1.2],
            ] as const,
        ),
      ],
    },
    {
      part: 'body',
      profile: [
        [1.2, 0.5],
        [1.2, 0.7],
        [2.3, 0.45],
        [2.3, 0.35],
      ],
      y: [0.65, 0.95],
    },
    wheel('wheels', -0.2, 0.36, 0.36, [1.6, 1.82]),
  ]),
};

/**
 * Generic equipment, for "other" and for any type without a drawing of its own: a plain crate
 * on skids, so it never looks like a specific machine it isn't.
 */
export const other: VehicleDrawingSource = {
  represents: 'other',
  iso: metres([
    box('body', [-1.1, -0.9], [0.1, 1.5], [0, 0.18]),
    box('body', [0.9, 1.1], [0.1, 1.5], [0, 0.18]),
    box(
      'body',
      [-1.2, 1.2],
      [0, 1.6],
      [0.18, 1.5],
      [
        ...[0.6, 1.05].map(
          (z) =>
            [
              [-1.2, 1.6, z],
              [1.2, 1.6, z],
            ] as const,
        ),
        [
          [-0.4, 1.6, 0.18],
          [-0.4, 1.6, 1.5],
        ],
        [
          [0.4, 1.6, 0.18],
          [0.4, 1.6, 1.5],
        ],
      ],
    ),
  ]),
};
