import * as THREE from 'three';
import type { PartName } from '../model';
import type { PieceData, V3 } from './kit';

/**
 * Turns a 3D model into flat line drawings (top, side, isometric) like the hand-made ones:
 * outlined faces painted far to near, plus detail lines. Which face is in front of which is read
 * off a depth buffer, face by face, so a part can sit partly in front of a neighbour and partly
 * behind it, and detail lines show only where nothing covers them.
 */

export type ViewName = 'top' | 'side' | 'iso';
export type Shade = 'top' | 'front' | 'side' | 'solid';

export interface RenderedView {
  width: number;
  height: number;
  /** Painted in order: each an outlined, filled face. */
  faces: { part: PartName; d: string; shade: Shade }[];
  /** Detail lines, already cut where something covers them. */
  lines: { part: PartName; d: string }[];
}

interface Face {
  part: PartName;
  smooth: boolean;
  /** Triangles in world space (for depth), and the outline (planar faces only). */
  tris: V3[][];
  outline: V3[];
  normal: V3;
}

const C = Math.cos(Math.PI / 6);
/** Screen x, screen y (down) and nearness (bigger is closer to the viewer) for each view. */
const PROJECT: Record<ViewName, (p: V3) => V3> = {
  iso: ([x, y, z]) => [(x - y) * C, (x + y) * 0.5 - z, x + y + z],
  side: ([x, y, z]) => [x, -z, y],
  top: ([x, y, z]) => [y, -x, z],
};
const TOWARD: Record<ViewName, V3> = { iso: [1, 1, 1], side: [0, 1, 0], top: [0, 0, 1] };

const key = (p: V3) => p.map((n) => n.toFixed(4)).join(',');

/** Planar faces (coplanar triangles of one piece merged) and round surfaces of a model. */
function facesOf(root: THREE.Object3D): {
  faces: Face[];
  decals: { part: PartName; line: V3[] }[];
} {
  root.updateMatrixWorld(true);
  const faces: Face[] = [];
  const decals: { part: PartName; line: V3[] }[] = [];
  root.traverse((obj) => {
    const data = obj.userData as Partial<PieceData>;
    if (!(obj instanceof THREE.Mesh) || !data.part) return;
    const part = data.part;
    for (const line of data.decals ?? []) decals.push({ part, line: [...line] });
    const geometry = (obj.geometry as THREE.BufferGeometry).toNonIndexed();
    geometry.applyMatrix4(obj.matrixWorld);
    const pos = geometry.getAttribute('position');
    const tris: V3[][] = [];
    for (let i = 0; i < pos.count; i += 3)
      tris.push([0, 1, 2].map((k) => [pos.getX(i + k), pos.getY(i + k), pos.getZ(i + k)] as const));
    const normalOf = (t: V3[]): V3 => {
      const a = new THREE.Vector3(...t[0]!);
      const n = new THREE.Vector3(...t[1]!)
        .sub(a)
        .cross(new THREE.Vector3(...t[2]!).sub(a))
        .normalize();
      return [n.x, n.y, n.z];
    };
    // Round pieces: the flat ends stay faces of their own, the curved side is one surface.
    const groups = new Map<string, { normal: V3; tris: V3[][] }>();
    const curved: V3[][] = [];
    for (const t of tris) {
      const n = normalOf(t);
      if (!Number.isFinite(n[0])) continue;
      if (data.smooth && !isCap(n, t, tris)) {
        curved.push(t);
        continue;
      }
      const d = n[0] * t[0]![0] + n[1] * t[0]![1] + n[2] * t[0]![2];
      const k = `${n.map((v) => v.toFixed(3)).join(',')}|${d.toFixed(3)}`;
      const g = groups.get(k) ?? { normal: n, tris: [] };
      g.tris.push(t);
      groups.set(k, g);
    }
    for (const g of groups.values())
      faces.push({
        part,
        smooth: false,
        tris: g.tris,
        outline: outlineOf(g.tris),
        normal: g.normal,
      });
    if (curved.length)
      faces.push({ part, smooth: true, tris: curved, outline: [], normal: [0, 0, 0] });
  });
  return { faces, decals };
}

/** On a round piece, the end caps are the triangles sharing their plane with many others. */
function isCap(n: V3, t: V3[], all: V3[][]) {
  const d = n[0] * t[0]![0] + n[1] * t[0]![1] + n[2] * t[0]![2];
  let same = 0;
  for (const o of all) {
    const p = o[0]!;
    const q = o[1]!;
    const r = o[2]!;
    const on = (v: V3) => Math.abs(n[0] * v[0] + n[1] * v[1] + n[2] * v[2] - d) < 1e-4;
    if (on(p) && on(q) && on(r) && ++same > 4) return true;
  }
  return false;
}

