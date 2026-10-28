import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import { cn } from '@/lib/cn';
import { anchorFor, CALLOUTS } from './callouts';
import type { VehicleDetail } from './data';
import { InfoValue } from './VitalsBar';
import { useVehicleInfo, type InfoKey } from './vitals';

const GAP = 28;
const LABEL_W = 168;
/** Room the labels need beside the drawing, on both sides together. */
export const CALLOUT_ROOM = 2 * (GAP + LABEL_W);
// Starts while the profile is still drawing, so the whole arrival stays within 1.2 s.
const DRAW_DELAY = 0.1;
const MIN_SPACING = 44;

interface Placed {
  key: InfoKey;
  n: number;
  ax: number;
  ay: number;
  left: boolean;
  ly: number;
}

/** Puts each callout's label on the side its anchor is nearest, level with its anchor. */
function place(type: string, keys: InfoKey[], w: number, h: number): Placed[] {
  const items = keys.map((key, i) => {
    const [x, y] = anchorFor(type, key);
    return { key, n: i + 1, ax: x * w, ay: y * h, left: x < 0.5 };
  });
  // At most two labels a side: move the one nearest the middle across.
  for (const side of [true, false]) {
    const mine = items.filter((p) => p.left === side);
    while (mine.length > 2 && items.filter((p) => p.left !== side).length < 2) {
      mine.sort((a, b) => Math.abs(b.ax - w / 2) - Math.abs(a.ax - w / 2));
      mine.pop()!.left = !side;
    }
  }
  const placed: Placed[] = [];
  for (const side of [true, false]) {
    // Each label sits level with its anchor where it can, at least MIN_SPACING apart.
    const mine = items.filter((p) => p.left === side).sort((a, b) => a.ay - b.ay);
    let floor = -Infinity;
    for (const p of mine) {
      const ly = Math.max(p.ay, floor + MIN_SPACING);
      floor = ly;
      placed.push({ ...p, ly });
    }
  }
  return placed;
}

function useCallouts(vehicle: VehicleDetail) {
  const info = useVehicleInfo(vehicle);
  // A callout with nothing to say (e.g. fuel on a trailer) is left out.
  return CALLOUTS.filter((key) => info(key).value !== null);
}

/**
 * Callout lines over the side drawing. Coordinates follow the drawing, which faces the same
 * way in both languages, so positions here are physical (left/right) on purpose.
 * Compact (phones): numbered dots only; the values are listed under the drawing.
 */
export function CalloutOverlay({
  vehicle,
  width,
  height,
  compact,
  reduced,
}: {
  vehicle: VehicleDetail;
  width: number;
  height: number;
  compact: boolean;
  reduced: boolean;
}) {
  const info = useVehicleInfo(vehicle);
  const keys = useCallouts(vehicle);
  const placed = place(vehicle.type, keys, width, height);
  const delay = (i: number) => (reduced ? 0 : DRAW_DELAY + i * 0.03);

  return (
    <div className="pointer-events-none absolute inset-0" data-testid="callouts">
      <svg
        className="absolute inset-0 overflow-visible"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        aria-hidden
      >
        {placed.map((p, i) => {
          const lx = p.left ? -GAP : width + GAP;
          const elbow = p.left ? lx + 14 : lx - 14;
          return (
            <g key={p.key}>
              {!compact && (
                <motion.path
                  d={`M${p.ax} ${p.ay}L${elbow} ${p.ly}L${lx} ${p.ly}`}
                  fill="none"
                  stroke="var(--fh-accent-ink)"
                  strokeWidth={1.25}
                  initial={reduced ? { opacity: 0 } : { pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ duration: 0.2, delay: delay(i), ease: 'easeOut' }}
                />
              )}
              <motion.g
                initial={{ opacity: 0, scale: 0.4 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.2, delay: delay(i) }}
                style={{ transformOrigin: `${p.ax}px ${p.ay}px` }}
              >
                <circle cx={p.ax} cy={p.ay} r={compact ? 8 : 3.5} fill="var(--fh-accent)" />
                {compact && (
                  <text
                    x={p.ax}
                    y={p.ay}
                    dy="0.35em"
                    textAnchor="middle"
                    className="num fill-[var(--fh-accent-contrast)] text-[10px] font-semibold"
                  >
                    {p.n}
                  </text>
                )}
              </motion.g>
            </g>
          );
        })}
      </svg>
      {!compact &&
        placed.map((p, i) => {
          const v = info(p.key);
          return (
            <motion.div
              key={p.key}
              data-callout={p.key}
              className={cn(
                'absolute w-[168px] -translate-y-1/2 leading-tight',
                p.left ? 'text-right' : 'text-left',
              )}
              style={{ top: p.ly, left: p.left ? -GAP - LABEL_W - 6 : width + GAP + 6 }}
              initial={{ opacity: 0, x: reduced ? 0 : p.left ? 8 : -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2, delay: delay(i) + 0.05 }}
            >
              <div className="text-muted truncate text-xs">{v.label}</div>
              {/* A code (VIN) runs left to right, so it loses its end, not its start, when cut. */}
              <div dir={v.ltr ? 'ltr' : undefined} className="truncate text-sm font-medium">
                <InfoValue info={v} />
              </div>
            </motion.div>
          );
        })}
    </div>
  );
}

/** Phone layout: the callout values as a numbered list under the drawing. */
export function CalloutLegend({ vehicle }: { vehicle: VehicleDetail }) {
  const { t } = useTranslation();
  const info = useVehicleInfo(vehicle);
  const keys = useCallouts(vehicle);
  return (
    <dl
      aria-label={t('vehicle.callouts')}
      className="relative grid grid-cols-2 gap-x-3 gap-y-2 px-3 pb-3"
      data-testid="callout-legend"
    >
      {keys.map((key, i) => {
        const v = info(key);
        return (
          <div key={key} className="flex min-w-0 items-start gap-2" data-callout={key}>
            <span
              aria-hidden
              className="bg-accent text-accent-contrast num mt-0.5 grid size-4 shrink-0 place-items-center rounded-full text-[10px] font-semibold"
            >
              {i + 1}
            </span>
            <div className="min-w-0">
              <dt className="text-muted truncate text-xs">{v.label}</dt>
              <dd
                dir={v.ltr ? 'ltr' : undefined}
                className={cn('truncate text-sm', v.ltr && 'rtl:text-right')}
              >
                <InfoValue info={v} />
              </dd>
            </div>
          </div>
        );
      })}
    </dl>
  );
}
