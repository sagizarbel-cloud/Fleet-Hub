import type { Prisma } from '@prisma/client';
import {
  IMPORT_FIELDS,
  INSPECTION_KINDS,
  ITEM_KINDS,
  itemBody,
  MALFUNCTION_SEVERITIES,
  MALFUNCTION_STATES,
  normalizePlate,
  RECORD_BODIES,
  type ImportAction,
  type ImportBody,
  type ImportTarget,
  type RecordKind,
  type SessionUser,
} from '@fleet-hub/shared';
import { HttpError, issueCode } from './http';
import { createRecord, KINDS, type VehicleRef } from './records';
import { refreshStatus } from './status';
import { parseVehicle, saveVehicle, vehicleForm } from './vehicle-write';

type Tx = Prisma.TransactionClient;
type Cell = string | number | boolean | null;
type Values = Record<string, Cell | Date>;

export interface RowResult {
  /** 1-based sheet row, counting the header row as 1. */
  row: number;
  action: ImportAction;
  key: string | null;
  /** `value` is the cell as written, where showing it helps (a list value not found). */
  errors: { field: string; code: string; value?: string }[];
  changes?: string[];
}

// ---------- Reading cells ----------

const blank = (v: Cell | undefined) => v === null || v === undefined || String(v).trim() === '';

/** Day-first dates as written in Israel (27/10/2026, 27.10.26), or ISO from the browser. */
export function readDate(v: Cell): Date | null {
  if (typeof v === 'number') {
    // An Excel serial day number (days since 1899-12-30).
    if (v > 20_000 && v < 80_000) return new Date(Date.UTC(1899, 11, 30) + v * 86_400_000);
    return null;
  }
  // A time after the day ("12/03/2026 08:30") is dropped.
  const s = String(v)
    .trim()
    .replace(/[\sT]+\d{1,2}:\d{2}(:\d{2})?.*$/, '');
  const iso = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s) ?? /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return new Date(Date.UTC(+iso[1]!, +iso[2]! - 1, +iso[3]!));
  const dmy = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/.exec(s);
  if (!dmy) return null;
  const [d, m, y] = [+dmy[1]!, +dmy[2]!, +dmy[3]!];
  const year = y < 100 ? 2000 + y : y;
  const date = new Date(Date.UTC(year, m - 1, d));
  return date.getUTCDate() === d && date.getUTCMonth() === m - 1 ? date : null;
}

/**
 * One number, with whatever unit people typed around it: "1,250.50", "₪ 1250", "1250 ש״ח",
 * "20 ל'", "97,900 km" and "8,450 שעות" all read as their number.
 */
export function readNumber(v: Cell): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const m = /^[^\d.-]*(-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)[^\d]*$/.exec(String(v).trim());
  return m ? Number(m[1]!.replace(/,/g, '')) : null;
}

const YES = ['yes', 'y', 'true', '1', 'כן', 'עבר', 'תקין', 'passed', 'pass', 'ok', 'v', '✓', '✔'];
const NO = [
  'no',
  'n',
  'false',
  '0',
  'לא',
  'לא עבר',
  'לא תקין',
  'נכשל',
  'failed',
  'fail',
  'x',
  '✗',
  '✘',
];
function readBool(v: Cell): boolean | null {
  if (typeof v === 'boolean') return v;
  const s = String(v).trim().toLowerCase();
  return YES.includes(s) ? true : NO.includes(s) ? false : null;
}

