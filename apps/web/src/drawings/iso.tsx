import type { CSSProperties } from 'react';
import type { PartName } from './model';

/**
 * Isometric drawings built from simple 3D solids and projected to SVG, so parts have real
 * height, sides and shading. World axes: x = length (front is +x), y = width (+y is the
 * side facing the viewer), z = up. Units match the side profile's viewBox.
 */
export type P2 = readonly [number, number];
export type P3 = readonly [number, number, number];

export interface Solid {
  part: PartName;
  /** Outline in the x–z plane (as in the side profile, but z up), extruded across y. */
  profile: readonly P2[];
  y: readonly [number, number];
  /** Round solids (wheels, drums): no seams between facets, just the silhouette. */
  smooth?: boolean;
  /** Detail lines drawn on top of this solid (windows, bed rails, hubs). */
  decals?: readonly (readonly P3[])[];
}

export const box = (
  part: PartName,
  [x0, x1]: P2,
  y: P2,
  [z0, z1]: P2,
  decals?: Solid['decals'],
): Solid => ({
  part,
  profile: [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
  ],
  y,
  decals,
});

/** A crawler track: a long rounded loop with sprocket, idler and rollers on the visible side. */
export const track = (part: PartName, [x0, x1]: P2, h: number, y: P2): Solid => {
  const r = h / 2;
  const loop: P2[] = [...arc(x1 - r, r, r, -90, 90), ...arc(x0 + r, r, r, 90, 270)];
  const near = y[1];
  const ring = (cx: number, cz: number, rr: number) =>
    circle(cx, cz, rr, 20).map(([x, z]) => [x, near, z] as const);
  const inner = [...arc(x1 - r, r, r * 0.62, -90, 90), ...arc(x0 + r, r, r * 0.62, 90, 270)];
  const rollers = Array.from({ length: 4 }, (_, i) => x0 + r + ((i + 1) * (x1 - x0 - 2 * r)) / 5);
  return {
    part,
    profile: loop,
    y,
    smooth: true,
    decals: [
      inner.map(([x, z]) => [x, near, z] as const),
      ring(x0 + r, r, r * 0.42),
      ring(x1 - r, r, r * 0.42),
      ...rollers.map((x) => ring(x, r * 0.55, r * 0.16)),
    ],
  };
};

function arc(cx: number, cz: number, r: number, from: number, to: number, n = 10): P2[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = ((from + ((to - from) * i) / n) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cz + r * Math.sin(a)] as const;
  });
}

/** Scales a model written in metres to drawing units (1 m = 44 units, the pickup's scale). */
export function metres(solids: readonly Solid[], k = 44): Solid[] {
  return solids.map((s) => ({
    ...s,
    profile: s.profile.map(([x, z]) => [x * k, z * k] as const),
    y: [s.y[0] * k, s.y[1] * k] as const,
    decals: s.decals?.map((line) => line.map(([x, y, z]) => [x * k, y * k, z * k] as const)),
  }));
}

/** A wheel (axis along y), with its hub drawn on the face toward the viewer. */
export const wheel = (part: PartName, cx: number, cz: number, r: number, y: P2): Solid => ({
  part,
  profile: circle(cx, cz, r),
  y,
  smooth: true,
  decals: [circle(cx, cz, r * 0.38).map(([x, z]) => [x, y[1], z] as const)],
});

export function circle(cx: number, cz: number, r: number, n = 28): P2[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [cx + r * Math.cos(a), cz + r * Math.sin(a)] as const;
  });
}

const C = Math.cos(Math.PI / 6);
const project = ([x, y, z]: P3): P2 => [(x - y) * C, (x + y) * 0.5 - z];

export const path = (pts: readonly P2[], close = true) =>
  pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ') +
  (close ? ' Z' : '');

function hull(points: P2[]): P2[] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: P2, a: P2, b: P2) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: P2[] = [];
  const upper: P2[] = [];
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

