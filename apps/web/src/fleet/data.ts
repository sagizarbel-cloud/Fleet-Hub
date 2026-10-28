import { useInfiniteQuery, useQuery, type InfiniteData } from '@tanstack/react-query';
import type { EventType, VehicleCategory, VehicleStatus } from '@fleet-hub/shared';
import { api } from '@/lib/api';

export interface FleetEvent {
  id: string;
  type: EventType;
  occurredAt: string;
  params: Record<string, unknown>;
  sourceType: string | null;
  sourceId: string | null;
  vehicle: { serial: string; type: string };
  /** Written by an Excel import. */
  imported?: boolean;
}
export interface EventPage {
  items: FleetEvent[];
  nextCursor: string | null;
}
export interface Tile {
  serial: string;
  licenseNo: string | null;
  status: VehicleStatus;
  make: string;
  model: string;
  nextServiceDate: string | null;
  type: string;
  category: VehicleCategory;
  department: string | null;
  location: string | null;
  openIssues: number;
}
export interface Dashboard {
  kpis: {
    status: Record<VehicleStatus, number>;
    dueWithin30Days: { service: number; annualTest: number; insurance: number; total: number };
    openMalfunctions: number;
    spendThisMonth: number;
  };
  tiles: Tile[];
  recent: EventPage;
}
export interface LookupItem {
  id: string;
  code: string;
  nameEn: string;
  nameHe: string;
}
export interface Lookups {
  departments: LookupItem[];
  locations: LookupItem[];
  vehicleTypes: (LookupItem & { category: VehicleCategory; usageUnit: string })[];
  fluidTypes: LookupItem[];
  receiptCategories: LookupItem[];
}

export const useDashboard = () =>
  useQuery({ queryKey: ['dashboard'], queryFn: () => api<Dashboard>('/dashboard') });

/** Lookup lists rarely change; one fetch per visit. */
export const useLookups = () =>
  useQuery({ queryKey: ['lookups'], queryFn: () => api<Lookups>('/lookups'), staleTime: Infinity });

/** Timeline pages. With no filter the first page comes from the dashboard response. */
export function useEvents(opts: { types?: EventType[]; vehicle?: string; first?: EventPage }) {
  const { types, vehicle, first } = opts;
  return useInfiniteQuery({
    queryKey: ['events', { types: types?.join(',') ?? '', vehicle: vehicle ?? '' }],
    initialPageParam: '',
    queryFn: ({ pageParam }) => {
      const qs = new URLSearchParams({ limit: '60' });
      if (pageParam) qs.set('cursor', pageParam);
      if (types?.length) qs.set('types', types.join(','));
      if (vehicle) qs.set('vehicle', vehicle);
      return api<EventPage>(`/events?${qs}`);
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    initialData: first
      ? ({ pages: [first], pageParams: [''] } satisfies InfiniteData<EventPage, string>)
      : undefined,
    enabled: !first,
  });
}

export function lookupName(item: LookupItem | undefined, lang: string): string | undefined {
  if (!item) return undefined;
  return lang === 'he' ? item.nameHe : item.nameEn;
}
