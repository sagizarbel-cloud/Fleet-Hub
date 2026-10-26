// Plain constants only (no zod), so the web bundle can import them without pulling in zod.

/** Column groups of the fleet table, in order (SPEC 5.4). */
export const FLEET_GROUPS = [
  'identity',
  'status',
  'usage',
  'maintenance',
  'compliance',
  'ownership',
  'equipment',
  'costs',
] as const;
export type FleetGroup = (typeof FLEET_GROUPS)[number];

/**
 * Every column the fleet table can show, by group. The serial is the sticky first column
 * and is always shown, so it is not listed here. The first column of each group is the one
 * a collapsed group keeps.
 */
export const FLEET_COLUMNS = {
  identity: [
    'type',
    'make',
    'model',
    'year',
    'vin',
    'licenseNo',
    'department',
    'location',
    'operator',
  ],
  status: ['status', 'readiness', 'openIssues', 'lastActivity'],
  usage: ['usage', 'economy30', 'lastFuel'],
  maintenance: ['nextService', 'lastService', 'services12m'],
  compliance: ['nextExpiry', 'annualTest', 'insurance', 'safetyCheck'],
  ownership: ['warrantyExpiry', 'purchaseDate', 'supplier', 'purchasePrice'],
  equipment: ['items'],
  costs: ['total12m', 'maintenance12m', 'fuel12m', 'total3m', 'maintenance3m', 'fuel3m'],
} as const satisfies Record<FleetGroup, readonly string[]>;
export type FleetColumn = (typeof FLEET_COLUMNS)[FleetGroup][number];
export const ALL_FLEET_COLUMNS = FLEET_GROUPS.flatMap((g) => FLEET_COLUMNS[g]) as FleetColumn[];

export const FLEET_GROUP_BY = ['none', 'type', 'department'] as const;
export type FleetGroupBy = (typeof FLEET_GROUP_BY)[number];

/** Days ahead that count as "due soon" for the filter and the countdown colours. */
export const DUE_SOON_DAYS = 30;

export interface FleetSort {
  id: FleetColumn | 'serial';
  desc: boolean;
}

/** Everything a saved view remembers. */
export interface FleetViewSettings {
  columns: FleetColumn[];
  collapsed: FleetGroup[];
  sort: FleetSort[];
  groupBy: FleetGroupBy;
  q: string;
  status: string[];
  types: string[];
  departments: string[];
  locations: string[];
  /** Only vehicles with a service or an expiry within DUE_SOON_DAYS (or overdue). */
  due: boolean;
  /** Only vehicles with open malfunctions. */
  issues: boolean;
}

/** The built-in "All vehicles" view. */
export const DEFAULT_FLEET_VIEW: FleetViewSettings = {
  columns: [
    'type',
    'make',
    'model',
    'licenseNo',
    'department',
    'location',
    'status',
    'readiness',
    'openIssues',
    'usage',
    'nextService',
    'nextExpiry',
    'annualTest',
    'insurance',
    'safetyCheck',
    'total12m',
  ],
  collapsed: [],
  sort: [{ id: 'serial', desc: false }],
  groupBy: 'none',
  q: '',
  status: [],
  types: [],
  departments: [],
  locations: [],
  due: false,
  issues: false,
};
