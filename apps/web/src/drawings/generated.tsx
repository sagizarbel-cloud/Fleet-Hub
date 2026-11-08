import type { ViewDrawing } from './model';
import type { RenderedView, ViewName } from './three/render';

/**
 * Drawings rendered from the 3D models (`pnpm --filter @fleet-hub/web drawings`), as the same
 * kind of layered line drawing the hand-made views use. Only the finished JSON ships; three.js
 * stays a build tool.
 */
type Rendered = Record<ViewName, RenderedView>;

const files = import.meta.glob<Rendered>('./generated/*.json', { eager: true, import: 'default' });

const SHADE = { top: 'vd-top', front: 'vd-front', side: 'vd-side', solid: 'vd-solid' } as const;

function toDrawing(view: RenderedView, ground = false): ViewDrawing {
  const { width: w, height: h } = view;
  return {
    width: w,
    height: h,
    layers: [
      // The isometric view stands on a soft patch of ground, as the hand-made one does.
      ...(ground
        ? [
            {
              part: 'body' as const,
              node: (
                <ellipse
                  key="g"
                  className="vd-ground"
                  cx={w / 2}
                  cy={h * 0.78}
                  rx={w * 0.46}
                  ry={h * 0.2}
                />
              ),
            },
          ]
        : []),
      ...view.faces.map((f, i) => ({
        part: f.part,
        node: <path key={`f${i}`} d={f.d} className={SHADE[f.shade]} />,
      })),
      ...view.lines.map((l, i) => ({
        part: l.part,
        node: <path key={`l${i}`} d={l.d} className="vd-decal" />,
      })),
    ],
  };
}

export const GENERATED: Record<string, Record<ViewName, ViewDrawing>> = Object.fromEntries(
  Object.entries(files).map(([path, views]) => [
    path.replace(/^.*\/(.+)\.json$/, '$1'),
    { top: toDrawing(views.top), side: toDrawing(views.side), iso: toDrawing(views.iso, true) },
  ]),
);
