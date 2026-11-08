import { useEffect, useRef } from 'react';

const WORD = 'yard';
const TAPS = 5;
const TAP_WINDOW_MS = 2000;

/**
 * The easter egg that starts Yard play: five taps on the Fleet heading within two seconds, or
 * typing "yard" on the dashboard (outside any field). Returns the heading's click handler.
 */
export function useYardPlayTrigger({ allowed, start }: { allowed: boolean; start: () => void }) {
  const taps = useRef<number[]>([]);
  const startRef = useRef(start);
  useEffect(() => {
    startRef.current = start;
  });

  useEffect(() => {
    if (!allowed) return;
    let typed = '';
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (el?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (e.key.length !== 1) return;
      typed = (typed + e.key.toLowerCase()).slice(-WORD.length);
      if (typed === WORD) {
        typed = '';
        startRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [allowed]);

  return () => {
    if (!allowed) return;
    const now = Date.now();
    taps.current = [...taps.current.filter((at) => now - at < TAP_WINDOW_MS), now];
    if (taps.current.length >= TAPS) {
      taps.current = [];
      startRef.current();
    }
  };
}
