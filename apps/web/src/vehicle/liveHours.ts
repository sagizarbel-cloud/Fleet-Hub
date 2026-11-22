import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Engine hours from connected vehicles (2026-11-22): while a vehicle page is open, a live hour
 * meter reading for it refreshes the page's vehicle, so the vitals, callouts and "next service"
 * follow at once. No panel of its own; it rides the live fuel stream.
 */
export function useLiveHours(serial: string | null) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!serial || typeof EventSource === 'undefined') return;
    const es = new EventSource('/api/fuel/stream');
    let timer: number | undefined;
    es.addEventListener('hours', (e) => {
      const h = JSON.parse((e as MessageEvent<string>).data) as { serial: string };
      if (h.serial !== serial) return;
      // Readings can come in bursts; one refetch per second is enough.
      if (timer !== undefined) return;
      timer = window.setTimeout(() => {
        timer = undefined;
        void qc.invalidateQueries({ queryKey: ['vehicle', serial] });
      }, 1000);
    });
    return () => {
      window.clearTimeout(timer);
      es.close();
    };
  }, [serial, qc]);
}
