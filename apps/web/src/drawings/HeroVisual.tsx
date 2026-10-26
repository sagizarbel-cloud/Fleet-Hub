import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import { motion } from 'motion/react';
import type { VehicleStatus } from '@fleet-hub/shared';
import { cn } from '@/lib/cn';
import { PAINT_ORDER, type PartName, type ViewDrawing } from './model';
import { drawingFor } from './registry';
import { STATUS_VAR } from './VehicleVisual';
import './drawings.css';

/** Which pose the hero is in: flat top-down (as in the grid), tilted isometric, or side profile. */
export type HeroPose = 'flat' | 'iso' | 'side';

interface Props {
  type: string;
  status: VehicleStatus;
  pose: HeroPose;
  /** Height of the flat top-down drawing in px; the stage is a square of this size. */
  size: number;
  className?: string;
}

const TILT = { duration: 0.4, ease: [0.22, 1, 0.36, 1] } as const;

function Part({ drawing, part }: { drawing: ViewDrawing; part: PartName }) {
  return (
    <g data-part={part} className="vd-part">
      {drawing.parts[part]}
    </g>
  );
}

/**
 * The vehicle on the detail stage. One element moves through every pose, so the
 * selection transition can tilt it, turn it into the side profile, and play it back.
 *
 * Later (Phase 7): when a vehicle has a top and side photo, this slot crossfades
 * those instead of the drawings; vehicles without photos keep the drawing.
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
      <motion.div
        className="vd-iso-stage absolute inset-0"
        initial={false}
        animate={{ opacity: pose === 'side' ? 0 : 1 }}
        transition={{ duration: 0.3 }}
        style={{ perspective: size * 4 }}
      >
        <motion.div
          className="relative"
          style={{ width, height: size, transformStyle: 'preserve-3d' }}
          initial={false}
          animate={
            tilted
              ? { rotateX: 58, rotateZ: -45, scale: 0.78 }
              : { rotateX: 0, rotateZ: 0, scale: 1 }
          }
          transition={TILT}
        >
          <svg
            viewBox={`0 0 ${top.width} ${top.height}`}
            className="vd-shadow"
            style={{ '--vd-unit': top.width / width } as CSSProperties}
            aria-hidden
          >
            <rect x="8" y="8" width={top.width - 16} height={top.height - 16} rx="18" />
          </svg>
          {PAINT_ORDER.filter((p) => top.parts[p]).map((p) => (
            <motion.svg
              key={p}
              viewBox={`0 0 ${top.width} ${top.height}`}
              className="vd-layer"
              style={{ '--vd-unit': top.width / width } as CSSProperties}
              initial={false}
              animate={{ z: tilted ? (def.lift[p] ?? 0) * width * 1.6 : 0 }}
              transition={TILT}
              aria-hidden
            >
              <Part drawing={top} part={p} />
            </motion.svg>
          ))}
        </motion.div>
      </motion.div>
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