/** The outer boundary of a set of coplanar triangles: the edges used once, chained. */
function outlineOf(tris: V3[][]): V3[] {
  const count = new Map<string, number>();
  const pts = new Map<string, V3>();
  const edges: [string, string][] = [];
  for (const t of tris)
    for (let i = 0; i < 3; i++) {
      const a = t[i]!;
      const b = t[(i + 1) % 3]!;
      const ka = key(a);
      const kb = key(b);
      pts.set(ka, a);
      pts.set(kb, b);
      const k = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      count.set(k, (count.get(k) ?? 0) + 1);
      edges.push([ka, kb]);
    }
  const next = new Map<string, string>();
  for (const [a, b] of edges) {
    const k = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (count.get(k) === 1) next.set(a, b);
  }
  // Chain each loop and keep the longest (the outer one).
  const seen = new Set<string>();
  let best: string[] = [];
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const loop: string[] = [];
    let at: string | undefined = start;
    while (at && !seen.has(at)) {
      seen.add(at);
      loop.push(at);
      at = next.get(at);
    }
    if (loop.length > best.length) best = loop;
  }
  return best.map((k) => pts.get(k)!);
}

function hull(points: [number, number][]): [number, number][] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) =>
    (a[0]! - o[0]!) * (b[1]! - o[1]!) - (a[1]! - o[1]!) * (b[0]! - o[0]!);
  const lower: [number, number][] = [];
  const upper: [number, number][] = [];
  for (const pt of p) {
    while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, pt) <= 0) lower.pop();
    lower.push(pt);
  }
  for (const pt of p.reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, pt) <= 0) upper.pop();
    upper.push(pt);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

const fmt = (n: number) => (Math.round(n * 10) / 10).toString();
const pathOf = (pts: readonly (readonly number[])[], close = true) =>
  pts.map(([x, y], i) => `${i ? 'L' : 'M'}${fmt(x!)} ${fmt(y!)}`).join(' ') + (close ? ' Z' : '');

