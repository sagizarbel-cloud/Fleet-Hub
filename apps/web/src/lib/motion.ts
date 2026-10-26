import type { Transition } from 'motion/react';

/** Motion tokens. Springs for movement, ease-out for fades; animate only transform and opacity. */
export const spring = {
  snappy: { type: 'spring', stiffness: 520, damping: 38, mass: 0.8 },
  smooth: { type: 'spring', stiffness: 260, damping: 30 },
  gentle: { type: 'spring', stiffness: 140, damping: 22 },
} satisfies Record<string, Transition>;

export const fade = {
  fast: { duration: 0.15, ease: [0.22, 1, 0.36, 1] },
  base: { duration: 0.24, ease: [0.22, 1, 0.36, 1] },
} satisfies Record<string, Transition>;

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}