/** Fixed choices, matched by their code or by the words people write for them. */
const CHOICES: Record<string, Record<string, string[]>> = {
  severity: {
    LOW: ['low', 'minor', 'נמוכה', 'נמוך', 'קלה', 'קל'],
    MEDIUM: ['medium', 'moderate', 'בינונית', 'בינוני'],
    HIGH: ['high', 'major', 'גבוהה', 'גבוה', 'חמורה', 'חמור'],
    CRITICAL: ['critical', 'קריטית', 'קריטי', 'מושבת'],
  },
  state: {
    OPEN: ['open', 'new', 'פתוחה', 'פתוח', 'חדש', 'ממתין'],
    IN_PROGRESS: ['in progress', 'בטיפול', 'בתיקון', 'בעבודה'],
    RESOLVED: [
      'resolved',
      'fixed',
      'closed',
      'done',
      'תוקנה',
      'תוקן',
      'סגורה',
      'סגור',
      'טופל',
      'טופלה',
      'בוצע',
    ],
  },
  inspectionKind: {
    ANNUAL_TEST: ['annual test', 'test', 'טסט', 'טסט שנתי', 'רישוי'],
    INSURANCE: ['insurance', 'ביטוח', 'ביטוח חובה', 'ביטוח מקיף'],
    SAFETY_CHECK: ['safety', 'safety check', 'תסקיר', 'בטיחות', 'בדיקת בטיחות'],
  },
  itemKind: {
    bucket: ['bucket', 'כף'],
    hydraulic_breaker: [
      'breaker',
      'hammer',
      'hydraulic breaker',
      'פטיש',
      'פטיש חציבה',
      'פטיש הידראולי',
    ],
    concrete_crusher: ['crusher', 'concrete crusher', 'מפצח', 'מרסק', 'מרסק בטון'],
    generator: ['generator', 'גנרטור'],
    equipment_box: ['box', 'equipment box', 'ארגז', 'ארגז ציוד'],
    adapter: ['adapter', 'coupler', 'quick coupler', 'מתאם', 'מצמד'],
    pallet_forks: ['forks', 'pallet forks', 'מזלגות'],
    tool: ['tool', 'כלי עבודה', 'כלי'],
    other: ['other', 'אחר'],
  },
};
const CHOICE_CODES: Record<string, readonly string[]> = {
  severity: MALFUNCTION_SEVERITIES,
  state: MALFUNCTION_STATES,
  inspectionKind: INSPECTION_KINDS,
  itemKind: ITEM_KINDS,
};

