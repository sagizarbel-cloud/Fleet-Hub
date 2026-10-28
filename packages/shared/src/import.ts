import { z } from 'zod';

/** What an Excel sheet can bring in (Sagi, 2026-10-27): vehicles, the record types, equipment. */
export const IMPORT_TARGETS = [
  'vehicles',
  'service',
  'malfunctions',
  'fluids',
  'fuel',
  'movements',
  'inspections',
  'notes',
  'equipment',
] as const;
export type ImportTarget = (typeof IMPORT_TARGETS)[number];

export type ImportFieldKind = 'text' | 'number' | 'date' | 'bool' | 'list' | 'choice';

export interface ImportField {
  key: string;
  kind: ImportFieldKind;
  required?: boolean;
  /** Header words that suggest this field (lower case, English and Hebrew). */
  aliases: string[];
}

const serial: ImportField = {
  key: 'serial',
  kind: 'text',
  required: true,
  aliases: [
    'serial',
    'serial no',
    'sn',
    'unit',
    'מספר סידורי',
    'מס׳ סידורי',
    'מס סידורי',
    'סידורי',
    'כלי',
    'מס׳ כלי',
    'מספר כלי',
    'קוד כלי',
    'unit no',
    'unit number',
    'asset',
    'fleet no',
  ],
};
/**
 * The vehicle a record belongs to. Old sheets name it by serial, plate or VIN, and the
 * import finds it by any of them.
 */
const vehicleRef: ImportField = {
  ...serial,
  aliases: [
    ...serial.aliases,
    'vehicle',
    'רכב',
    'מספר רכב',
    'מס׳ רכב',
    'plate',
    'license',
    'license no',
    'רישוי',
    'מספר רישוי',
    'מס׳ רישוי',
    'vin',
    'שלדה',
  ],
};
const date = (key = 'date', extra: string[] = []): ImportField => ({
  key,
  kind: 'date',
  required: true,
  aliases: ['date', 'תאריך', 'day', 'יום', ...extra],
});
const hours: ImportField = {
  key: 'engineHours',
  kind: 'number',
  aliases: ['hours', 'engine hours', 'hour meter', 'hrs', 'שעות', 'שעות מנוע', 'מונה שעות', 'ש״מ'],
};
const km: ImportField = {
  key: 'odometerKm',
  kind: 'number',
  aliases: ['km', 'odometer', 'mileage', 'ק"מ', 'קילומטרים', 'קילומטראז׳', 'מד אוץ', 'מונה ק"מ'],
};
const cost: ImportField = {
  key: 'cost',
  kind: 'number',
  aliases: [
    'cost',
    'price',
    'amount',
    'total',
    'nis',
    '₪',
    'עלות',
    'מחיר',
    'סכום',
    'סה"כ',
    'תשלום',
  ],
};
const notes: ImportField = {
  key: 'notes',
  kind: 'text',
  aliases: ['notes', 'remarks', 'comments', 'הערות', 'הערה'],
};

