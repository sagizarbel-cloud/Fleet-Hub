import { box, fender, metres, wheel, type P3 } from '../iso';
import type { VehicleDrawingSource } from '../model';

// Road vehicles, in metres; +x is the front, +y the side facing the viewer, z up.

/**
 * Three-axle tipper truck: cab over the front axle, steel body behind. Details: headboard over
 * the cab, exhaust stack, fuel tank, mirror, grille and headlights, door, mudguards and the
 * tipping ram.
 */
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
      [-2.6, -1.1, 0.4].map((x): P3[] => [
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
        // Door outline and handle.
        [
          [2.25, 2.45, 0.95],
          [3.3, 2.45, 0.95],
          [3.3, 2.45, 2.9],
          [2.25, 2.45, 2.95],
        ],
        [
          [2.4, 2.45, 1.75],
          [2.6, 2.45, 1.75],
        ],
        // Grille slats and headlights on the front.
        ...[1.15, 1.3, 1.45, 1.6].map((z): P3[] => [
          [3.55, 0.6, z],
          [3.55, 1.9, z],
        ]),
        [
          [3.55, 0.15, 1.05],
          [3.55, 0.45, 1.05],
          [3.55, 0.45, 1.25],
          [3.55, 0.15, 1.25],
        ],
        [
          [3.55, 2.05, 1.05],
          [3.55, 2.35, 1.05],
          [3.55, 2.35, 1.25],
          [3.55, 2.05, 1.25],
        ],
      ],
    },
    // Headboard: the body's front wall rises to guard the back of the cab.
    box('bed', [1.75, 1.95], [0, 2.5], [2.45, 3.0]),
    // Tipping ram between the chassis and the front of the body.
    box('body', [1.4, 1.6], [1.1, 1.4], [0.95, 1.05]),
    // Fuel tank with its straps, between the front and middle axles.
    box(
      'body',
      [0.2, 1.4],
      [2.05, 2.4],
      [0.5, 0.95],
      [
        [
          [0.45, 2.4, 0.5],
          [0.45, 2.4, 0.95],
        ],
        [
          [1.15, 2.4, 0.5],
          [1.15, 2.4, 0.95],
        ],
      ],
    ),
    // Exhaust stack behind the cab.
    box('body', [1.95, 2.08], [2.2, 2.33], [1.0, 3.35]),
    // Mirror arm and mirror ahead of the door.
    box('cab', [3.45, 3.55], [2.45, 2.75], [2.35, 2.42]),
    box('cab', [3.45, 3.55], [2.68, 2.78], [2.0, 2.55]),
    fender('body', 2.6, 0.5, 0.58, [2.05, 2.55], [35, 145]),
    box('body', [-3.5, -1.0], [2.05, 2.55], [1.02, 1.08]),
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
