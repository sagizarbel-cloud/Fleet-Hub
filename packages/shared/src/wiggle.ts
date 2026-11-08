import { z } from 'zod';

/**
 * Wiggle test (Sagi, 2026-11-08): a quick pass / fail check of a heavy machine, with an optional
 * note at the end. Only heavy machinery takes it; which vehicle types do, and with which
 * checklist, is an admin setting (`wiggleTypes`). Round 2 (Sagi, same day): one steering item,
 * a camera per side and the cab on loaders, a front-down camera on excavators, IMUs, signal and
 * instruments in place of "communications", and fluids, mechanical and hydraulic tools.
 */
export const WIGGLE_PROFILES = ['loader', 'excavator', 'wheeledExcavator', 'skidSteer'] as const;
export type WiggleProfile = (typeof WIGGLE_PROFILES)[number];

export const isWiggleProfile = (v: unknown): v is WiggleProfile =>
  typeof v === 'string' && (WIGGLE_PROFILES as readonly string[]).includes(v);

/** Cameras differ by machine; the rest of the list is the same on every heavy machine. */
export const WIGGLE_CAMERAS = {
  loader: ['cameraFront', 'cameraBack', 'cameraLeft', 'cameraRight', 'cameraCab'],
  excavator: ['cameras', 'cameraFrontDown'],
  wheeledExcavator: ['cameras', 'cameraFrontDown'],
  skidSteer: ['cameras'],
} as const satisfies Record<WiggleProfile, readonly string[]>;

/** Every item any checklist can have, in display order. */
export const WIGGLE_ITEMS = [
  'steering',
  'cameraFront',
  'cameraBack',
  'cameraLeft',
  'cameraRight',
  'cameraCab',
  'cameras',
  'cameraFrontDown',
  'lidars',
  'imus',
  'signal',
  'instruments',
  'fluids',
  'mechanical',
  'hydraulicTools',
] as const;
export type WiggleItem = (typeof WIGGLE_ITEMS)[number];

/** The groups the form shows, in order. */
export const WIGGLE_GROUPS = ['steering', 'cameras', 'sensors', 'machine'] as const;
export type WiggleGroup = (typeof WIGGLE_GROUPS)[number];

/** The items of one group of `profile`'s checklist. */
export function wiggleGroupItems(profile: WiggleProfile, group: WiggleGroup): WiggleItem[] {
  switch (group) {
    case 'steering':
      return ['steering'];
    case 'cameras':
      return [...WIGGLE_CAMERAS[profile]];
    case 'sensors':
      return ['lidars', 'imus', 'signal', 'instruments'];
    case 'machine':
      return ['fluids', 'mechanical', 'hydraulicTools'];
  }
}

/** A profile's whole checklist, in form order. */
export function wiggleItems(profile: WiggleProfile): WiggleItem[] {
  return WIGGLE_GROUPS.flatMap((g) => wiggleGroupItems(profile, g));
}

/**
 * How an item's two answers read. Most are V / X; fluids are full or missing, mechanical and
 * hydraulic tools functional or requiring attention. Stored as PASS / FAIL either way.
 */
export type WiggleScale = 'vx' | 'fluid' | 'condition';
export const wiggleScale = (item: WiggleItem): WiggleScale =>
  item === 'fluids'
    ? 'fluid'
    : item === 'mechanical' || item === 'hydraulicTools'
      ? 'condition'
      : 'vx';

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
