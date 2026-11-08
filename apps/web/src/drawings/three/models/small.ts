import * as THREE from 'three';
import { box, cylinder, extrude, model, ram, wheel, type V2, type V3 } from '../kit';
import type { PartName } from '../../model';

/**
 * The van, trailer, skid steer, compressor and the generic crate, in metres (+x front, +y the
 * near side, z up).
 */

const arc = (cx: number, cz: number, r: number, from: number, to: number, n = 8): V2[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = ((from + ((to - from) * i) / n) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cz + r * Math.sin(a)] as const;
  });

/** A wheel arch over a tyre centred at (cx, cz), meeting the sill at height `sill`. */
const arch = (cx: number, cz: number, r: number, sill: number): V2[] => {
  const a0 = (Math.asin((sill - cz) / r) * 180) / Math.PI;
  return arc(cx, cz, r, 180 - a0, a0, 10);
};

const outline = (pts: V3[]): V3[] => [...pts, pts[0]!];

/** A rectangle on a face of constant x. */
const onX = (x: number, [y0, y1]: V2, [z0, z1]: V2): V3[] =>
  outline([
    [x, y0, z0],
    [x, y1, z0],
    [x, y1, z1],
    [x, y0, z1],
  ]);

/** A rectangle on a face of constant y. */
const onY = (y: number, [x0, x1]: V2, [z0, z1]: V2): V3[] =>
  outline([
    [x0, y, z0],
    [x1, y, z0],
    [x1, y, z1],
    [x0, y, z1],
  ]);

/** A straight bar between two points in the x-y plane at height z0..z1. */
function bar(part: PartName, [ax, ay]: V2, [bx, by]: V2, w: number, [z0, z1]: V2) {
  const len = Math.hypot(bx - ax, by - ay);
  const mesh = box(part, [-len / 2, len / 2], [-w / 2, w / 2], [z0, z1]);
  mesh.position.set((ax + bx) / 2, (ay + by) / 2, (z0 + z1) / 2);
  mesh.rotation.z = Math.atan2(by - ay, bx - ax);
  return mesh;
}

/** A mudguard bent round a tyre. */
const fender = (cx: number, cz: number, r: number, y: V2, from: number, to: number, t = 0.05) =>
  extrude('body', [...arc(cx, cz, r + t, from, to, 6), ...arc(cx, cz, r, to, from, 6)], y);

/** Panel van: wheel arches, sloped nose, sliding side door, roof rails and split rear doors. */
export const van3d = () => {
  const Y = 1.95;
  const z = (x0: number, z0: number, x1: number, z1: number) => (zz: number) =>
    x0 + ((x1 - x0) * (zz - z0)) / (z1 - z0);
  const screen = z(2.0, 1.4, 1.4, 2.4);
  return model(
    ...[-1.6, 1.8].flatMap((x) => [
      wheel('wheels', x, 0.36, 0.36, [0, 0.25]),
      wheel('wheels', x, 0.36, 0.36, [1.75, 2.0]),
    ]),
    extrude(
      'body',
      [
        [-2.6, 0.35],
        ...arch(-1.6, 0.36, 0.42, 0.35),
        ...arch(1.8, 0.36, 0.42, 0.35),
        [2.75, 0.35],
        [2.8, 1.1],
        [2.0, 1.4],
        [1.4, 2.4],
        [1.3, 2.45],
        [-2.5, 2.45],
        [-2.6, 2.35],
      ],
      [0.05, Y],
      [
        // Front door with its window, sliding door on its rail, handles.
        outline([
          [0.85, Y, 0.45],
          [2.1, Y, 0.45],
          [2.0, Y, 1.4],
          [1.42, Y, 2.35],
          [0.85, Y, 2.35],
        ]),
        outline([
          [1.0, Y, 1.45],
          [1.88, Y, 1.45],
          [1.38, Y, 2.25],
          [1.0, Y, 2.25],
        ]),
        onY(Y, [-0.75, 0.75], [0.45, 2.3]),
        [
          [-2.4, Y, 1.75],
          [-0.75, Y, 1.75],
        ],
        [
          [1.05, Y, 1.25],
          [1.25, Y, 1.25],
        ],
        [
          [0.55, Y, 1.25],
          [0.55, Y, 1.05],
        ],
        // Windscreen, grille and headlights.
        outline([
          [screen(1.5), 0.2, 1.5],
          [screen(1.5), 1.8, 1.5],
          [screen(2.35), 1.8, 2.35],
          [screen(2.35), 0.2, 2.35],
        ]),
        ...[0.6, 0.72].map((zz): V3[] => [
          [2.75 + 0.05 * ((zz - 0.35) / 0.75), 0.6, zz],
          [2.75 + 0.05 * ((zz - 0.35) / 0.75), 1.4, zz],
        ]),
        ...[
          [0.15, 0.5],
          [1.5, 1.85],
        ].map(([y0, y1]) => onX(2.79, [y0!, y1!], [0.86, 1.0])),
        // Rear doors and tail lights.
        [
          [-2.6, 1.0, 0.4],
          [-2.6, 1.0, 2.3],
        ],
        onX(-2.6, [0.12, 0.3], [0.9, 1.4]),
        onX(-2.6, [1.7, 1.88], [0.9, 1.4]),
      ],
    ),
    // Bumpers and the mirror.
    box('body', [2.75, 2.9], [0.02, 1.98], [0.28, 0.5]),
    box('body', [-2.72, -2.6], [0.02, 1.98], [0.28, 0.48]),
    box('body', [1.85, 1.95], [Y, Y + 0.17], [1.35, 1.62]),
    // Roof rails with three cross bars.
    box('body', [-2.4, 1.0], [0.2, 0.28], [2.45, 2.52]),
    box('body', [-2.4, 1.0], [1.72, 1.8], [2.45, 2.52]),
    ...[-2.2, -0.8, 0.6].map((x) => box('body', [x, x + 0.06], [0.2, 1.8], [2.52, 2.56])),
  );
};

