import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DetailView, VehicleCategory, VehicleStatus, VitalKey } from '@fleet-hub/shared';
import { api } from '@/lib/api';

export interface AssignedItem {
  id: string;
  kind: string;
  name: string;
  model: string | null;
  spec: string | null;
  serial: string | null;
  assignedSince: string | null;
}

/** GET /api/vehicles/:serial. Never carries the start code itself, only `hasStartCode`. */
export interface VehicleDetail {
  serial: string;
  vin: string | null;
  licenseNo: string | null;
  make: string;
  model: string;
  year: number | null;
  operatorName: string | null;
  odometerKm: number | null;
  engineHours: number | null;
  nextServiceKm: number | null;
  nextServiceHours: number | null;
  nextServiceDate: string | null;
  readinessPct: number;
  annualTestExpiry: string | null;
  insuranceExpiry: string | null;
  safetyCheckExpiry: string | null;
  status: VehicleStatus;
  statusOverride: VehicleStatus | null;
  statusOverrideReason: string | null;
  hasStartCode: boolean;
  /** Photo style and custom drawing (SPEC A4): attachment ids, or null for the built-in drawing. */
  topPhotoId: string | null;
  sidePhotoId: string | null;
  customImageId: string | null;
  purchaseDate: string | null;
  purchasePrice: number | null;
  supplier: string | null;
  warrantyTerms: string | null;
  warrantyExpiry: string | null;
  type: string;
  category: VehicleCategory;
  usageUnit: 'KM' | 'HOURS';
  department: string | null;
  location: string | null;
  computed: {
    openMalfunctions: number;
    fuelEconomy30d: { value: number; unit: 'KM_PER_L' | 'L_PER_HOUR' } | null;
    maintenanceCostYtd: number;
    lastActivity: string | null;
    lastFuel: { date: string; liters: number } | null;
    lastMovement: { date: string; to: string } | null;
  };
  counts: {
    service: number;
    malfunctions: number;
    malfunctionsOpen: number;
    fluids: number;
    fuel: number;
    movements: number;
    inspections: number;
    nextInspection: {
      validUntil: string;
      kind: 'ANNUAL_TEST' | 'INSURANCE' | 'SAFETY_CHECK';
    } | null;
    documents: number;
    quotes: number;
    notes: number;
  };
  items: AssignedItem[];
}

export interface Preferences {
  pinnedVitals: VitalKey[];
  detailView: DetailView;
  fleetViewId: string | null;
  /** Null: follow this device's own choice. */
  language: 'en' | 'he' | null;
  theme: 'dark' | 'light' | null;
}

const vehicleKey = (serial: string) => ['vehicle', serial] as const;
const PREFS = ['me', 'preferences'] as const;

export const useVehicle = (serial: string, enabled = true) =>
  useQuery({
    queryKey: vehicleKey(serial),
    queryFn: () => api<VehicleDetail>(`/vehicles/${encodeURIComponent(serial)}`),
    enabled,
  });

export const usePreferences = () =>
  useQuery({
    queryKey: PREFS,
    queryFn: () => api<Preferences>('/me/preferences'),
    staleTime: Infinity,
  });

/** Saves preferences, showing the change at once and rolling back if the save fails. */
export function useSavePreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Preferences>) =>
      api<Preferences>('/me/preferences', { method: 'PUT', json: body }),
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: PREFS });
      const previous = qc.getQueryData<Preferences>(PREFS);
      if (previous) qc.setQueryData(PREFS, { ...previous, ...body });
      return { previous };
    },
    onError: (_err, _body, ctx) => {
      if (ctx?.previous) qc.setQueryData(PREFS, ctx.previous);
    },
    onSuccess: (saved) => qc.setQueryData(PREFS, saved),
  });
}

/** Reveals a start code. The answer is never cached: each reveal is a new, audited request. */
export const useRevealStartCode = (serial: string) =>
  useMutation({
    mutationFn: () =>
      api<{ code: string }>(`/vehicles/${encodeURIComponent(serial)}/start-code/reveal`, {
        method: 'POST',
      }),
  });

export const useUnassignedItems = (enabled: boolean) =>
  useQuery({
    queryKey: ['items', 'unassigned'],
    queryFn: () => api<{ items: Omit<AssignedItem, 'assignedSince'>[] }>('/items/unassigned'),
    enabled,
  });

/** Assign or remove an item; refreshes the vehicle, its activity and the free-items list. */
export function useItemAction(serial: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'assign' | 'remove' }) =>
      api<{ ok: true }>(`/items/${encodeURIComponent(id)}/${action}`, {
        method: 'POST',
        json: action === 'assign' ? { vehicle: serial } : {},
      }),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: vehicleKey(serial) }),
        qc.invalidateQueries({ queryKey: ['items'] }),
        qc.invalidateQueries({ queryKey: ['events'] }),
        qc.invalidateQueries({ queryKey: ['dashboard'] }),
      ]),
  });
}
