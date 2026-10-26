import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import { motion } from 'motion/react';
import type { VehicleStatus } from '@fleet-hub/shared';
import { cn } from '@/lib/cn';
import { IsoDrawing } from './iso';
import { PAINT_ORDER, type PartName, type ViewDrawing } from './model';
import { drawingFor } from './registry';
import { STATUS_VAR } from './VehicleVisual';
import './drawings.css';

/** Which pose the hero is in: flat top-down (as in the grid), isometric, or side profile. */
export type HeroPose = 'flat' | 'iso' | 'side';

interface Props {
  type: string;
  status: VehicleStatus;
  pose: HeroPose;
  /** Height of the flat top-down drawing in px; the stage is a square of this size. */
  size: number;
  className?: string;
}

const EASE = [0.22, 1, 0.36, 1] as const;
const TILT = { duration: 0.4, ease: EASE };
// Rotating the top view (front up) by 135° points the front down-right, as in the isometric
// drawing; tipping it back by 54.74° gives the true isometric 30° ground lines.
const ISO_TILT = { rotateX: 54.74, rotateZ: 135 };

function Part({ drawing, part }: { drawing: ViewDrawing; part: PartName }) {
  return (
    <g data-part={part} className="vd-part">
      {drawing.parts[part]}
    </g>
  );
}

/**
 * The vehicle on the detail stage. One element moves through every pose: the flat top view
 * tilts toward isometric and hands over to the 3D isometric drawing, which can then turn
 * into the side profile; Back plays it all in reverse.
 *
 * Later (Phase 7): when a vehicle has a top and side photo, this slot crossfades those
 * instead of the drawings; vehicles without photos keep the drawing.
 */
export function HeroVisual({ type, status, pose, size, className }: Props) {
  const def = drawingFor(type);
  const { top, side } = def;
  const width = (size * top.width) / top.height;
  const tilted = pose !== 'flat';
  const sideWidth = Math.min(
    size * 1.35,
    (size * 0.9 * side.width) / side.height,
    typeof window === 'undefined' ? Infinity : window.innerWidth - 40,
  );
  const isoWidth = Math.min(
    size * 1.25,
    typeof window === 'undefined' ? Infinity : window.innerWidth - 40,
  );
  const sideRef = useRef<SVGSVGElement>(null);

  useLayoutEffect(() => {
    sideRef.current
      ?.querySelectorAll('path, rect, circle, ellipse, line, polyline, polygon')
      .forEach((el) => el.setAttribute('pathLength', '1'));
  }, [type, pose]);

  return (
    <div
      className={cn('vd relative grid place-items-center', status === 'RED' && 'vd-red', className)}
      style={{ '--vd-color': STATUS_VAR[status], width: size, height: size } as CSSProperties}
      data-status={status}
      data-pose={pose}
    >
      <div className="vd-glow" />
      {/* Flat top view: tilts toward isometric, then fades as the 3D drawing takes over. */}
      <div className="absolute inset-0 grid place-items-center" style={{ perspective: size * 4 }}>
        <motion.svg
          viewBox={`0 0 ${top.width} ${top.height}`}
          className="relative block overflow-visible"
          style={{ width, height: size, '--vd-unit': top.width / width } as CSSProperties}
          initial={false}
          animate={
            tilted
              ? { ...ISO_TILT, scale: 0.85, opacity: 0 }
              : { rotateX: 0, rotateZ: 0, scale: 1, opacity: 1 }
          }
          transition={{
            ...TILT,
            opacity: tilted ? { duration: 0.15, delay: 0.25 } : { duration: 0.15 },
          }}
          aria-hidden
        >
          {PAINT_ORDER.filter((p) => top.parts[p]).map((p) => (
            <Part key={p} drawing={top} part={p} />
          ))}
        </motion.svg>
      </div>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <motion.div
          className="shrink-0"
          initial={false}
          animate={pose === 'iso' ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.96 }}
          transition={
            pose === 'iso' ? { duration: 0.2, delay: 0.22, ease: EASE } : { duration: 0.15 }
          }
        >
          <IsoDrawing solids={def.iso} size={isoWidth} className="block h-auto overflow-visible" />
        </motion.div>
      </div>
      {pose === 'side' && (
        // Flex centers the profile even when it is wider than the square stage.
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.svg
            ref={sideRef}
            viewBox={`0 0 ${side.width} ${side.height}`}
            className="vd-draw relative block h-auto shrink-0 overflow-visible"
            // Draws faster than on the review page, so the whole transition fits in 1.2 s.
            style={
              {
                width: sideWidth,
                '--vd-unit': side.width / sideWidth,
                '--vd-draw-duration': '0.45s',
                '--vd-fill-delay': '0.25s',
                '--vd-fill-duration': '0.2s',
              } as CSSProperties
            }
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
            aria-hidden
          >
            {PAINT_ORDER.filter((p) => side.parts[p]).map((p) => (
              <Part key={p} drawing={side} part={p} />
            ))}
          </motion.svg>
        </div>
      )}
    </div>
  );
}
