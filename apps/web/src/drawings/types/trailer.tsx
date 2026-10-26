import { box, metres, wheel } from '../iso';
import type { VehicleDrawingSource } from '../model';

// A tandem-axle plant trailer, in metres; +x is the drawbar end. Flat deck with ramps at the rear.
export const trailer: VehicleDrawingSource = {
  iso: metres([
    wheel('wheels', -2.3, 0.4, 0.4, [0.15, 0.5]),
    wheel('wheels', -1.3, 0.4, 0.4, [0.15, 0.5]),
    {
      part: 'bed',
      profile: [
        [-3.4, 0.85],
        [2.8, 0.85],
        [2.8, 1.1],
        [-3.4, 1.1],
      ],
      y: [0, 2.5],
      decals: [-2.2, -1.0, 0.2, 1.4].map((x) => [
        [x, 0.15, 1.1],
        [x, 2.35, 1.1],
      ]),
    },
    {
      part: 'body',
      profile: [
        [2.8, 0.75],
        [2.8, 1.05],
        [4.6, 0.75],
        [4.6, 0.6],
      ],
      y: [1.05, 1.45],
    },
    box('body', [4.5, 4.8], [1.0, 1.5], [0.5, 0.75]),
    ...[0.2, 1.75].map((y0) => ({
      part: 'bed' as const,
      profile: [
        [-3.4, 0.85],
        [-3.4, 1.1],
        [-4.7, 0.05],
        [-4.45, 0.0],
      ] as const,
      y: [y0, y0 + 0.55] as const,
    })),
    wheel('wheels', -2.3, 0.4, 0.4, [2.0, 2.35]),
    wheel('wheels', -1.3, 0.4, 0.4, [2.0, 2.35]),
  ]),
};