/** Enclosed tandem-axle trailer: rounded body, long mudguards, A-frame drawbar, jockey wheel. */
export const trailer3d = () => {
  const W = 2.1;
  const mid = W / 2;
  const longFender = (y: V2) =>
    extrude(
      'body',
      [
        ...arc(-0.55, 0.33, 0.43, 175, 90, 5),
        ...arc(0.35, 0.33, 0.43, 90, 5, 5),
        ...arc(0.35, 0.33, 0.39, 5, 90, 5),
        ...arc(-0.55, 0.33, 0.39, 90, 175, 5),
      ],
      y,
    );
  return model(
    ...[-0.55, 0.35].flatMap((x) => [
      wheel('wheels', x, 0.33, 0.33, [-0.2, 0.02]),
      wheel('wheels', x, 0.33, 0.33, [W - 0.02, W + 0.2]),
    ]),
    longFender([-0.22, 0.02]),
    longFender([W - 0.02, W + 0.22]),
    box('body', [-2.3, 2.3], [0.3, W - 0.3], [0.35, 0.5]),
    extrude(
      'body',
      [
        [-2.4, 0.5],
        [2.2, 0.5],
        [2.35, 0.7],
        [2.35, 2.05],
        [2.25, 2.25],
        [2.05, 2.35],
        [-2.2, 2.35],
        [-2.35, 2.3],
        [-2.4, 2.2],
      ],
      [0, W],
      [
        // Side door with a handle, a window, and the stripe either side of the door.
        onY(W, [-0.95, -0.15], [0.65, 2.1]),
        [
          [-0.3, W, 1.35],
          [-0.22, W, 1.35],
        ],
        onY(W, [0.6, 1.6], [1.55, 2.0]),
        [
          [-2.4, W, 0.9],
          [-1.1, W, 0.9],
        ],
        [
          [0.0, W, 0.9],
          [2.35, W, 0.9],
        ],
        // Roof seams.
        ...[-1.2, 0, 1.2].map((x): V3[] => [
          [x, 0.1, 2.35],
          [x, W - 0.1, 2.35],
        ]),
        // Rear ramp door and tail lights.
        onX(-2.4, [0.2, W - 0.2], [0.6, 2.1]),
        onX(-2.4, [0.05, 0.15], [0.6, 0.9]),
        onX(-2.4, [W - 0.15, W - 0.05], [0.6, 0.9]),
      ],
    ),
    // Roof vent.
    box('body', [-0.5, 0.0], [mid - 0.25, mid + 0.25], [2.35, 2.45]),
    // Corner steadies at the back.
    box('body', [-2.3, -2.2], [0.35, 0.45], [0.05, 0.35]),
    box('body', [-2.3, -2.2], [W - 0.45, W - 0.35], [0.05, 0.35]),
    // A-frame drawbar, coupler, a stone guard box and the jockey wheel.
    bar('body', [2.2, 0.4], [3.4, mid], 0.1, [0.42, 0.54]),
    bar('body', [2.2, W - 0.4], [3.4, mid], 0.1, [0.42, 0.54]),
    box('body', [3.35, 3.62], [mid - 0.08, mid + 0.08], [0.4, 0.56]),
    box(
      'body',
      [2.45, 2.85],
      [mid - 0.35, mid + 0.35],
      [0.54, 0.9],
      [
        [
          [2.45, mid - 0.35, 0.82],
          [2.45, mid + 0.35, 0.82],
        ],
      ],
    ),
    cylinder('body', 'z', [0.2, 0.75], [3.1, mid + 0.16], 0.035, 12),
    wheel('wheels', 3.1, 0.12, 0.12, [mid + 0.11, mid + 0.21]),
  );
};

