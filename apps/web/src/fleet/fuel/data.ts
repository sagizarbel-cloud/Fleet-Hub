import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FuelLevelBody, FuelLevelSource, VehicleStatus } from '@fleet-hub/shared';
import { api } from '@/lib/api';

export interface FuelLevel {
  pct: number | null;
  liters: number | null;
  at: string;
  source: FuelLevelSource;
}
export interface FuelRow {
  serial: string;
  make: string;
  model: string;
  status: VehicleStatus;
  type: string;
  location: string | null;
  /** A connection reports for this vehicle on its own. */
  connected: boolean;
  level: FuelLevel | null;
}

const KEY = ['fuel'] as const;

export const useFuel = () => useQuery({ queryKey: KEY, queryFn: () => api<FuelRow[]>('/fuel') });

export type StreamState = 'connecting' | 'open' | 'down';

/**
 * Keeps the fuel list live while mounted: each level the server pushes replaces that vehicle's
 * row at once. After a dropped connection the list is fetched again, so nothing is missed.
 * Returns whether the live link is up, and a clock that ticks every 30 s (and on each reading)
 * so ages and "stale" stay true.
 */
export function useFuelStream() {
  const qc = useQueryClient();
  const [state, setState] = useState<StreamState>(() =>
    typeof EventSource === 'undefined' ? 'down' : 'connecting',
  );
  const [now, setNow] = useState(Date.now);
  const [updated, setUpdated] = useState<{ serial: string; n: number } | null>(null);

  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    const es = new EventSource('/api/fuel/stream');
    let opened = false;
    let n = 0;
    es.onopen = () => {
      setState('open');
      // A reconnect: catch up on what came in while away.
      if (opened) void qc.invalidateQueries({ queryKey: KEY });
      opened = true;
    };
    es.onerror = () => setState(es.readyState === EventSource.CLOSED ? 'down' : 'connecting');
    es.addEventListener('level', (e) => {
      const level = JSON.parse((e as MessageEvent<string>).data) as FuelLevel & { serial: string };
      const { serial, ...rest } = level;
      qc.setQueryData<FuelRow[]>(KEY, (rows) =>
        rows?.map((r) => (r.serial === serial ? { ...r, level: rest } : r)),
      );
      setUpdated({ serial, n: ++n });
      setNow(Date.now());
    });
    const tick = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      es.close();
      window.clearInterval(tick);
    };
  }, [qc]);

  return { state, updated, now };
}

export function useSetFuel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ serial, body }: { serial: string; body: FuelLevelBody }) =>
      api(`/fuel/${encodeURIComponent(serial)}`, { method: 'PUT', json: body }),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: KEY }),
        // The dashboard carries the timeline's first page.
        qc.invalidateQueries({ queryKey: ['dashboard'], exact: true }),
        qc.invalidateQueries({ queryKey: ['events'] }),
        qc.invalidateQueries({ queryKey: ['vehicle'] }),
      ]),
  });
}