/** Each target's fields, in the order the matching screen lists them. */
export const IMPORT_FIELDS: Record<ImportTarget, ImportField[]> = {
  vehicles: [
    serial,
    {
      key: 'type',
      kind: 'list',
      required: true,
      aliases: ['type', 'vehicle type', 'סוג', 'סוג כלי', 'סוג רכב'],
    },
    {
      key: 'make',
      kind: 'text',
      required: true,
      aliases: ['make', 'manufacturer', 'brand', 'יצרן', 'תוצרת'],
    },
    { key: 'model', kind: 'text', required: true, aliases: ['model', 'דגם'] },
    { key: 'year', kind: 'number', aliases: ['year', 'model year', 'שנה', 'שנת ייצור', 'שנתון'] },
    {
      key: 'vin',
      kind: 'text',
      aliases: ['vin', 'chassis', 'pin', 'שלדה', 'מספר שלדה', 'מס׳ שלדה'],
    },
    {
      key: 'licenseNo',
      kind: 'text',
      aliases: ['license', 'plate', 'licence', 'רישוי', 'מספר רישוי', 'מס׳ רישוי', 'לוחית'],
    },
    { key: 'department', kind: 'list', aliases: ['department', 'dept', 'מחלקה', 'אגף'] },
    {
      key: 'location',
      kind: 'list',
      aliases: ['location', 'site', 'yard', 'מיקום', 'אתר', 'מיקום נוכחי'],
    },
    { key: 'operatorName', kind: 'text', aliases: ['operator', 'driver', 'מפעיל', 'נהג', 'אחראי'] },
    km,
    hours,
    {
      key: 'nextServiceDate',
      kind: 'date',
      aliases: ['next service', 'טיפול הבא', 'תאריך טיפול הבא'],
    },
    {
      key: 'annualTestExpiry',
      kind: 'date',
      aliases: ['annual test', 'test', 'טסט', 'רישיון רכב', 'טסט שנתי', 'רישיון שנתי'],
    },
    { key: 'insuranceExpiry', kind: 'date', aliases: ['insurance', 'ביטוח'] },
    { key: 'safetyCheckExpiry', kind: 'date', aliases: ['safety', 'תסקיר', 'בטיחות'] },
    { key: 'purchaseDate', kind: 'date', aliases: ['purchase date', 'תאריך רכישה'] },
    {
      key: 'purchasePrice',
      kind: 'number',
      aliases: ['purchase price', 'price', 'מחיר רכישה', 'מחיר'],
    },
    { key: 'warrantyExpiry', kind: 'date', aliases: ['warranty', 'אחריות'] },
  ],
  service: [
    vehicleRef,
    date(),
    {
      key: 'description',
      kind: 'text',
      required: true,
      aliases: ['description', 'work', 'service', 'details', 'תיאור', 'עבודה', 'טיפול', 'פירוט'],
    },
    {
      key: 'vendor',
      kind: 'text',
      aliases: ['vendor', 'garage', 'supplier', 'workshop', 'מוסך', 'ספק', 'נותן שירות'],
    },
    cost,
    km,
    hours,
  ],
  malfunctions: [
    vehicleRef,
    date('reportedAt', ['reported']),
    {
      key: 'description',
      kind: 'text',
      required: true,
      aliases: ['description', 'fault', 'problem', 'issue', 'תיאור', 'תקלה', 'פירוט'],
    },
    { key: 'severity', kind: 'choice', aliases: ['severity', 'חומרה'] },
    { key: 'state', kind: 'choice', aliases: ['status', 'state', 'מצב', 'סטטוס', 'טופל'] },
    cost,
    {
      key: 'downtimeHours',
      kind: 'number',
      aliases: ['downtime', 'השבתה', 'שעות השבתה', 'זמן השבתה'],
    },
    { key: 'resolvedAt', kind: 'date', aliases: ['resolved', 'fixed', 'תוקן', 'תאריך תיקון'] },
  ],
  fluids: [
    vehicleRef,
    date(),
    {
      key: 'fluidType',
      kind: 'list',
      required: true,
      aliases: ['fluid', 'oil', 'type', 'נוזל', 'שמן', 'סוג'],
    },
    {
      key: 'liters',
      kind: 'number',
      required: true,
      aliases: ['liters', 'litres', 'ליטרים', 'ליטר', 'כמות'],
    },
    notes,
  ],
  fuel: [
    vehicleRef,
    date(),
    {
      key: 'liters',
      kind: 'number',
      required: true,
      aliases: ['liters', 'litres', 'fuel', 'ליטרים', 'ליטר', 'סולר', 'דלק'],
    },
    cost,
    km,
    hours,
  ],
  movements: [
    vehicleRef,
    date(),
    {
      key: 'toLocation',
      kind: 'list',
      required: true,
      aliases: ['to', 'to site', 'destination', 'אל', 'יעד', 'לאתר', 'למיקום', 'לאן'],
    },
    {
      key: 'fromLocation',
      kind: 'list',
      aliases: ['from', 'from site', 'origin', 'מ', 'מקור', 'מאתר', 'ממיקום', 'מאיפה'],
    },
    notes,
  ],
  inspections: [
    vehicleRef,
    {
      key: 'kind',
      kind: 'choice',
      required: true,
      aliases: ['kind', 'type', 'inspection', 'סוג', 'בדיקה'],
    },
    date(),
    {
      key: 'validUntil',
      kind: 'date',
      required: true,
      aliases: ['valid until', 'expiry', 'expires', 'due', 'בתוקף עד', 'תוקף', 'תפוגה'],
    },
    { key: 'inspector', kind: 'text', aliases: ['inspector', 'בודק'] },
    { key: 'passed', kind: 'bool', aliases: ['passed', 'result', 'עבר', 'תוצאה', 'תקין'] },
    cost,
    notes,
  ],
  notes: [
    vehicleRef,
    {
      key: 'body',
      kind: 'text',
      required: true,
      aliases: ['note', 'notes', 'text', 'הערה', 'הערות'],
    },
  ],
  equipment: [
    {
      key: 'name',
      kind: 'text',
      required: true,
      aliases: ['item', 'name', 'description', 'פריט', 'שם', 'שם פריט', 'תיאור'],
    },
    { key: 'kind', kind: 'choice', aliases: ['kind', 'type', 'סוג'] },
    { key: 'model', kind: 'text', aliases: ['model', 'דגם'] },
    { key: 'spec', kind: 'text', aliases: ['spec', 'size', 'מפרט', 'גודל'] },
    {
      key: 'itemSerial',
      kind: 'text',
      aliases: ['item serial', 'serial', 'serial no', 'sn', 'מספר סידורי', 'מס׳ סידורי', 'מק"ט'],
    },
    {
      key: 'vehicle',
      kind: 'text',
      aliases: ['vehicle', 'on', 'assigned to', 'כלי', 'משויך', 'משויך לכלי', 'על כלי', 'רכב'],
    },
  ],
};

