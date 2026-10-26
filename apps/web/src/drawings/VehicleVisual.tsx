import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import type { VehicleStatus } from '@fleet-hub/shared';
import { cn } from '@/lib/cn';
import { PAINT_ORDER, type ViewDrawing } from './model';
import { drawingFor } from './registry';
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
  view: VisualView;
  status: VehicleStatus;
  /** Rendered width in px. */
  size: number;
  /** Side profile draws itself (stroke animation) on mount. */
  draw?: boolean;
  className?: string;
}

function Parts({ drawing, only }: { drawing: ViewDrawing; only?: (typeof PAINT_ORDER)[number] }) {
  return (
    <>
      {PAINT_ORDER.filter((p) => drawing.parts[p] && (!only || p === only)).map((p) => (
        <g key={p} data-part={p} className="vd-part">
          {drawing.parts[p]}
        </g>
      ))}
    </>
  );
}

/** A vehicle's line drawing in top-down, side or isometric view, tinted by status. */
export function VehicleVisual({ type, view, status, size, draw = false, className }: Props) {
  const def = drawingFor(type);
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
  }, [draw, type, view]);

  if (view === 'iso') {
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

  const drawing = view === 'top' ? def.top : def.side;
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
        <Parts drawing={drawing} />
      </svg>
    </div>
  );
}
