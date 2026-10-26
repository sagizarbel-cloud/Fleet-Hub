import { box, metres, wheel } from '../iso';
import type { VehicleDrawingSource } from '../model';

// A 20-tonne class wheel loader (bucket about 3 m wide, tyres about 1.75 m), in metres;
// +x is the front. Articulated frame: tall engine hood at the rear, cab in the middle,
// lift arms and bucket in front, carried just above the ground.
export const wheelLoader: VehicleDrawingSource = {
  represents: 'wheel_loader',
  iso: metres([
    wheel('wheels', -1.75, 0.87, 0.87, [0, 0.7]),
    wheel('wheels', 1.7, 0.87, 0.87, [0, 0.7]),
    {
      part: 'body',
      profile: [
        [-3.5, 0.95],
        [-0.7, 0.95],
        [-0.7, 2.45],
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
          [-1.0, 2.3, 1.6],
        ],
      ],
    },
    box('body', [-0.8, 2.3], [0.75, 2.05], [0.75, 1.55]),
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
    {
      part: 'boom',
      profile: [
        [0.2, 1.9],
        [0.7, 2.45],
        [3.35, 1.25],
        [3.1, 0.7],
      ],
      y: [0.85, 1.95],
    },
    {
      part: 'bucket',
      profile: [
        [3.0, 1.5],
        [3.6, 1.65],
        [4.35, 0.22],
        [3.5, 0.08],
        [3.0, 0.45],
      ],
      y: [-0.05, 2.85],
    },
    wheel('wheels', -1.75, 0.87, 0.87, [2.1, 2.8]),
    wheel('wheels', 1.7, 0.87, 0.87, [2.1, 2.8]),
  ]),
};
