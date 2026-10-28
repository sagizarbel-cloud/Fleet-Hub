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
  ],
};
const date = (key = 'date', extra: string[] = []): ImportField => ({
  key,
  kind: 'date',
  required: true,
  aliases: ['date', 'תאריך', ...extra],
});
const hours: ImportField = {
  key: 'engineHours',
  kind: 'number',
  aliases: ['hours', 'engine hours', 'שעות', 'שעות מנוע', 'מונה שעות'],
};
const km: ImportField = {
  key: 'odometerKm',
  kind: 'number',
  aliases: ['km', 'odometer', 'mileage', 'ק"מ', 'קילומטרים', 'מד אוץ'],
};
const cost: ImportField = {
  key: 'cost',
  kind: 'number',
  aliases: ['cost', 'price', 'amount', 'total', 'עלות', 'מחיר', 'סכום', 'סה"כ'],
};
const notes: ImportField = { key: 'notes', kind: 'text', aliases: ['notes', 'remarks', 'הערות'] };

/** Each target's fields, in the order the matching screen lists them. */
export const IMPORT_FIELDS: Record<ImportTarget, ImportField[]> = {
  vehicles: [
    serial,
    { key: 'type', kind: 'list', required: true, aliases: ['type', 'סוג', 'סוג כלי'] },
    { key: 'make', kind: 'text', required: true, aliases: ['make', 'manufacturer', 'יצרן'] },
    { key: 'model', kind: 'text', required: true, aliases: ['model', 'דגם'] },
    { key: 'year', kind: 'number', aliases: ['year', 'שנה', 'שנת ייצור'] },
    { key: 'vin', kind: 'text', aliases: ['vin', 'chassis', 'pin', 'שלדה', 'מספר שלדה'] },
    {
      key: 'licenseNo',
      kind: 'text',
      aliases: ['license', 'plate', 'licence', 'רישוי', 'מספר רישוי', 'לוחית'],
    },
    { key: 'department', kind: 'list', aliases: ['department', 'מחלקה'] },
    { key: 'location', kind: 'list', aliases: ['location', 'site', 'מיקום', 'אתר'] },
    { key: 'operatorName', kind: 'text', aliases: ['operator', 'driver', 'מפעיל', 'נהג'] },
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
      aliases: ['annual test', 'test', 'טסט', 'רישיון רכב', 'טסט שנתי'],
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
    serial,
    date(),
    {
      key: 'description',
      kind: 'text',
      required: true,
      aliases: ['description', 'work', 'service', 'תיאור', 'עבודה', 'טיפול'],
    },
    { key: 'vendor', kind: 'text', aliases: ['vendor', 'garage', 'supplier', 'מוסך', 'ספק'] },
    cost,
    km,
    hours,
  ],
  malfunctions: [
    serial,
    date('reportedAt', ['reported']),
    {
      key: 'description',
      kind: 'text',
      required: true,
      aliases: ['description', 'fault', 'problem', 'תיאור', 'תקלה'],
    },
    { key: 'severity', kind: 'choice', aliases: ['severity', 'חומרה'] },
    { key: 'state', kind: 'choice', aliases: ['status', 'state', 'מצב', 'סטטוס'] },
    cost,
    { key: 'downtimeHours', kind: 'number', aliases: ['downtime', 'השבתה', 'שעות השבתה'] },
    { key: 'resolvedAt', kind: 'date', aliases: ['resolved', 'fixed', 'תוקן', 'תאריך תיקון'] },
  ],
  fluids: [
    serial,
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
    serial,
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
    serial,
    date(),
    {
      key: 'toLocation',
      kind: 'list',
      required: true,
      aliases: ['to', 'destination', 'אל', 'יעד'],
    },
    { key: 'fromLocation', kind: 'list', aliases: ['from', 'origin', 'מ', 'מקור'] },
    notes,
  ],
  inspections: [
    serial,
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
      aliases: ['valid until', 'expiry', 'expires', 'בתוקף עד', 'תוקף'],
    },
    { key: 'inspector', kind: 'text', aliases: ['inspector', 'בודק'] },
    { key: 'passed', kind: 'bool', aliases: ['passed', 'result', 'עבר', 'תוצאה'] },
    cost,
    notes,
  ],
  notes: [
    serial,
    {
      key: 'body',
      kind: 'text',
      required: true,
      aliases: ['note', 'notes', 'text', 'הערה', 'הערות'],
    },
  ],
  equipment: [
    { key: 'name', kind: 'text', required: true, aliases: ['item', 'name', 'פריט', 'שם'] },
    { key: 'kind', kind: 'choice', aliases: ['kind', 'type', 'סוג'] },
    { key: 'model', kind: 'text', aliases: ['model', 'דגם'] },
    { key: 'spec', kind: 'text', aliases: ['spec', 'size', 'מפרט', 'גודל'] },
    { key: 'itemSerial', kind: 'text', aliases: ['item serial', 'serial', 'מספר סידורי', 'מק"ט'] },
    { key: 'vehicle', kind: 'text', aliases: ['vehicle', 'on', 'assigned to', 'כלי', 'משויך'] },
  ],
};

/** Normalised header text, for matching and for the saved-mapping signature. */
export const normHeader = (h: string) =>
  h
    .toLowerCase()
    .replace(/[֑-ׇ]/g, '')
    .replace(/[׳'`"״]/g, '"')
    .replace(/[_\-./:()]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** The same sheet layout gives the same signature, so its saved matching comes back. */
export const headerSignature = (headers: string[]) => headers.map(normHeader).join('|');

/** A first guess at the matching: each field takes the header that best equals one of its aliases. */
export function guessMapping(
  target: ImportTarget,
  headers: string[],
): Record<string, number | null> {
  const normed = headers.map(normHeader);
  const taken = new Set<number>();
  const out: Record<string, number | null> = {};
  for (const f of IMPORT_FIELDS[target]) {
    const aliases = f.aliases.map(normHeader);
    let pick = normed.findIndex((h, i) => !taken.has(i) && aliases.includes(h));
    if (pick === -1)
      pick = normed.findIndex(
        (h, i) =>
          !taken.has(i) && h.length > 1 && aliases.some((a) => a.length > 2 && h.includes(a)),
      );
    out[f.key] = pick === -1 ? null : pick;
    if (pick !== -1) taken.add(pick);
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

export const IMPORT_ACTIONS = ['create', 'update', 'unchanged', 'duplicate', 'error'] as const;
export type ImportAction = (typeof IMPORT_ACTIONS)[number];