/** Text compared loosely: case, quote marks (׳ ' ״ "), dashes and extra spaces aside. */
const loose = (v: unknown) =>
  String(v)
    .toLowerCase()
    .replace(/[׳'`"״’]/g, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * The one option whose word or name the value holds, longest first ("שמן מנוע 15W40" is
 * engine oil, "ביטוח חובה" insurance). Null when nothing, or two options equally, fit.
 */
function containing<T>(s: string, options: [T, string[]][]): T | null {
  let best: T | null = null;
  let length = 0;
  let tie = false;
  for (const [option, words] of options)
    for (const w of words) {
      if (w.length < 2 || !s.includes(w)) continue;
      if (w.length > length) [best, length, tie] = [option, w.length, false];
      else if (w.length === length && option !== best) tie = true;
    }
  return tie ? null : best;
}

function readChoice(set: string, v: Cell): string | null {
  const s = loose(v);
  const code = CHOICE_CODES[set]!.find(
    (c) => loose(c) === s || c.toLowerCase() === s.replace(/\s+/g, '_'),
  );
  if (code) return code;
  const options = Object.entries(CHOICES[set]!).map(
    ([c, words]) => [c, words.map(loose)] as [string, string[]],
  );
  return options.find(([, words]) => words.includes(s))?.[0] ?? containing(s, options);
}

type ListName = 'vehicleTypes' | 'departments' | 'locations' | 'fluidTypes';
type Lists = Record<ListName, { code: string; nameEn: string; nameHe: string }[]>;

/**
 * A settings list value, by its code or its English or Hebrew name, compared loosely
 * ("אתר א'" is "אתר א׳"); else the one value whose name the cell holds.
 */
function readList(lists: Lists, list: ListName, v: Cell): string | null {
  const s = loose(v);
  const options = lists[list].map(
    (o) => [o.code, [loose(o.code), loose(o.nameEn), loose(o.nameHe)]] as [string, string[]],
  );
  return options.find(([, names]) => names.includes(s))?.[0] ?? containing(s, options);
}

const LIST_OF: Record<string, ListName> = {
  type: 'vehicleTypes',
  department: 'departments',
  location: 'locations',
  toLocation: 'locations',
  fromLocation: 'locations',
  fluidType: 'fluidTypes',
};
const CHOICE_OF: Partial<Record<ImportTarget, Record<string, string>>> = {
  malfunctions: { severity: 'severity', state: 'state' },
  inspections: { kind: 'inspectionKind' },
  equipment: { kind: 'itemKind' },
};

/** One sheet row as typed field values, with an error for each cell that can't be read. */
function readRow(target: ImportTarget, lists: Lists, body: ImportBody, cells: Cell[]) {
  const values: Values = {};
  const errors: RowResult['errors'] = [];
  for (const f of IMPORT_FIELDS[target]) {
    const col = body.mapping[f.key];
    const raw = col === null || col === undefined ? null : (cells[col] ?? null);
    if (blank(raw)) {
      // A vehicle already in the fleet keeps what a blank cell leaves out; new ones are checked later.
      if (f.required && (target !== 'vehicles' || f.key === 'serial'))
        errors.push({ field: f.key, code: 'required' });
      continue;
    }
    const v = raw as Cell;
    let out: Cell | Date = null;
    if (f.kind === 'text') out = String(v).trim();
    else if (f.kind === 'number') out = readNumber(v);
    else if (f.kind === 'date') out = readDate(v);
    else if (f.kind === 'bool') out = readBool(v);
    else if (f.kind === 'list') out = readList(lists, LIST_OF[f.key]!, v);
    else out = readChoice(CHOICE_OF[target]![f.key]!, v);
    if (out === null)
      errors.push({
        field: f.key,
        code: f.kind === 'list' ? 'unknown' : f.kind,
        value: String(v).slice(0, 80),
      });
    else values[f.key] = out;
  }
  return { values, errors };
}

/** The words a totals row under the data starts with. */
const TOTALS = new Set([
  'סהכ',
  'סה כ',
  'סך הכל',
  'סך הכול',
  'סיכום',
  'total',
  'totals',
  'sum',
  'grand total',
]);

const issuesOf = (err: unknown) => {
  if (err instanceof HttpError && 'issues' in err)
    return (err as HttpError & { issues: { path: string; code: string }[] }).issues.map((i) => ({
      field: i.path,
      code: i.code,
    }));
  if (err instanceof HttpError) return [{ field: '', code: err.code }];
  throw err;
};

// ---------- Writing rows ----------

/** Fields each record kind compares to tell a re-imported row from a new one. */
const SAME_RECORD: Record<RecordKind, string[]> = {
  service: ['description'],
  malfunctions: ['description'],
  fluids: ['liters'],
  fuel: ['liters'],
  movements: [],
  inspections: ['kind'],
  notes: ['body'],
};

async function vehicleRefOf(tx: Tx, serial: string): Promise<VehicleRef | null> {
  const v = await tx.vehicle.findUnique({
    where: { serial },
    select: {
      id: true,
      serial: true,
      odometerKm: true,
      engineHours: true,
      type: { select: { usageUnit: true } },
    },
  });
  if (!v) return null;
  const { type, ...rest } = v;
  return { ...rest, usageUnit: type.usageUnit };
}

/**
 * The fleet's numbers, to find a sheet's vehicle by its serial written loosely ("ex 102"),
 * its plate ("60-519-82") or its VIN.
 */
class Fleet {
  private bySerial = new Map<string, string>();
  private byPlate = new Map<string, string>();
  private byVin = new Map<string, string>();
  static compact = (s: string) => s.toUpperCase().replace(/[^0-9A-Z]/g, '');

  constructor(vehicles: { serial: string; licenseNo: string | null; vin: string | null }[]) {
    for (const v of vehicles) this.add(v);
  }
  add(v: { serial: string; licenseNo?: string | null; vin?: string | null }) {
    this.bySerial.set(Fleet.compact(v.serial), v.serial);
    if (v.licenseNo) this.byPlate.set(v.licenseNo.replace(/\D/g, ''), v.serial);
    if (v.vin) this.byVin.set(Fleet.compact(v.vin), v.serial);
  }
  /** The fleet serial a sheet's cell names, if any; `serialOnly` for a vehicle list's own key. */
  find(raw: string, serialOnly = false): string | null {
    const c = Fleet.compact(raw);
    if (!c) return null;
    if (serialOnly) return this.bySerial.get(c) ?? null;
    return (
      this.bySerial.get(c) ??
      (/^\d{7,8}$/.test(c) ? this.byPlate.get(c) : undefined) ??
      this.byVin.get(c) ??
      null
    );
  }
}

interface Ctx {
  tx: Tx;
  user: SessionUser;
  runId: string;
  codeKey: string;
  fleet: Fleet;
}

async function importVehicle(ctx: Ctx, values: Values): Promise<Omit<RowResult, 'row'>> {
  const { tx, user } = ctx;
  // "ex 102" is EX-102 when the fleet has one; a new serial is kept as written.
  const serial = ctx.fleet.find(String(values.serial), true) ?? String(values.serial).toUpperCase();
  const key = serial;
  if (typeof values.licenseNo === 'string') values.licenseNo = normalizePlate(values.licenseNo);
  // Unique numbers are checked first: a failed insert would end the whole import transaction.
  for (const field of ['vin', 'licenseNo'] as const) {
    const v = values[field];
    if (typeof v !== 'string' || !v) continue;
    const other = await tx.vehicle.findFirst({
      where: { [field]: field === 'vin' ? v.toUpperCase() : v, NOT: { serial } },
      select: { id: true },
    });
    if (other) return { action: 'error', key, errors: [{ field, code: 'taken' }] };
  }
  const existing = await vehicleForm(tx, serial);
  if (!existing) {
    const missing = IMPORT_FIELDS.vehicles.filter((f) => f.required && values[f.key] === undefined);
    if (missing.length)
      return {
        action: 'error',
        key,
        errors: missing.map((f) => ({ field: f.key, code: 'required' })),
      };
  }
  // Re-importing a vehicle updates only the cells this sheet fills (Sagi, 2026-10-27).
  const merged = { ...(existing?.values ?? {}), ...values, serial } as Record<string, unknown>;
  for (const [k, v] of Object.entries(merged)) if (v instanceof Date) merged[k] = v.toISOString();
  try {
    const { input, typeId } = await parseVehicle(tx, merged);
    // Start codes never come from a sheet.
    delete input.startCode;
    const saved = await saveVehicle(tx, user, existing ? serial : null, input, typeId, {
      codeKey: ctx.codeKey,
      importRunId: ctx.runId,
    });
    ctx.fleet.add({ serial, licenseNo: input.licenseNo, vin: input.vin });
    return {
      action: saved.created ? 'create' : saved.changed.length ? 'update' : 'unchanged',
      key,
      errors: [],
      changes: saved.changed,
    };
  } catch (err) {
    return { action: 'error', key, errors: issuesOf(err) };
  }
}

async function importRecord(
  ctx: Ctx,
  kind: RecordKind,
  values: Values,
): Promise<Omit<RowResult, 'row'>> {
  const { tx, user } = ctx;
  const written = String(values.serial);
  const serial = ctx.fleet.find(written) ?? written.toUpperCase();
  const vehicle = await vehicleRefOf(tx, serial);
  if (!vehicle)
    return {
      action: 'error',
      key: written,
      errors: [{ field: 'serial', code: 'unknown', value: written }],
    };
  const { serial: _s, ...fields } = values;
  const body: Record<string, unknown> = { ...fields };
  for (const [k, v] of Object.entries(body)) if (v instanceof Date) body[k] = v.toISOString();
  // Sensible defaults for what old sheets rarely record.
  if (kind === 'malfunctions') {
    body.severity ??= 'MEDIUM';
    body.state ??= body.resolvedAt ? 'RESOLVED' : 'OPEN';
  }
  const parsed = RECORD_BODIES[kind].safeParse(body);
  if (!parsed.success)
    return {
      action: 'error',
      key: serial,
      errors: parsed.error.issues.map((i) => ({ field: i.path.join('.'), code: issueCode(i) })),
    };
  const input = parsed.data as Record<string, unknown>;
  const cfg = KINDS[kind];
  // The same row imported again (same vehicle, day and main values) is left alone.
  if (kind !== 'notes' || input.body) {
    const dateField = cfg.dateField;
    const day = input[dateField] as Date | undefined;
    const where: Record<string, unknown> = { vehicleId: vehicle.id, deletedAt: null };
    if (day && dateField !== 'createdAt')
      where[dateField] = { gte: day, lt: new Date(day.getTime() + 86_400_000) };
    for (const f of SAME_RECORD[kind]) where[f] = input[f];
    const delegate = tx[cfg.model] as unknown as { findFirst(a: object): Promise<unknown> };
    if (await delegate.findFirst({ where, select: { id: true } }))
      return { action: 'duplicate', key: serial, errors: [] };
  }
  try {
    await createRecord(tx, user, kind, vehicle, parsed.data as never, ctx.runId);
    await refreshStatus(tx, vehicle.id, user.id);
    return { action: 'create', key: serial, errors: [] };
  } catch (err) {
    return { action: 'error', key: serial, errors: issuesOf(err) };
  }
}

async function importItem(ctx: Ctx, values: Values): Promise<Omit<RowResult, 'row'>> {
  const { tx, user } = ctx;
  const parsed = itemBody.safeParse({
    kind: values.kind ?? 'other',
    name: values.name,
    model: values.model ?? null,
    spec: values.spec ?? null,
    serial: values.itemSerial ?? null,
  });
  const key = String(values.itemSerial ?? values.name);
  if (!parsed.success)
    return {
      action: 'error',
      key,
      errors: parsed.error.issues.map((i) => ({ field: i.path.join('.'), code: issueCode(i) })),
    };
  const input = parsed.data;
  const written = typeof values.vehicle === 'string' ? values.vehicle : null;
  const vehicleSerial = written ? (ctx.fleet.find(written) ?? written.toUpperCase()) : null;
  const vehicle = vehicleSerial
    ? await tx.vehicle.findUnique({ where: { serial: vehicleSerial }, select: { id: true } })
    : null;
  if (written && !vehicle)
    return {
      action: 'error',
      key,
      errors: [{ field: 'vehicle', code: 'unknown', value: written }],
    };

  let item = input.serial
    ? await tx.item.findFirst({ where: { serial: input.serial } })
    : await tx.item.findFirst({
        where: {
          name: { equals: input.name, mode: 'insensitive' },
          model: input.model,
          serial: null,
        },
      });
  let action: ImportAction = 'duplicate';
  if (!item) {
    item = await tx.item.create({ data: input });
    action = 'create';
  }
  // An item in the yard goes onto the sheet's vehicle; one already on a vehicle stays put.
  if (vehicle && !item.currentVehicleId && !item.retiredAt) {
    const at = new Date();
    await tx.itemAssignment.create({
      data: { itemId: item.id, vehicleId: vehicle.id, assignedAt: at },
    });
    await tx.item.update({ where: { id: item.id }, data: { currentVehicleId: vehicle.id } });
    await tx.event.create({
      data: {
        type: 'ITEM_ASSIGNED',
        vehicleId: vehicle.id,
        occurredAt: at,
        userId: user.id,
        params: { item: item.name, serial: item.serial },
        sourceType: 'Item',
        sourceId: item.id,
        importRunId: ctx.runId,
      },
    });
    if (action === 'duplicate') action = 'update';
  }
  return { action, key, errors: [] };
}

/** Thrown at the end of a dry run so the transaction rolls back everything it tried. */
class DryRun extends Error {
  constructor(readonly results: RowResult[]) {
    super('dry run');
  }
}

/**
 * Runs an import inside one transaction. A dry run does the very same writes and then rolls
 * them back, so its preview matches what the import will do row for row. Rows with errors
 * are skipped; the rest are written, each with its events marked "imported".
 */
export async function runImport(
  db: { $transaction: <T>(fn: (tx: Tx) => Promise<T>, o?: object) => Promise<T> },
  user: SessionUser,
  target: ImportTarget,
  body: ImportBody,
  { commit, codeKey }: { commit: boolean; codeKey: string },
) {
  const work = async (tx: Tx) => {
    const lists: Lists = {
      vehicleTypes: await tx.vehicleType.findMany({
        select: { code: true, nameEn: true, nameHe: true },
      }),
      departments: await tx.department.findMany({
        select: { code: true, nameEn: true, nameHe: true },
      }),
      locations: await tx.location.findMany({ select: { code: true, nameEn: true, nameHe: true } }),
      fluidTypes: await tx.fluidType.findMany({
        select: { code: true, nameEn: true, nameHe: true },
      }),
    };
    const run = await tx.importRun.create({
      data: {
        target,
        fileName: body.fileName,
        sheet: body.sheet,
        created: 0,
        updated: 0,
        skipped: 0,
        userId: user.id,
      },
    });
    const fleet = new Fleet(
      await tx.vehicle.findMany({ select: { serial: true, licenseNo: true, vin: true } }),
    );
    const ctx: Ctx = { tx, user, runId: run.id, codeKey, fleet };
    const results: RowResult[] = [];
    for (const [i, cells] of body.rows.entries()) {
      if (cells.every((c) => blank(c))) continue;
      const { values, errors } = readRow(target, lists, body, cells);
      const row = i + 2;
      if (errors.length && cells.some((c) => typeof c === 'string' && TOTALS.has(loose(c)))) {
        results.push({ row, action: 'summary', key: null, errors: [] });
        continue;
      }
      if (errors.length) {
        const key = values.serial ?? values.itemSerial ?? values.name ?? null;
        results.push({ row, action: 'error', key: key === null ? null : String(key), errors });
        continue;
      }
      const result =
        target === 'vehicles'
          ? await importVehicle(ctx, values)
          : target === 'equipment'
            ? await importItem(ctx, values)
            : await importRecord(ctx, target, values);
      results.push({ row, ...result });
    }
    const count = (a: ImportAction) => results.filter((r) => r.action === a).length;
    const counts = {
      created: count('create'),
      updated: count('update'),
      skipped: results.length - count('create') - count('update'),
      errors: count('error'),
    };
    await tx.importRun.update({
      where: { id: run.id },
      data: { created: counts.created, updated: counts.updated, skipped: counts.skipped },
    });
    if (!commit) throw new DryRun(results);
    return { runId: run.id, counts, results };
  };
  try {
    return await db.$transaction(work, { timeout: 300_000, maxWait: 10_000 });
  } catch (err) {
    if (!(err instanceof DryRun)) throw err;
    const results = err.results;
    const count = (a: ImportAction) => results.filter((r) => r.action === a).length;
    return {
      runId: null,
      counts: {
        created: count('create'),
        updated: count('update'),
        skipped: results.length - count('create') - count('update'),
        errors: count('error'),
      },
      results,
    };
  }
}
