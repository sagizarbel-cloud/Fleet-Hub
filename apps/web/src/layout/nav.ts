import { Gauge, Receipt, FileText, Settings, Table2, Wrench, type LucideIcon } from 'lucide-react';

export const AREAS = [
  'dashboard',
  'fleetTable',
  'receipts',
  'quotes',
  'equipment',
  'settings',
] as const;
export type Area = (typeof AREAS)[number];

export const AREA_ROUTES: Record<Area, { path: string; icon: LucideIcon }> = {
  dashboard: { path: '/', icon: Gauge },
  fleetTable: { path: '/fleet', icon: Table2 },
  receipts: { path: '/receipts', icon: Receipt },
  quotes: { path: '/quotes', icon: FileText },
  equipment: { path: '/equipment', icon: Wrench },
  settings: { path: '/settings', icon: Settings },
};