/** Skid-steer loader: caged cab between the lift arms and rams, an open bucket. */
export const skidSteer3d = () => {
  const screen = (zz: number) => 0.6 - 0.05 * (zz - 1.0);
  const arms = [0.18, 1.47].flatMap((y0): THREE.Object3D[] => [
    extrude(
      'boom',
      [
        [-1.1, 1.4],
        [-0.9, 1.7],
        [0.85, 1.6],
        [1.3, 0.75],
        [1.08, 0.62],
        [0.68, 1.38],
        [-0.95, 1.25],
      ],
      [y0, y0 + 0.15],
    ),
    ram('boom', [-0.85, y0 + 0.075, 0.55], [0.2, y0 + 0.075, 1.3], 0.055),
  ]);
  return model(
    ...[-0.55, 0.55].flatMap((x) => [
      wheel('wheels', x, 0.38, 0.38, [0, 0.3]),
      wheel('wheels', x, 0.38, 0.38, [1.5, 1.8]),
    ]),
    extrude(
      'body',
      [
        [-1.2, 0.3],
        [0.9, 0.3],
        [0.9, 0.95],
        [-0.3, 1.0],
        [-1.0, 1.3],
        [-1.2, 1.25],
      ],
      [0.33, 1.47],
      [
        ...[0.55, 0.75, 0.95, 1.15].map((y): V3[] => [
          [-1.2, y, 0.55],
          [-1.2, y, 1.1],
        ]),
        onX(-1.2, [0.38, 0.5], [0.95, 1.15]),
        onX(-1.2, [1.3, 1.42], [0.95, 1.15]),
      ],
    ),
    extrude(
      'cab',
      [
        [-0.65, 1.0],
        [0.6, 1.0],
        [0.55, 2.0],
        [-0.65, 2.0],
      ],
      [0.4, 1.4],
      [
        onY(1.4, [-0.45, 0.4], [1.15, 1.85]),
        ...[-0.2, 0.1].map((x): V3[] => [
          [x, 1.4, 1.15],
          [x, 1.4, 1.85],
        ]),
        // Door frame on the front, with its guard bars.
        outline([
          [screen(1.05), 0.48, 1.05],
          [screen(1.05), 1.32, 1.05],
          [screen(1.95), 1.32, 1.95],
          [screen(1.95), 0.48, 1.95],
        ]),
        ...[0.69, 0.9, 1.11].map((y): V3[] => [
          [screen(1.05), y, 1.05],
          [screen(1.95), y, 1.95],
        ]),
      ],
    ),
    box('cab', [-0.7, 0.62], [0.36, 1.44], [2.0, 2.06]),
    box('cab', [0.5, 0.58], [0.45, 0.6], [1.9, 1.98], [onX(0.58, [0.47, 0.58], [1.91, 1.97])]),
    box('cab', [0.5, 0.58], [1.2, 1.35], [1.9, 1.98], [onX(0.58, [1.22, 1.33], [1.91, 1.97])]),
    ...arms,
    // Open bucket: back wall, floor, top lip and side plates.
    extrude(
      'bucket',
      [
        [1.1, 0.0],
        [1.18, 0.0],
        [1.22, 0.75],
        [1.14, 0.75],
      ],
      [-0.05, 1.85],
    ),
    extrude(
      'bucket',
      [
        [1.1, 0.0],
        [1.95, 0.0],
        [1.95, 0.03],
        [1.15, 0.07],
      ],
      [-0.05, 1.85],
    ),
    box('bucket', [1.14, 1.45], [-0.05, 1.85], [0.7, 0.76]),
    ...[
      [-0.09, -0.05],
      [1.85, 1.89],
    ].map(([y0, y1]) =>
      extrude(
        'bucket',
        [
          [1.1, 0.0],
          [1.95, 0.0],
          [1.45, 0.76],
          [1.14, 0.76],
        ],
        [y0!, y1!],
      ),
    ),
  );
};

