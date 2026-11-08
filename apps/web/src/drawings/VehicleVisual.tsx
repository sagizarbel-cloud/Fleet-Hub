import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import type { VehicleStatus } from '@fleet-hub/shared';
import { cn } from '@/lib/cn';
import type { ViewDrawing } from './model';
import { DEFAULT_ENGINE, drawingFor, type DrawingEngine } from './registry';
import { IsoDrawing } from './iso';
import './drawings.css';

export type VisualView = 'top' | 'side' | 'iso';

export const STATUS_VAR: Record<VehicleStatus, string> = {
  GREEN: 'var(--fh-ok)',
  AMBER: 'var(--fh-warn)',
  RED: 'var(--fh-bad)',
};

interface Props {
  type: string;
  /** An excavator's tool (Revisions 1); the bucket when absent. */
  tool?: string | null;
  view: VisualView;
  status: VehicleStatus;
  /** Rendered width in px. */
  size: number;
  /** Side profile draws itself (stroke animation) on mount. */
  draw?: boolean;
  /** Which drawings to use: the hand-made 2D ones, or the ones rendered from 3D models. */
  engine?: DrawingEngine;
  className?: string;
}

export function Layers({ drawing }: { drawing: ViewDrawing }) {
  return (
    <>
      {drawing.layers.map(({ part, node }, i) => (
        <g key={i} data-part={part} className="vd-part">
          {node}
        </g>
      ))}
    </>
  );
}

/** A vehicle's line drawing in top-down, side or isometric view, tinted by status. */
export function VehicleVisual({
  type,
  tool,
  view,
  status,
  size,
  draw = false,
  engine = DEFAULT_ENGINE,
  className,
}: Props) {
  const def = drawingFor(type, tool, engine);
  const svgRef = useRef<SVGSVGElement>(null);
  const style = { '--vd-color': STATUS_VAR[status] } as CSSProperties;

  // The draw-in animation needs every shape normalized to a path length of 1.
  useLayoutEffect(() => {
    if (!draw || !svgRef.current) return;
    svgRef.current
      .querySelectorAll('path, rect, circle, ellipse, line, polyline, polygon')
      .forEach((el) => {
        el.setAttribute('pathLength', '1');
      });
  }, [draw, type, tool, view]);

  if (view === 'iso' && !def.isoDrawing) {
    return (
      <div
        className={cn('vd relative', status === 'RED' && 'vd-red', className)}
        style={{ ...style, width: size }}
        data-status={status}
      >
        <div className="vd-glow" />
        <IsoDrawing
          solids={def.iso}
          size={size}
          className="relative block h-auto overflow-visible"
        />
      </div>
    );
  }

  const drawing = view === 'iso' ? def.isoDrawing! : view === 'top' ? def.top : def.side;
  return (
    <div
      className={cn('vd relative', status === 'RED' && 'vd-red', className)}
      style={{ ...style, width: size }}
      data-status={status}
    >
      <div className="vd-glow" />
      <svg
        ref={svgRef}
        viewBox={`0 0 ${drawing.width} ${drawing.height}`}
        className={cn('relative block h-auto w-full overflow-visible', draw && 'vd-draw')}
        style={{ '--vd-unit': drawing.width / size } as CSSProperties}
        aria-hidden
      >
        <Layers drawing={drawing} />
      </svg>
    </div>
  );
}
