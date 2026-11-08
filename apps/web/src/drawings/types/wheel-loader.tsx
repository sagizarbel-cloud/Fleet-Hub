import { box, fender, metres, wheel, type P3, type Solid } from '../iso';
import type { VehicleDrawingSource } from '../model';

// A 20-tonne class wheel loader (bucket about 3 m wide, tyres about 1.75 m), in metres;
// +x is the front. Articulated frame: tall engine hood at the rear, cab in the middle,
// lift arms and bucket in front, carried just above the ground. Details: mudguards, exhaust
// stack and air pre-cleaner on the hood, rear bumper, ladder up to the cab, lift rams, roof beacon and work
// lights, the bucket's teeth and the tilt linkage.
export const wheelLoader: VehicleDrawingSource = {
  represents: 'wheel_loader',
  iso: metres([
    wheel('wheels', -1.75, 0.87, 0.87, [0, 0.7]),
    wheel('wheels', 1.7, 0.87, 0.87, [0, 0.7]),
    fender('body', -1.75, 0.87, 0.95, [-0.05, 0.75], [15, 125]),
    fender('body', 1.7, 0.87, 0.95, [-0.05, 0.75], [20, 160]),
    {
      part: 'body',
      profile: [
        // The engine case stops at the back of the cab above the frame.
        [-3.5, 0.95],
        [-0.7, 0.95],
        [-0.7, 1.5],
        [-1.35, 1.5],
        [-1.35, 2.42],
        [-3.1, 2.35],
        [-3.5, 2.0],
      ],
      y: [0.5, 2.3],
      decals: [
        [
          [-3.3, 2.3, 1.15],
          [-2.5, 2.3, 1.15],
          [-2.5, 2.3, 2.1],
          [-3.25, 2.3, 2.05],
        ],
        [
          [-2.3, 2.3, 1.3],
          [-1.0, 2.3, 1.3],
        ],
        [
          [-2.3, 2.3, 1.6],
          [-1.45, 2.3, 1.6],
        ],
      ],
    },
    box('body', [-0.8, 2.3], [0.75, 2.05], [0.75, 1.55]),
    // Rear bumper and counterweight, a little wider than the hood.
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
    // Exhaust stack and air pre-cleaner standing on the hood.
    box('body', [-2.75, -2.6], [1.0, 1.15], [2.35, 2.85]),
    box('body', [-1.95, -1.7], [1.55, 1.8], [2.4, 2.7]),
    // Ladder up to the cab door on the near side, between the wheels.
    {
      ...box(
        'body',
        [-0.7, -0.3],
        [2.3, 2.45],
        [0.4, 1.5],
        [0.7, 0.95, 1.2].map((z): P3[] => [
          [-0.7, 2.45, z],
          [-0.3, 2.45, z],
        ]),
      ),
      layer: 2,
    },
    // Lift rams from the frame up to the arms, one inside each arm.
    ...[
      [1.2, 1.32],
      [1.48, 1.6],
    ].map(([y0, y1]): Solid => ({
      part: 'boom',
      layer: 1,
      profile: [
        [0.0, 1.0],
        [1.6, 1.55],
        [1.6, 1.75],
        [0.0, 1.2],
      ],
      y: [y0!, y1!],
    })),
    {
      part: 'cab',
      profile: [
        [-1.35, 1.5],
        [0.45, 1.5],
        [0.3, 3.6],
        [-1.25, 3.6],
      ],
      y: [0.6, 2.2],
      decals: [
        [
          [-1.15, 2.2, 2.25],
          [0.3, 2.2, 2.25],
          [0.2, 2.2, 3.45],
          [-1.1, 2.2, 3.45],
        ],
        [
          [0.41, 0.75, 2.1],
          [0.31, 0.75, 3.45],
          [0.31, 2.05, 3.45],
          [0.41, 2.05, 2.1],
        ],
      ],
    },
    box('cab', [-1.45, 0.55], [0.5, 2.3], [3.6, 3.7]),
    // Roof beacon and a work light at each front corner.
    box('cab', [-0.65, -0.4], [1.3, 1.55], [3.7, 3.9]),
    box('cab', [0.3, 0.5], [0.55, 0.75], [3.7, 3.82]),
    box('cab', [0.3, 0.5], [2.05, 2.25], [3.7, 3.82]),
    // Two lift arms, with the rams showing between them from above.
    ...[
      [0.85, 1.2],
      [1.6, 1.95],
    ].map(([y0, y1]): Solid => ({
      part: 'boom',
      layer: 1,
      profile: [
        [0.2, 1.9],
        [0.7, 2.45],
        [3.35, 1.25],
        [3.1, 0.7],
      ],
      y: [y0!, y1!],
    })),
    {
      part: 'bucket',
      layer: 3,
      profile: [
        [3.0, 1.5],
        [3.6, 1.65],
        [4.35, 0.22],
        [3.5, 0.08],
        [3.0, 0.45],
      ],
      y: [-0.05, 2.85],
    },
    // Teeth along the cutting edge.
    ...[0.2, 0.7, 1.2, 1.7, 2.2].map((y): Solid => ({
      part: 'bucket',
      layer: 3,
      profile: [
        [4.15, 0.1],
        [4.6, 0.12],
        [4.25, 0.33],
      ],
      y: [y, y + 0.22],
    })),
    // Tilt linkage: a lever across the arms, with its ram back to the frame.
    { ...box('boom', [1.75, 1.95], [0.85, 1.95], [1.55, 2.05]), layer: 1 },
    {
      part: 'boom',
      layer: 1,
      profile: [
        [0.55, 1.45],
        [1.8, 1.85],
        [1.8, 2.0],
        [0.55, 1.6],
      ],
      y: [1.34, 1.46],
    },
    // Near-side wheels and mudguards cover the arms; the bucket, out in front, covers them.
    ...[
      fender('body', -1.75, 0.87, 0.95, [2.05, 2.85], [15, 125]),
      fender('body', 1.7, 0.87, 0.95, [2.05, 2.85], [20, 160]),
      wheel('wheels', -1.75, 0.87, 0.87, [2.1, 2.8]),
      wheel('wheels', 1.7, 0.87, 0.87, [2.1, 2.8]),
    ].map((solid) => ({ ...solid, layer: 2 })),
  ]),
};