/** Renders one view. `unit` is drawing units per metre (44, as the 2D drawings). */
export function renderView(root: THREE.Object3D, view: ViewName, unit = 44, pad = 8): RenderedView {
  const { faces: all, decals } = facesOf(root);
  const project = (p: V3): V3 => {
    const [sx, sy, d] = PROJECT[view](p);
    return [sx * unit, sy * unit, d * unit];
  };
  const toward = TOWARD[view];
  const facing = (n: V3) => n[0] * toward[0] + n[1] * toward[1] + n[2] * toward[2] > 1e-6;
  const faces = all.filter((f) => f.smooth || facing(f.normal));

  // Bounds of everything, then a depth buffer of up to 4 samples per drawing unit.
  const projected = faces.map((f) => f.tris.map((t) => t.map(project)));
  const xs = projected.flat(2).map((p) => p[0]);
  const ys = projected.flat(2).map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const width = Math.max(...xs) - minX + pad * 2;
  const height = Math.max(...ys) - minY + pad * 2;
  const shift = (p: V3): V3 => [p[0] - minX + pad, p[1] - minY + pad, p[2]];
  const scale = Math.min(4, 1600 / Math.max(width, height));
  const W = Math.ceil(width * scale);
  const H = Math.ceil(height * scale);
  const depth = new Float32Array(W * H).fill(-Infinity);
  const owner = new Int32Array(W * H).fill(-1);
  const front = new Map<number, Map<number, number>>(); // front.get(a).get(b): pixels where a covers b
  const note = (a: number, b: number) => {
    const m = front.get(a) ?? new Map<number, number>();
    m.set(b, (m.get(b) ?? 0) + 1);
    front.set(a, m);
  };
  const eps = 0.02 * unit;

  projected.forEach((tris, id) => {
    for (const tri of tris) {
      const [a, b, c] = tri.map(shift).map((p) => [p[0] * scale, p[1] * scale, p[2]] as const);
      const x0 = Math.max(0, Math.floor(Math.min(a![0], b![0], c![0])));
      const x1 = Math.min(W - 1, Math.ceil(Math.max(a![0], b![0], c![0])));
      const y0 = Math.max(0, Math.floor(Math.min(a![1], b![1], c![1])));
      const y1 = Math.min(H - 1, Math.ceil(Math.max(a![1], b![1], c![1])));
      const den = (b![1] - c![1]) * (a![0] - c![0]) + (c![0] - b![0]) * (a![1] - c![1]);
      if (Math.abs(den) < 1e-9) continue;
      for (let py = y0; py <= y1; py++)
        for (let px = x0; px <= x1; px++) {
          const X = px + 0.5;
          const Y = py + 0.5;
          const w1 = ((b![1] - c![1]) * (X - c![0]) + (c![0] - b![0]) * (Y - c![1])) / den;
          const w2 = ((c![1] - a![1]) * (X - c![0]) + (a![0] - c![0]) * (Y - c![1])) / den;
          const w3 = 1 - w1 - w2;
          if (w1 < 0 || w2 < 0 || w3 < 0) continue;
          const z = w1 * a![2] + w2 * b![2] + w3 * c![2];
          const i = py * W + px;
          const other = owner[i]!;
          if (other === id) {
            if (z > depth[i]!) depth[i] = z;
            continue;
          }
          if (z > depth[i]! + eps) {
            if (other >= 0) note(id, other);
            depth[i] = z;
            owner[i] = id;
          } else if (z < depth[i]! - eps) {
            note(other, id);
          } else if (z > depth[i]!) {
            depth[i] = z;
            owner[i] = id;
          }
        }
    }
  });

  // Paint order: a face goes after every face it covers more than it is covered by.
  const n = faces.length;
  const visible = new Set<number>();
  for (let i = 0; i < W * H; i++) if (owner[i]! >= 0) visible.add(owner[i]!);
  const behind = Array.from({ length: n }, () => new Set<number>());
  for (const [a, m] of front)
    for (const [b, k] of m) {
      const back = front.get(b)?.get(a) ?? 0;
      if (k > back) behind[a]!.add(b);
    }
  const meanDepth = projected.map((tris) => {
    const pts = tris.flat();
    return pts.reduce((s, p) => s + p[2], 0) / pts.length;
  });
  const done = new Set<number>();
  const order: number[] = [];
  const pending = [...Array(n).keys()].filter((i) => visible.has(i));
  while (order.length < pending.length) {
    const ready = pending.filter(
      (i) => !done.has(i) && [...behind[i]!].every((b) => done.has(b) || !visible.has(b)),
    );
    const pool = ready.length ? ready : pending.filter((i) => !done.has(i));
    const pick = pool.reduce((a, b) => (meanDepth[a]! <= meanDepth[b]! ? a : b));
    done.add(pick);
    order.push(pick);
  }

  const shadeOf = (f: Face): Shade => {
    if (view !== 'iso') return 'solid';
    if (f.smooth) return 'front';
    const [nx, ny, nz] = f.normal.map(Math.abs) as unknown as [number, number, number];
    return nz >= nx && nz >= ny ? 'top' : ny >= nx ? 'side' : 'front';
  };
  const out: RenderedView = { width, height, faces: [], lines: [] };
  for (const id of order) {
    const f = faces[id]!;
    const pts = f.smooth
      ? hull(projected[id]!.flat().map((p) => [shift(p)[0], shift(p)[1]] as [number, number]))
      : f.outline.map((p) => shift(project(p)));
    if (pts.length >= 3) out.faces.push({ part: f.part, d: pathOf(pts), shade: shadeOf(f) });
  }

  // Detail lines: kept where they are at least as near as whatever the buffer holds.
  const step = 0.6 / scale;
  for (const { part, line } of decals) {
    const runs: [number, number][][] = [];
    let run: [number, number][] = [];
    for (let s = 0; s < line.length - 1; s++) {
      const a = shift(project(line[s]!));
      const b = shift(project(line[s + 1]!));
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const k = Math.max(1, Math.ceil(len / step));
      for (let j = s === 0 ? 0 : 1; j <= k; j++) {
        const t = j / k;
        const p: V3 = [
          a[0] + (b[0] - a[0]) * t,
          a[1] + (b[1] - a[1]) * t,
          a[2] + (b[2] - a[2]) * t,
        ];
        const px = Math.floor(p[0] * scale);
        const py = Math.floor(p[1] * scale);
        const i = py * W + px;
        const seen = px < 0 || py < 0 || px >= W || py >= H || p[2] >= depth[i]! - eps * 1.5;
        if (seen) run.push([p[0], p[1]]);
        else if (run.length) {
          runs.push(run);
          run = [];
        }
      }
    }
    if (run.length) runs.push(run);
    // Scraps of a line peeking out from behind something read as stray marks: drop them.
    const length = (r: [number, number][]) =>
      r.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - r[i]![0], p[1] - r[i]![1]), 0);
    for (const r of runs)
      if (r.length > 1 && length(r) > 3) out.lines.push({ part, d: pathOf(simplify(r), false) });
  }
  return out;
}

/** Drops points that sit on a straight line between their neighbours. */
function simplify(pts: [number, number][]) {
  if (pts.length < 3) return pts;
  const out = [pts[0]!];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = out.at(-1)!;
    const b = pts[i]!;
    const c = pts[i + 1]!;
    const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (Math.abs(cross) > 0.05) out.push(b);
  }
  out.push(pts.at(-1)!);
  return out;
}
