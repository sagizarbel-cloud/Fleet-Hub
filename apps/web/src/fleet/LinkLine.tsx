import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { useHover } from './hover';

interface Geometry {
  id: string;
  d: string;
  end: { x: number; y: number };
}

function measure(eventId: string, serial: string): Geometry | null {
  const from = document
    .querySelector(`[data-event-id="${CSS.escape(eventId)}"]`)
    ?.getBoundingClientRect();
  const to = document.querySelector(`[data-tile="${CSS.escape(serial)}"]`)?.getBoundingClientRect();
  if (!from || !to || to.width === 0) return null;
  const toCenterX = to.left + to.width / 2;
  // Leave the event from the side that faces the tile, so the line works in both directions (RTL).
  const towardEnd = toCenterX > from.left + from.width / 2;
  const start = { x: towardEnd ? from.right : from.left, y: from.top + from.height / 2 };
  const end = { x: towardEnd ? to.left : to.right, y: to.top + to.height / 2 };
  const bend = Math.max(40, Math.abs(end.x - start.x) * 0.5) * (towardEnd ? 1 : -1);
  return {
    id: eventId,
    d: `M ${start.x} ${start.y} C ${start.x + bend} ${start.y}, ${end.x - bend} ${end.y}, ${end.x} ${end.y}`,
    end,
  };
}

/** While an event is hovered, an animated curve links it to its vehicle's tile. */
export function LinkLine() {
  const { event } = useHover();
  const [geo, setGeo] = useState<Geometry | null>(null);

  useEffect(() => {
    if (!event) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setGeo(measure(event.id, event.serial)));
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [event]);

  if (!geo || !event || geo.id !== event.id) return null;
  return (
    <svg
      aria-hidden
      className="pointer-events-none fixed inset-0 z-30 hidden h-full w-full lg:block"
      data-testid="link-line"
    >
      <motion.path
        key={event.id}
        d={geo.d}
        fill="none"
        stroke="var(--fh-accent)"
        strokeWidth={1.5}
        strokeLinecap="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 0.9 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      />
      <motion.circle
        key={`${event.id}-dot`}
        cx={geo.end.x}
        cy={geo.end.y}
        r={3.5}
        fill="var(--fh-accent)"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.25, duration: 0.15 }}
      />
    </svg>
  );
}
