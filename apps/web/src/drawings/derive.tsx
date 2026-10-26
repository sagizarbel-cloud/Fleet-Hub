import { ccw, path, type P2, type P3, type Solid } from './iso';
import type { ViewDrawing } from './model';

/**
 * Top and side views generated from a type's 3D solids, so every view of a vehicle
 * agrees. Types can still hand-draw a view instead (the pickup does).
 */
const PAD = 8;

const flat = (line: readonly P3[], axis: 1 | 2) =>
  line.every((p) => Math.abs(p[axis] - line[0]![axis]) < 1e-6);

/** Side profile: front to the right, ground at the bottom; far side first. */
export function sideView(solids: readonly Solid[]): ViewDrawing & { order: readonly Solid[] } {
  const xs = solids.flatMap((s) => s.profile.map((p) => p[0]));
  const zs = solids.flatMap((s) => s.profile.map((p) => p[1]));
  const minX = Math.min(...xs);
  const maxZ = Math.max(...zs);
  const to = ([x, z]: P2): P2 => [x - minX + PAD, maxZ - z + PAD];
  const order = [...solids].sort((a, b) => a.y[1] - b.y[1]);
  const items = order.map((s, i) => ({
    part: s.part,
    node: (
      <g key={i}>
        <path d={path(s.profile.map(to))} className="vd-solid" />
        {s.decals
          ?.filter((line) => flat(line, 1))
          .map((line, j) => (
            <path
              key={j}
              d={path(
                line.map(([x, , z]) => to([x, z])),
                line.length > 2,
              )}
            />
          ))}
      </g>
    ),
  }));
  return {
    width: Math.max(...xs) - minX + PAD * 2,
    height: maxZ - Math.min(...zs) + PAD * 2,
    layers: items,
    order,
  };
}

/** Top view: front facing up; low parts first, so higher parts sit on top. */
export function topView(solids: readonly Solid[]): ViewDrawing {
  const xs = solids.flatMap((s) => s.profile.map((p) => p[0]));
  const ys = solids.flatMap((s) => [...s.y]);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const to = (x: number, y: number): P2 => [y - minY + PAD, maxX - x + PAD];
  const rect = (x0: number, x1: number, y0: number, y1: number) =>
    path([to(x0, y0), to(x1, y0), to(x1, y1), to(x0, y1)]);
  const top = (s: Solid) => Math.max(...s.profile.map((p) => p[1]));
  const order = [...solids].sort((a, b) => top(a) - top(b));

  const items = order.map((s, i) => {
    const px = s.profile.map((p) => p[0]);
    const [y0, y1] = s.y;
    const faces: string[] = [];
    if (s.smooth) {
      faces.push(rect(Math.min(...px), Math.max(...px), y0, y1));
    } else {
      // Every face that looks up shows from above; together they draw the roof lines.
      const prof = ccw(s.profile);
      prof.forEach(([x, z], k) => {
        const [x2, z2] = prof[(k + 1) % prof.length]!;
        if (-(x2 - x) > 1e-6 && Math.abs(x2 - x) > 1e-6)
          faces.push(rect(Math.min(x, x2), Math.max(x, x2), y0, y1));
        void z;
        void z2;
      });
      if (!faces.length) faces.push(rect(Math.min(...px), Math.max(...px), y0, y1));
    }
    return {
      part: s.part,
      node: (
        <g key={i}>
          {faces.map((d, k) => (
            <path key={k} d={d} className="vd-solid" />
          ))}
          {s.decals
            ?.filter((line) => flat(line, 2))
            .map((line, j) => (
              <path
                key={`d${j}`}
                d={path(
                  line.map(([x, y]) => to(x, y)),
                  line.length > 2,
                )}
              />
            ))}
        </g>
      ),
    };
  });
  return {
    width: Math.max(...ys) - minY + PAD * 2,
    height: maxX - Math.min(...xs) + PAD * 2,
    layers: items,
  };
}