/** Counter-clockwise in x–z (z up), so edge normals point outward. */
export function ccw(profile: readonly P2[]): readonly P2[] {
  let area = 0;
  profile.forEach(([x, z], i) => {
    const [x2, z2] = profile[(i + 1) % profile.length]!;
    area += x * z2 - x2 * z;
  });
  return area >= 0 ? profile : [...profile].reverse();
}

interface Face {
  d: string;
  shade: 'top' | 'front' | 'side';
  stroke: boolean;
}

function faces(s: Solid): Face[] {
  const prof = ccw(s.profile);
  const [y0, y1] = s.y;
  const out: Face[] = [];
  if (s.smooth) {
    const pts = prof.flatMap(([x, z]) => [project([x, y0, z]), project([x, y1, z])]);
    out.push({ d: path(hull(pts)), shade: 'front', stroke: true });
  } else {
    prof.forEach(([x, z], i) => {
      const [x2, z2] = prof[(i + 1) % prof.length]!;
      const nx = z2 - z;
      const nz = -(x2 - x);
      // Visible when the face points toward the viewer, who looks from +x, +y, +z.
      if (nx + nz <= 1e-6) return;
      const quad = [
        project([x, y0, z]),
        project([x2, y0, z2]),
        project([x2, y1, z2]),
        project([x, y1, z]),
      ];
      out.push({ d: path(quad), shade: nz > Math.abs(nx) ? 'top' : 'front', stroke: true });
    });
  }
  // The cap on the viewer's side.
  out.push({ d: path(prof.map(([x, z]) => project([x, y1, z]))), shade: 'side', stroke: true });
  return out;
}

const depth = (s: Solid) => {
  const xs = s.profile.map((p) => p[0]);
  const zs = s.profile.map((p) => p[1]);
  return [(s.y[0] + s.y[1]) / 2, Math.min(...zs), (Math.min(...xs) + Math.max(...xs)) / 2] as const;
};

/** Far-to-near paint order: across the width first, then low before high, then back to front. */
function paintOrder(solids: readonly Solid[]) {
  return [...solids].sort((a, b) => {
    const [ay, az, ax] = depth(a);
    const [by, bz, bx] = depth(b);
    return ay - by || az - bz || ax - bx;
  });
}

export function isoBounds(solids: readonly Solid[]) {
  const pts = solids.flatMap((s) =>
    s.profile.flatMap(([x, z]) => [project([x, s.y[0], z]), project([x, s.y[1], z])]),
  );
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const pad = 6;
  return {
    x: Math.min(...xs) - pad,
    y: Math.min(...ys) - pad,
    width: Math.max(...xs) - Math.min(...xs) + pad * 2,
    height: Math.max(...ys) - Math.min(...ys) + pad * 2,
  };
}

/** The isometric drawing as an SVG `size` px wide. */
export function IsoDrawing({
  solids,
  size,
  className,
  style,
}: {
  solids: readonly Solid[];
  size: number;
  className?: string;
  style?: CSSProperties;
}) {
  const b = isoBounds(solids);
  return (
    <svg
      viewBox={`${b.x} ${b.y} ${b.width} ${b.height}`}
      className={className}
      style={{ width: size, '--vd-unit': b.width / size, ...style } as CSSProperties}
      aria-hidden
    >
      <ellipse
        className="vd-ground"
        cx={b.x + b.width / 2}
        cy={b.y + b.height * 0.78}
        rx={b.width * 0.46}
        ry={b.height * 0.2}
      />
      {paintOrder(solids).map((s, i) => (
        <g key={i} data-part={s.part} className="vd-part">
          {faces(s).map((f, j) => (
            <path key={j} d={f.d} className={`vd-${f.shade}`} />
          ))}
          {s.decals?.map((line, j) => (
            <path key={`d${j}`} d={path(line.map(project), line.length > 2)} className="vd-decal" />
          ))}
        </g>
      ))}
    </svg>
  );
}