/** Mobile compressor: rounded housing with service doors, mudguards, drawbar and towing eye. */
export const compressor3d = () =>
  model(
    wheel('wheels', -0.2, 0.36, 0.36, [-0.22, 0]),
    wheel('wheels', -0.2, 0.36, 0.36, [1.6, 1.82]),
    fender(-0.2, 0.36, 0.42, [-0.24, 0.02], 15, 165),
    fender(-0.2, 0.36, 0.42, [1.58, 1.84], 15, 165),
    cylinder('body', 'y', [-0.15, 1.75], [-0.2, 0.36], 0.05, 12),
    extrude(
      'body',
      [
        [-1.2, 0.45],
        [1.2, 0.45],
        [1.2, 1.4],
        ...arc(1.0, 1.4, 0.2, 0, 90, 4),
        ...arc(-1.0, 1.4, 0.2, 90, 180, 4),
      ],
      [0, 1.6],
      [
        // Two service doors on the near side, louvres in the rear one, handles.
        onY(1.6, [-1.05, -0.05], [0.6, 1.35]),
        onY(1.6, [0.05, 1.05], [0.6, 1.35]),
        ...[0.75, 0.88, 1.01, 1.14].map((zz): V3[] => [
          [-0.9, 1.6, zz],
          [-0.2, 1.6, zz],
        ]),
        [
          [-0.15, 1.6, 0.95],
          [-0.15, 1.6, 1.08],
        ],
        [
          [0.15, 1.6, 0.95],
          [0.15, 1.6, 1.08],
        ],
        // Control panel on the front.
        onX(1.2, [0.5, 1.1], [0.8, 1.2]),
        ...[0.65, 0.95].map((y) => onX(1.2, [y, y + 0.1], [0.95, 1.05])),
      ],
    ),
    // Lifting eye and exhaust cap on the roof.
    box('body', [-0.08, 0.08], [0.72, 0.88], [1.6, 1.72]),
    cylinder('body', 'z', [1.6, 1.75], [-0.8, 0.45], 0.06, 12),
    // Prop legs at the back, the drawbar with its stand and the towing eye.
    box('body', [-1.1, -1.0], [0.1, 0.2], [0.0, 0.45]),
    box('body', [-1.1, -1.0], [1.4, 1.5], [0.0, 0.45]),
    extrude(
      'body',
      [
        [1.2, 0.5],
        [1.2, 0.7],
        [2.3, 0.45],
        [2.3, 0.35],
      ],
      [0.65, 0.95],
    ),
    box('body', [1.85, 1.92], [0.76, 0.84], [0.0, 0.45]),
    cylinder('body', 'z', [0.36, 0.44], [2.38, 0.8], 0.1, 16),
  );

/** Generic equipment: a crate on two skids, with battens round its faces. */
export const other3d = () =>
  model(
    ...[
      [-1.1, -0.9],
      [0.9, 1.1],
    ].map(([x0, x1]) => box('body', [x0!, x1!], [0.05, 1.55], [0, 0.18])),
    box(
      'body',
      [-1.2, 1.2],
      [0, 1.6],
      [0.18, 1.5],
      [
        // Forklift pockets in the base board.
        onY(1.6, [-0.75, -0.35], [0.22, 0.34]),
        onY(1.6, [0.35, 0.75], [0.22, 0.34]),
      ],
    ),
    // Battens: corner posts and a band round the middle.
    ...[
      [-1.22, -1.12],
      [1.12, 1.22],
    ].flatMap(([x0, x1]) => [
      box('body', [x0!, x1!], [-0.02, 0.08], [0.18, 1.52]),
      box('body', [x0!, x1!], [1.52, 1.62], [0.18, 1.52]),
    ]),
    box('body', [-1.22, 1.22], [1.6, 1.63], [0.78, 0.9]),
    box('body', [1.2, 1.23], [0, 1.6], [0.78, 0.9]),
    box('body', [-1.22, 1.22], [1.6, 1.63], [1.4, 1.52]),
    box('body', [1.2, 1.23], [0, 1.6], [1.4, 1.52]),
  );