/** Normalised header text, for matching and for the saved-mapping signature. */
export const normHeader = (h: string) =>
  h
    .toLowerCase()
    .replace(/[֑-ׇ]/g, '')
    .replace(/[׳'`"״’]/g, '"')
    .replace(/[_\-./:()]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** The same sheet layout gives the same signature, so its saved matching comes back. */
export const headerSignature = (headers: string[]) => headers.map(normHeader).join('|');

/**
 * A first guess at the matching. Exact header matches go first for every field, so a field
 * that only partly matches can't take a column another field names exactly; then each field
 * left takes the header holding its longest alias.
 */
export function guessMapping(
  target: ImportTarget,
  headers: string[],
): Record<string, number | null> {
  const normed = headers.map(normHeader);
  const fields = IMPORT_FIELDS[target].map((f) => ({ f, aliases: f.aliases.map(normHeader) }));
  const taken = new Set<number>();
  const out: Record<string, number | null> = {};
  for (const { f, aliases } of fields) {
    const pick = normed.findIndex((h, i) => !taken.has(i) && aliases.includes(h));
    out[f.key] = pick === -1 ? null : pick;
    if (pick !== -1) taken.add(pick);
  }
  for (const { f, aliases } of fields) {
    if (out[f.key] !== null) continue;
    let best = -1;
    let bestLength = 0;
    normed.forEach((h, i) => {
      if (taken.has(i) || h.length < 2) return;
      for (const a of aliases)
        if (a.length > 2 && a.length > bestLength && h.includes(a)) {
          best = i;
          bestLength = a.length;
        }
    });
    out[f.key] = best === -1 ? null : best;
    if (best !== -1) taken.add(best);
  }
  return out;
}

/** The most rows one import takes (bigger sheets: split them). */
export const IMPORT_MAX_ROWS = 5_000;

const cell = z.union([z.string().max(2_000), z.number(), z.boolean(), z.null()]);

export const importBody = z.object({
  fileName: z.string().trim().min(1).max(200),
  sheet: z.string().trim().min(1).max(100),
  headers: z.array(z.string().max(200)).min(1).max(100),
  /** Field key → column index in `headers`, or null to leave the field out. */
  mapping: z.record(z.string().max(40), z.number().int().min(0).max(99).nullable()),
  rows: z.array(z.array(cell).max(100)).min(1).max(IMPORT_MAX_ROWS),
});
export type ImportBody = z.infer<typeof importBody>;

export const importParams = z.object({ target: z.enum(IMPORT_TARGETS) });
export const importMappingQuery = z.object({
  target: z.enum(IMPORT_TARGETS),
  signature: z.string().max(10_000),
});

export const IMPORT_ACTIONS = [
  'create',
  'update',
  'unchanged',
  'duplicate',
  /** A totals row ("סה״כ") under the data: skipped. */
  'summary',
  'error',
] as const;
export type ImportAction = (typeof IMPORT_ACTIONS)[number];
