import * as THREE from 'three';
import type { PartName } from '../model';

/**
 * Building blocks for the 3D vehicle models (three.js, used only when the drawings are
 * generated, never shipped to the browser). World axes match the 2D solids: x = length (front is
 * +x), y = width (+y is the side facing the viewer), z = up; models are written in metres.
 */
export type V2 = readonly [number, number];
export type V3 = readonly [number, number, number];

export interface PieceData {
  part: PartName;
  /** Round surfaces (tyres, drums, rams): drawn by their outline, with no seams between facets. */
  smooth?: boolean;
  /** Detail lines on the surface (windows, panel seams), in world metres. */
  decals?: readonly (readonly V3[])[];
}

function tag<T extends THREE.Object3D>(obj: T, data: PieceData): T {
  obj.userData = { ...data };
  return obj;
}

const material = new THREE.MeshBasicMaterial();

/** An axis-aligned box. */
export function box(
  part: PartName,
  [x0, x1]: V2,
  [y0, y1]: V2,
  [z0, z1]: V2,
  decals?: PieceData['decals'],
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), material);
  mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return tag(mesh, { part, decals });
}

/** A side profile (x, z points) pushed across the width from y0 to y1. */
export function extrude(
  part: PartName,
  profile: readonly V2[],
  [y0, y1]: V2,
  decals?: PieceData['decals'],
) {
  const shape = new THREE.Shape(profile.map(([x, z]) => new THREE.Vector2(x, z)));
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false });
  // Shape x stays x, shape y becomes z, and the extrusion runs from y1 back to y0.
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, y1, 0);
  return tag(new THREE.Mesh(geometry, material), { part, decals });
}

/** A round bar or drum along an axis, from `a0` to `a1` on that axis, centred at (u, v). */
export function cylinder(
  part: PartName,
  axis: 'x' | 'y' | 'z',
  [a0, a1]: V2,
  [u, v]: V2,
  r: number,
  segments = 28,
  decals?: PieceData['decals'],
) {
  const geometry = new THREE.CylinderGeometry(r, r, a1 - a0, segments);
  const mid = (a0 + a1) / 2;
  if (axis === 'x') geometry.rotateZ(-Math.PI / 2).translate(mid, u, v);
  else if (axis === 'y') geometry.translate(u, mid, v);
  else geometry.rotateX(Math.PI / 2).translate(u, v, mid);
  return tag(new THREE.Mesh(geometry, material), { part, smooth: true, decals });
}

/** A ram (hydraulic cylinder) from one point to another: a thick barrel and a thinner rod. */
export function ram(part: PartName, from: V3, to: V3, r: number) {
  const a = new THREE.Vector3(...from);
  const b = new THREE.Vector3(...to);
  const mid = a.clone().lerp(b, 0.55);
  const group = new THREE.Group();
  for (const [p, q, rr] of [
    [a, mid, r],
    [mid, b, r * 0.55],
  ] as const) {
    const len = p.distanceTo(q);
    const geometry = new THREE.CylinderGeometry(rr, rr, len, 16);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(p.clone().lerp(q, 0.5));
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), q.clone().sub(p).normalize());
    group.add(tag(mesh, { part, smooth: true }));
  }
  return group;
}

/** A tyre on an axle along y, with its hub ring drawn on the face toward the viewer. */
export function wheel(part: PartName, cx: number, cz: number, r: number, [y0, y1]: V2) {
  const ring = Array.from({ length: 25 }, (_, i) => {
    const a = (i / 24) * Math.PI * 2;
    return [cx + r * 0.38 * Math.cos(a), y1, cz + r * 0.38 * Math.sin(a)] as const;
  });
  const hubs = Array.from({ length: 25 }, (_, i) => {
    const a = (i / 24) * Math.PI * 2;
    return [cx + r * 0.38 * Math.cos(a), y0, cz + r * 0.38 * Math.sin(a)] as const;
  });
  return cylinder(part, 'y', [y0, y1], [cx, cz], r, 32, [ring, hubs]);
}

/** Groups pieces into one model. */
export function model(...pieces: THREE.Object3D[]) {
  const group = new THREE.Group();
  for (const piece of pieces) group.add(piece);
  return group;
}
