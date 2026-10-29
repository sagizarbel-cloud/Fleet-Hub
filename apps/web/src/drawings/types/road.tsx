import { box, metres, wheel } from '../iso';
import type { VehicleDrawingSource } from '../model';

// Road vehicles, in metres; +x is the front, +y the side facing the viewer, z up.

/** Three-axle tipper truck: cab over the front axle, steel body behind. */
export const truck: VehicleDrawingSource = {
  represents: 'truck',
  iso: metres([
    ...[2.6, -1.6, -2.9].map((x) => wheel('wheels', x, 0.5, 0.5, [0, 0.4])),
    box('body', [-3.8, 3.2], [0.4, 2.1], [0.6, 1.0]),
    box(
      'bed',
      [-3.8, 1.95],
      [0, 2.5],
      [1.0, 2.45],
      [-2.6, -1.1, 0.4].map((x) => [
        [x, 2.5, 1.15],
        [x, 2.5, 2.35],
      ]),
    ),
    {
      part: 'cab',
      profile: [
        [2.1, 0.9],
        [3.55, 0.9],
        [3.55, 1.8],
        [3.4, 3.0],
        [2.1, 3.1],
      ],
      y: [0.05, 2.45],
      decals: [
        [
          [2.35, 2.45, 2.0],
          [3.1, 2.45, 2.0],
          [3.1, 2.45, 2.85],
          [2.35, 2.45, 2.9],
        ],
        [
          [3.53, 0.25, 1.95],
          [3.42, 0.25, 2.85],
          [3.42, 2.25, 2.85],
          [3.53, 2.25, 1.95],
        ],
      ],
    },
    ...[2.6, -1.6, -2.9].map((x) => wheel('wheels', x, 0.5, 0.5, [2.1, 2.5])),
  ]),
};

/** Panel van: one long body with a sloped nose, sliding-door line and front side window. */
export const van: VehicleDrawingSource = {
  represents: 'van',
  iso: metres([
    wheel('wheels', -1.6, 0.36, 0.36, [0, 0.25]),
    wheel('wheels', 1.8, 0.36, 0.36, [0, 0.25]),
    {
      part: 'body',
      profile: [
        [-2.6, 0.35],
        [2.75, 0.35],
        [2.8, 1.1],
        [2.0, 1.4],
        [1.4, 2.45],
        [-2.6, 2.45],
      ],
      y: [0.05, 1.95],
      decals: [
        [
          [1.0, 1.95, 1.45],
          [1.75, 1.95, 1.45],
          [1.3, 1.95, 2.25],
          [1.0, 1.95, 2.25],
        ],
        [
          [0.85, 1.95, 0.45],
          [0.85, 1.95, 2.3],
        ],
        [
          [-0.6, 1.95, 0.45],
          [-0.6, 1.95, 2.3],
        ],
        [
          [1.95, 0.2, 1.5],
          [1.45, 0.2, 2.35],
          [1.45, 1.8, 2.35],
          [1.95, 1.8, 1.5],
        ],
      ],
    },
    wheel('wheels', -1.6, 0.36, 0.36, [1.75, 2.0]),
    wheel('wheels', 1.8, 0.36, 0.36, [1.75, 2.0]),
  ]),
};
