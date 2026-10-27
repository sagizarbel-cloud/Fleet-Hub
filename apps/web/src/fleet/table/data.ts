import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FleetViewSettings, RecordKind } from '@fleet-hub/shared';
import { api } from '@/lib/api';
import type { RecordRow } from '@/vehicle/records/api';
import type { FleetRow } from './model';

export interface SavedView {
  id: string;
  name: string;
  settings: FleetViewSettings;
  createdById: string | null;
  createdBy: string | null;
  canEdit: boolean;
  updatedAt: string;
}

const TABLE = ['fleet', 'table'] as const;
const VIEWS = ['fleet', 'views'] as const;

export const useFleetTable = () =>
  useQuery({
    queryKey: TABLE,
    queryFn: () => api<{ rows: FleetRow[] }>('/fleet/table').then((r) => r.rows),
  });

export const useSavedViews = () =>
  useQuery({
    queryKey: VIEWS,
    queryFn: () => api<{ items: SavedView[] }>('/fleet/views').then((r) => r.items),
  });

export function useSaveView() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id?: string; name: string; settings: FleetViewSettings }) =>
      api<SavedView>(id ? `/fleet/views/${id}` : '/fleet/views', {
        method: id ? 'PUT' : 'POST',
        json: body,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: VIEWS }),
  });
}

export function useDeleteView() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/fleet/views/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: VIEWS });
      // The server also drops it as anyone's default view.
      void qc.invalidateQueries({ queryKey: ['me', 'preferences'] });
    },
  });
}

/** Every record of one kind across the fleet, for the whole-fleet workbook. */
export const fetchFleetRecords = (kind: RecordKind) =>
  api<{ items: (RecordRow & { serial: string })[] }>(`/fleet/records/${kind}`).then((r) => r.items);
