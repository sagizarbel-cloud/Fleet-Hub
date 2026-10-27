import { z } from 'zod';
import { ROLES, VEHICLE_CATEGORIES } from './enums';

// ---------- Settings lists (SPEC 5.9) ----------

/** The bilingual lists editors and admins manage in Settings. */
export const LOOKUP_KINDS = [
  'departments',
  'locations',
  'vehicleTypes',
  'fluidTypes',
  'receiptCategories',
] as const;
export type LookupKind = (typeof LOOKUP_KINDS)[number];

const name = z.string().trim().min(1).max(80);
/** Lower-case latin letters, digits and underscores: stable ids used in URLs, exports and imports. */
export const lookupCode = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z][a-z0-9_]{0,39}$/, 'code');

export const lookupParams = z.object({ kind: z.enum(LOOKUP_KINDS) });
export const lookupItemParams = lookupParams.extend({ id: z.string().min(1).max(40) });

export const lookupBody = z.object({
  code: lookupCode,
  nameEn: name,
  nameHe: name,
  /** Hidden values stay on the records that use them but can't be picked for new ones. */
  active: z.boolean().default(true),
  /** Vehicle types only. */
  category: z.enum(VEHICLE_CATEGORIES).optional(),
  usageUnit: z.enum(['KM', 'HOURS']).optional(),
});
export type LookupBody = z.input<typeof lookupBody>;

/** A new order for a whole list: ids, first to last. */
export const lookupOrderBody = z.object({
  ids: z.array(z.string().min(1).max(40)).min(1).max(500),
});

// ---------- Users (admin) and passwords ----------

/** At least 10 characters: long enough that the rate-limited login can't be guessed through. */
export const password = z.string().min(10, 'tooShort').max(200);

export const userBody = z.object({
  email: z
    .email()
    .max(254)
    .transform((e) => e.toLowerCase()),
  name: z.string().trim().min(1).max(120),
  role: z.enum(ROLES),
  canViewStartCodes: z.boolean().default(false),
});
export type UserBody = z.input<typeof userBody>;

export const userUpdateBody = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  role: z.enum(ROLES).optional(),
  canViewStartCodes: z.boolean().optional(),
  /** Turned off users can't sign in and lose their sessions; they stay on the history. */
  active: z.boolean().optional(),
});

export const changePasswordBody = z.object({
  current: z.string().min(1).max(200),
  next: password,
});

export const resetPasswordBody = z.object({
  token: z.string().min(20).max(200),
  password,
});

/** How long an admin's reset link works. */
export const RESET_LINK_HOURS = 24;

// ---------- Add / edit vehicle (SPEC 5.8) ----------

/** ISO 3779: 17 characters, letters and digits without I, O and Q. */
export const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;
/** Israeli plates: 7 digits (12-345-67) or 8 digits (123-45-678). Stored as digits only. */
export const PLATE_PATTERN = /^\d{7,8}$/;

/** Digits only, so "12-345-67" and "1234567" are the same plate. */
export const normalizePlate = (s: string) => s.replace(/[\s.-]/g, '');

const DAY_MS = 86_400_000;
const date = z.coerce
  .date()
  .nullish()
  .transform((v) => v ?? null);
const count = z
  .number()
  .int()
  .min(0)
  .max(100_000_000)
  .nullish()
  .transform((v) => v ?? null);
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));
const code = z
  .string()
  .min(1)
  .max(40)
  .nullish()
  .transform((v) => v ?? null);

/**
 * Every field of the stepper. VIN rules depend on the type's category (road vehicles need a
 * real VIN, machines a free-text PIN), so `category` comes along from the chosen type.
 */
export const vehicleBody = z
  .object({
    /** A vehicle-type code from Settings; the API fills `category` from it. */
    type: z.string().min(1).max(40),
    category: z.enum(VEHICLE_CATEGORIES),
    serial: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9][A-Z0-9-]{0,39}$/, 'serial'),
    vin: optText(40).transform((v) => (v ? v.toUpperCase().replace(/\s/g, '') : null)),
    licenseNo: optText(20).transform((v) => (v ? normalizePlate(v) : null)),
    make: z.string().trim().min(1).max(60),
    model: z.string().trim().min(1).max(60),
    year: z
      .number()
      .int()
      .min(1950)
      .max(new Date().getFullYear() + 1)
      .nullish()
      .transform((v) => v ?? null),
    department: code,
    location: code,
    operatorName: optText(120),
    odometerKm: count,
    engineHours: count,
    nextServiceDate: date,
    nextServiceKm: count,
    nextServiceHours: count,
    annualTestExpiry: date,
    insuranceExpiry: date,
    safetyCheckExpiry: date,
    purchaseDate: date,
    purchasePrice: z
      .number()
      .min(0)
      .max(100_000_000)
      .nullish()
      .transform((v) => v ?? null),
    warrantyTerms: optText(500),
    warrantyExpiry: date,
    /**
     * Start code: absent = unchanged, null = remove, text = set. Only users with the
     * start-code permission may send it.
     */
    startCode: z.string().trim().min(1).max(40).nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.category === 'ROAD' && v.vin && !VIN_PATTERN.test(v.vin))
      ctx.addIssue({ code: 'custom', path: ['vin'], message: 'vin' });
    if (v.licenseNo && !PLATE_PATTERN.test(v.licenseNo))
      ctx.addIssue({ code: 'custom', path: ['licenseNo'], message: 'plate' });
    if (v.purchaseDate && v.purchaseDate.getTime() > Date.now() + DAY_MS)
      ctx.addIssue({ code: 'custom', path: ['purchaseDate'], message: 'future' });
  });
export type VehicleBody = z.input<typeof vehicleBody>;
export type VehicleInput = z.output<typeof vehicleBody>;

/** Vehicle fields a VEHICLE_UPDATED event can name (start codes are logged without a value). */
export const VEHICLE_FIELDS = [
  'type',
  'serial',
  'vin',
  'licenseNo',
  'make',
  'model',
  'year',
  'department',
  'location',
  'operatorName',
  'odometerKm',
  'engineHours',
  'nextServiceDate',
  'nextServiceKm',
  'nextServiceHours',
  'annualTestExpiry',
  'insuranceExpiry',
  'safetyCheckExpiry',
  'purchaseDate',
  'purchasePrice',
  'warrantyTerms',
  'warrantyExpiry',
  'startCode',
  'photos',
  'drawing',
] as const;
export type VehicleField = (typeof VEHICLE_FIELDS)[number];

/** Which picture a vehicle upload replaces: the photo pair, or a custom drawing (SPEC A4). */
export const VEHICLE_PICTURES = ['top', 'side', 'drawing'] as const;
export type VehiclePicture = (typeof VEHICLE_PICTURES)[number];
export const vehiclePictureParams = z.object({
  serial: z.string().min(1).max(40),
  slot: z.enum(VEHICLE_PICTURES),
});
