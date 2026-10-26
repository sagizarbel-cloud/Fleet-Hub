import { box, metres, wheel } from '../iso';
import type { VehicleDrawingSource } from '../model';

// An enclosed, caravan-like equipment trailer on two axles, in metres; +x is the drawbar end.
const W = 2.1;

export const trailer: VehicleDrawingSource = {
  iso: metres([
    wheel('wheels', -0.55, 0.33, 0.33, [-0.2, 0.02]),
    wheel('wheels', 0.35, 0.33, 0.33, [-0.2, 0.02]),
    {
      part: 'body',
      profile: [
        [-2.4, 0.5],
        [2.2, 0.5],
        [2.35, 0.85],
        [2.35, 2.0],
        [2.1, 2.35],
        [-2.3, 2.35],
        [-2.4, 2.25],
      ],
      y: [0, W],
      decals: [
        // Side door, small window and a stripe along the near side.
        [
          [-0.95, W, 0.65],
          [-0.15, W, 0.65],
          [-0.15, W, 2.1],
          [-0.95, W, 2.1],
        ],
        [
          [0.6, W, 1.55],
          [1.6, W, 1.55],
          [1.6, W, 2.0],
          [0.6, W, 2.0],
        ],
        [
          [-2.4, W, 0.9],
          [-1.1, W, 0.9],
        ],
        [
          [0.0, W, 0.9],
          [2.3, W, 0.9],
        ],
        // Roof seams.
        ...[-1.2, 0, 1.2].map(
          (x) =>
            [
              [x, 0.1, 2.35],
              [x, W - 0.1, 2.35],
            ] as const,
        ),
      ],
    },
    // Wheel arch fender on the near side.
    box('body', [-1.0, 0.8], [W, W + 0.12], [0.62, 0.72]),
    {
      part: 'body',
      profile: [
        [2.3, 0.55],
        [2.3, 0.8],
        [3.5, 0.5],
        [3.5, 0.4],
      ],
      y: [W / 2 - 0.25, W / 2 + 0.25],
    },
    wheel('wheels', 3.15, 0.12, 0.12, [W / 2 - 0.05, W / 2 + 0.05]),
    wheel('wheels', -0.55, 0.33, 0.33, [W - 0.02, W + 0.2]),
    wheel('wheels', 0.35, 0.33, 0.33, [W - 0.02, W + 0.2]),
  ]),
};
