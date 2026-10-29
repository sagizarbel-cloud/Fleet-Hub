import { describe, expect, it } from 'vitest';
import type { P2, Solid } from './iso';
import { pickup } from './types/pickup';
import { trackedExcavator, wheeledExcavator } from './types/excavators';
import { wheelLoader } from './types/wheel-loader';
import { trailer } from './types/trailer';
import { compressor, forklift, other, skidSteer, tractor } from './types/small-machines';
import { truck, van } from './types/road';

const SOURCES = [
  trackedExcavator,
  wheeledExcavator,
  wheelLoader,
  skidSteer,
  tractor,
  forklift,
  truck,
  pickup,
  van,
  trailer,
  compressor,
  other,
];

const TOL = 0.75;

function distToSegment([px, pz]: P2, [ax, az]: P2, [bx, bz]: P2) {
  const dx = bx - ax;
  const dz = bz - az;
  const len = dx * dx + dz * dz;
  const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len)) : 0;
  return Math.hypot(px - ax - t * dx, pz - az - t * dz);
}

/** Inside the outline, or within TOL of its edge. */
function insideProfile(p: P2, profile: readonly P2[]) {
  let inside = false;
  for (let i = 0, j = profile.length - 1; i < profile.length; j = i++) {
    const [xi, zi] = profile[i]!;
    const [xj, zj] = profile[j]!;
    if (zi > p[1] !== zj > p[1] && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi)
      inside = !inside;
  }
  if (inside) return true;
  return profile.some((a, i) => distToSegment(p, a, profile[(i + 1) % profile.length]!) <= TOL);
}

/** Every point along a decal line, sampled densely, so a concave outline is caught too. */
function samples(line: Solid['decals'] extends readonly (infer L)[] | undefined ? L : never) {
  const pts = [];
  for (let i = 0; i < line.length; i++) {
    const a = line[i]!;
    const b = line[(i + 1) % line.length]!;
    if (i === line.length - 1 && line.length <= 2) {
      pts.push(a);
      break;
    }
    for (let k = 0; k < 8; k++) {
      const t = k / 8;
      pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
    }
  }
  return pts;
}

describe('drawing geometry', () => {
  for (const src of SOURCES) {
    it(`${src.represents}: every detail line stays on its own part`, () => {
      const stray: string[] = [];
      src.iso.forEach((solid, si) => {
        solid.decals?.forEach((line, di) => {
          for (const [x, y, z] of samples(line)) {
            const inY = y >= solid.y[0] - TOL && y <= solid.y[1] + TOL;
            if (!inY || !insideProfile([x, z], solid.profile)) {
              stray.push(
                `solid ${si} (${solid.part}) decal ${di} at ${[x, y, z].map((n) => +n.toFixed(1)).join(',')}`,
              );
              break;
            }
          }
        });
      });
      expect(stray).toEqual([]);
    });
  }

  for (const src of SOURCES) {
    it(`${src.represents}: no part floats free of the rest`, () => {
      const box = (s: Solid) => {
        const xs = s.profile.map((p) => p[0]);
        const zs = s.profile.map((p) => p[1]);
        return {
          x: [Math.min(...xs), Math.max(...xs)],
          z: [Math.min(...zs), Math.max(...zs)],
          y: s.y,
        };
      };
      const near = (a: readonly number[], b: readonly number[]) =>
        a[0]! <= b[1]! + TOL && b[0]! <= a[1]! + TOL;
      const boxes = src.iso.map(box);
      // Wheels and tracks hang on axles that aren't drawn, so across the width they may stand apart.
      const axled = (i: number) => ['wheels', 'tracks'].includes(src.iso[i]!.part);
      const floating = boxes
        .map((a, i) => ({ a, i }))
        .filter(
          ({ a, i }) =>
            !boxes.some(
              (b, j) => j !== i && near(a.x, b.x) && near(a.z, b.z) && (axled(i) || near(a.y, b.y)),
            ),
        )
        .map(({ i }) => `solid ${i} (${src.iso[i]!.part})`);
      expect(floating).toEqual([]);
    });
  }
});
