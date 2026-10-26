// Plain constants only (no zod), so the web bundle can import them without pulling in zod.

/** Vitals a user can pin in the vehicle header (SPEC A6). The first six are pinned by default. */
export const VITAL_KEYS = [
  'status',
  'usage',
  'nextService',
  'annualTest',
  'location',
  'department',
  'insurance',
  'safetyCheck',
  'operator',
  'makeModelYear',
  'openMalfunctions',
  'fuelEconomy',
  'maintenanceCostYtd',
  'purchaseWarranty',
  'lastActivity',
] as const;
export type VitalKey = (typeof VITAL_KEYS)[number];
export const DEFAULT_PINNED_VITALS: VitalKey[] = [
  'status',
  'usage',
  'nextService',
  'annualTest',
  'location',
  'department',
];

export const DETAIL_VIEWS = ['side', 'iso'] as const;
export type DetailView = (typeof DETAIL_VIEWS)[number];
