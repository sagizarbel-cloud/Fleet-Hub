import { box, metres, track, wheel, type Solid } from '../iso';
import { topView } from '../derive';
import type { VehicleDrawingSource } from '../model';

// A 30-tonne class excavator (overall width about 3.2 m), in metres; +x is the front,
// +y the side facing the viewer, z up. The arm is out in front with the bucket on the ground.

/** Arm out in front, bucket on the ground (isometric and side views). */
function digArm(z: number, mid: number): Solid[] {
  return [
    {
      part: 'boom',
      profile: [
        [0.9, z + 0.5],
        [1.6, z + 0.4],
        [3.8, z + 2.3],
        [5.9, z + 1.3],
        [6.0, z + 1.75],
        [3.7, z + 2.9],
        [0.9, z + 1.2],
      ],
      y: [mid - 0.35, mid + 0.35],
      decals: [
        [
          [1.5, mid + 0.35, z + 0.9],
          [3.1, mid + 0.35, z + 2.2],
        ],
      ],
    },
    {
      part: 'boom',
      profile: [
        [5.65, z + 1.9],
        [6.1, z + 2.0],
        [6.75, 0.8],
        [6.35, 0.6],
      ],
      y: [mid - 0.25, mid + 0.25],
    },
    {
      part: 'bucket',
      profile: [
        [6.2, 1.0],
        [6.95, 0.9],
        [7.25, 0.2],
        [6.95, 0.0],
        [6.35, 0.25],
      ],
      y: [mid - 0.6, mid + 0.6],
    },
  ];
}

/** Arm folded in, as parked: keeps the top view compact enough for a grid tile. */
function foldedArm(z: number, mid: number): Solid[] {
  return [
    {
      part: 'boom',
      profile: [
        [0.9, z + 0.5],
        [1.6, z + 0.4],
        [3.0, z + 2.2],
        [3.95, z + 1.5],
        [4.15, z + 1.85],
        [2.95, z + 2.8],
        [0.9, z + 1.2],
      ],
      y: [mid - 0.35, mid + 0.35],
    },
    {
      part: 'boom',
      profile: [
        [3.75, z + 1.95],
        [4.2, z + 1.85],
        [3.7, 0.75],
        [3.3, 0.85],
      ],
      y: [mid - 0.25, mid + 0.25],
    },
    {
      part: 'bucket',
      profile: [
        [2.9, 0.9],
        [3.75, 0.95],
        [3.85, 0.3],
        [3.4, 0.05],
        [2.9, 0.35],
      ],
      y: [mid - 0.6, mid + 0.6],
    },
  ];
}

/** Upper structure: house, counterweight, engine cover, cab on the near front corner, and the arm. */
function upper(z: number, w: number, folded = false): Solid[] {
  const mid = w / 2;
  return [
    box('body', [-1.9, 1.3], [0.1, w - 0.1], [z, z + 1.1]),
    {
      part: 'body',
      profile: [
        [-2.5, z],
        [-1.6, z],
        [-1.6, z + 1.25],
        [-2.3, z + 1.2],
        [-2.5, z + 0.9],
      ],
      y: [0.1, w - 0.1],
    },
    box(
      'body',
      [-1.8, -0.2],
      [0.2, w - 1.2],
      [z + 1.1, z + 1.4],
      [
        [
          [-1.6, 0.4, z + 1.4],
          [-0.4, 0.4, z + 1.4],
          [-0.4, w - 1.4, z + 1.4],
          [-1.6, w - 1.4, z + 1.4],
        ],
      ],
    ),
    {
      part: 'cab',
      profile: [
        [0.1, z + 1.1],
        [1.3, z + 1.1],
        [1.15, z + 2.05],
        [0.1, z + 2.05],
      ],
      y: [w - 1.1, w - 0.1],
      decals: [
        [
          [0.25, w - 0.1, z + 1.35],
          [1.15, w - 0.1, z + 1.35],
          [1.03, w - 0.1, z + 1.9],
          [0.25, w - 0.1, z + 1.9],
        ],
        [
          [1.28, w - 1.0, z + 1.25],
          [1.16, w - 1.0, z + 1.95],
          [1.16, w - 0.2, z + 1.95],
          [1.28, w - 0.2, z + 1.25],
        ],
      ],
    },
    ...(folded ? foldedArm(z, mid) : digArm(z, mid)),
  ];
}

const crawler = (folded: boolean) =>
  metres([
    track('tracks', [-2.4, 2.4], 1.0, [0, 0.65]),
    box('body', [-1.2, 1.2], [0.65, 2.55], [0.45, 1.05]),
    ...upper(1.1, 3.2, folded),
    track('tracks', [-2.4, 2.4], 1.0, [2.55, 3.2]),
  ]);

export const trackedExcavator: VehicleDrawingSource = {
  represents: 'tracked_excavator',
  iso: crawler(false),
  top: topView(crawler(true)),
};

const wheeled = (folded: boolean) =>
  metres([
    wheel('wheels', -1.35, 0.55, 0.55, [0, 0.5]),
    wheel('wheels', 1.35, 0.55, 0.55, [0, 0.5]),
    box('body', [-2.0, 2.0], [0.4, 2.1], [0.6, 1.2]),
    // Dozer blade at the front.
    {
      part: 'bucket',
      profile: [
        [2.1, 0.1],
        [2.35, 0.1],
        [2.4, 0.85],
        [2.2, 0.85],
      ],
      y: [0, 2.5],
    },
    ...upper(1.25, 2.5, folded),
    wheel('wheels', -1.35, 0.55, 0.55, [2.0, 2.5]),
    wheel('wheels', 1.35, 0.55, 0.55, [2.0, 2.5]),
  ]);

export const wheeledExcavator: VehicleDrawingSource = {
  represents: 'wheeled_excavator',
  iso: wheeled(false),
  top: topView(wheeled(true)),
};
