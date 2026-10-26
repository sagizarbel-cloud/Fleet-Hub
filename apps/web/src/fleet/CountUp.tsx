import { useEffect, useRef } from 'react';
import { animate } from 'motion/react';
import { prefersReducedMotion } from '@/lib/motion';

/** A number that counts up from zero when it appears. Writes text directly, so it never re-renders. */
export function CountUp({
  value,
  delay = 0,
  className,
}: {
  value: number;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) {
      el.textContent = String(value);
      return;
    }
    const controls = animate(0, value, {
      duration: 0.5,
      delay,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => (el.textContent = String(Math.round(v))),
    });
    return () => controls.stop();
  }, [value, delay]);
  return (
    <span ref={ref} className={className}>
      {value}
    </span>
  );
}
