import { z } from 'zod';

/**
 * Wiggle test (Sagi, 2026-11-08): a quick V / X check of a heavy machine's steering, cameras,
 * LiDARs and communications, with an optional note at the end. Only heavy machinery takes it;
 * which vehicle types do, and with which checklist, is an admin setting (`wiggleTypes`).
 */
export const WIGGLE_PROFILES = ['loader', 'excavator', 'wheeledExcavator', 'skidSteer'] as const;
export type WiggleProfile = (typeof WIGGLE_PROFILES)[number];

/** Steering differs by machine: articulated loaders, tracked excavators, wheeled ones, skid steers. */
export const WIGGLE_STEERING = {
  loader: ['articulation', 'steeringCylinders', 'steeringResponse'],
  excavator: ['tracksTravel', 'swing', 'undercarriage'],
  wheeledExcavator: ['steeringResponse', 'axles', 'swing'],
  skidSteer: ['driveSides', 'wheels'],
} as const satisfies Record<WiggleProfile, readonly string[]>;

/** The same on every machine. */
export const WIGGLE_SYSTEMS = ['cameras', 'lidars', 'communications'] as const;

export const isWiggleProfile = (v: unknown): v is WiggleProfile =>
  typeof v === 'string' && (WIGGLE_PROFILES as readonly string[]).includes(v);

/** Every item any checklist can have, in display order. */
export const WIGGLE_ITEMS = [
  'articulation',
  'steeringCylinders',
  'steeringResponse',
  'tracksTravel',
  'driveSides',
  'axles',
  'wheels',
  'undercarriage',
  'swing',
  ...WIGGLE_SYSTEMS,
] as const;
export type WiggleItem = (typeof WIGGLE_ITEMS)[number];

/** A profile's whole checklist: its steering items, then the systems. */
export function wiggleItems(profile: WiggleProfile): WiggleItem[] {
  return [...WIGGLE_STEERING[profile], ...WIGGLE_SYSTEMS];
}

/** Heavy machinery by default: loaders, excavators and skid steers. */
export const DEFAULT_WIGGLE_TYPES: Record<string, WiggleProfile> = {
  wheel_loader: 'loader',
  tracked_excavator: 'excavator',
  wheeled_excavator: 'wheeledExcavator',
  skid_steer: 'skidSteer',
};

export const wiggleTypesSchema = z
  .record(z.string().min(1).max(40), z.enum(WIGGLE_PROFILES))
  .refine((m) => Object.keys(m).length <= 100);

/** The checklist a vehicle type takes, or null when it takes no wiggle test. */
export function wiggleProfileOf(
  types: Record<string, WiggleProfile>,
  typeCode: string | null | undefined,
): WiggleProfile | null {
  return (typeCode && types[typeCode]) || null;
}

export const WIGGLE_RESULTS = ['PASS', 'FAIL'] as const;
export type WiggleResult = (typeof WIGGLE_RESULTS)[number];

/**
 * A wiggle test as the form sends it. The server checks that every item of the vehicle's
 * checklist has an answer; the date is when it is saved.
 */
export const wiggleTestBody = z.object({
  results: z
    .partialRecord(z.enum(WIGGLE_ITEMS), z.enum(WIGGLE_RESULTS))
    .refine((r) => Object.keys(r).length > 0, { message: 'required' }),
  notes: z
    .string()
    .trim()
    .max(2000)
    .nullable()
    .default(null)
    .transform((v) => (v ? v : null)),
});
export type WiggleTestInput = z.output<typeof wiggleTestBody>;

/** The items of `profile` this input leaves unanswered, and items it answers that aren't on it. */
export function wiggleProblems(profile: WiggleProfile, results: Partial<Record<string, string>>) {
  const items = wiggleItems(profile);
  return {
    missing: items.filter((i) => !results[i]),
    extra: Object.keys(results).filter((k) => !(items as string[]).includes(k)),
  };
}

/** The items marked X, in checklist order. */
export function wiggleFailed(results: Partial<Record<string, string>>): WiggleItem[] {
  return WIGGLE_ITEMS.filter((i) => results[i] === 'FAIL');
}
