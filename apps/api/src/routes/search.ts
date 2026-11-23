import type { FastifyPluginAsync } from 'fastify';
import type { Prisma } from '@prisma/client';
import { normalizePlate, searchQuery, type SearchHit } from '@fleet-hub/shared';
import { parse } from '../lib/http';
import { requireUser } from '../plugins/auth';

const PER_GROUP = 8;

/** The text around the first match, so a long note still shows why it was found. */
export function snippet(text: string, q: string, width = 70): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const at = flat.toLowerCase().indexOf(q.toLowerCase());
  if (flat.length <= width || at < 0)
    return flat.length <= width ? flat : `${flat.slice(0, width)}…`;
  const start = Math.max(0, Math.min(at - 20, flat.length - width));
  return `${start > 0 ? '…' : ''}${flat.slice(start, start + width)}${start + width < flat.length ? '…' : ''}`;
}

const has = (q: string) => ({ contains: q, mode: 'insensitive' as const });
/** OR over a model's text fields. */
const anyOf = <T>(fields: readonly string[], q: string) =>
  fields.map((f) => ({ [f]: has(q) })) as T[];
const firstMatch = (row: Record<string, unknown>, fields: readonly string[], q: string) => {
  const lower = q.toLowerCase();
  return fields.find((f) => {
    const v = row[f];
    return typeof v === 'string' && v.toLowerCase().includes(lower);
  });
};

const veh = { select: { serial: true, type: { select: { code: true } } } } as const;

/** Text fields of each record kind that the search looks in. Start codes are never searched. */
const RECORDS = [
  { kind: 'service', model: 'serviceRecord', date: 'date', fields: ['description', 'vendor'] },
  { kind: 'malfunctions', model: 'malfunction', date: 'reportedAt', fields: ['description'] },
  { kind: 'fluids', model: 'fluidAddition', date: 'date', fields: ['notes'] },
  { kind: 'fuel', model: 'fuelEntry', date: 'date', fields: ['place', 'fueledBy', 'provider'] },
  { kind: 'movements', model: 'movement', date: 'date', fields: ['contractor', 'notes'] },
  { kind: 'inspections', model: 'inspection', date: 'date', fields: ['inspector', 'notes'] },
  { kind: 'notes', model: 'note', date: 'createdAt', fields: ['body'] },
  {
    kind: 'workCards',
    model: 'workCard',
    date: 'date',
    fields: ['description', 'doneBy', 'place', 'notes'],
  },
] as const;

const VEHICLE_FIELDS = [
  'serial',
  'vin',
  'licenseNo',
  'make',
  'model',
  'operatorName',
  'warrantyTerms',
] as const;
const ITEM_FIELDS = ['name', 'model', 'spec', 'serial'] as const;

type Delegate = {
  findMany: (args: unknown) => Promise<Record<string, unknown>[]>;
};

export const searchRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { preHandler: requireUser }, async (req) => {
    const { q } = parse(searchQuery, req.query);
    const plate = normalizePlate(q);
    const hits: SearchHit[] = [];

    // Vehicles: their own fields, plus the names of their type, location and department.
    const names = (rel: 'type' | 'location' | 'department') => ({
      [rel]: { OR: [{ nameEn: has(q) }, { nameHe: has(q) }] },
    });
    const vehicles = await app.db.vehicle.findMany({
      where: {
        OR: [
          ...anyOf<Prisma.VehicleWhereInput>(VEHICLE_FIELDS, q),
          ...(plate.length >= 3 && plate !== q ? [{ licenseNo: has(plate) }] : []),
          names('type'),
          names('location'),
          names('department'),
        ],
      },
      orderBy: { serial: 'asc' },
      take: PER_GROUP * 3,
      select: {
        id: true,
        serial: true,
        vin: true,
        licenseNo: true,
        make: true,
        model: true,
        operatorName: true,
        warrantyTerms: true,
        type: { select: { code: true, nameEn: true, nameHe: true } },
        location: { select: { nameEn: true, nameHe: true } },
        department: { select: { nameEn: true, nameHe: true } },
      },
    });
    // Serial matches first, then the rest.
    const lower = q.toLowerCase();
    vehicles.sort(
      (a, b) =>
        Number(!a.serial.toLowerCase().includes(lower)) -
        Number(!b.serial.toLowerCase().includes(lower)),
    );
    for (const v of vehicles.slice(0, PER_GROUP)) {
      let field: string | undefined = firstMatch(v, VEHICLE_FIELDS, q);
      if (!field && plate.length >= 3 && v.licenseNo?.includes(plate)) field = 'licenseNo';
      let text = field ? String(v[field as keyof typeof v]) : '';
      if (!field) {
        for (const rel of ['type', 'location', 'department'] as const) {
          const n = v[rel];
          const hit = n && [n.nameEn, n.nameHe].find((s) => s.toLowerCase().includes(lower));
          if (hit) {
            field = rel;
            text = hit;
            break;
          }
        }
      }
      hits.push({
        group: 'vehicle',
        serial: v.serial,
        type: v.type.code,
        kind: null,
        id: v.id,
        field: field ?? 'serial',
        text: snippet(text || v.serial, q),
        date: null,
      });
    }

    // Records, newest first in each kind.
    const lists = await Promise.all(
      RECORDS.map(async (r) => {
        const rows = await (app.db[r.model] as unknown as Delegate).findMany({
          where: { deletedAt: null, OR: anyOf(r.fields, q) },
          orderBy: { [r.date]: 'desc' },
          take: 4,
          select: {
            id: true,
            [r.date]: true,
            vehicle: veh,
            ...Object.fromEntries(r.fields.map((f) => [f, true])),
          },
        });
        return rows.map((row): SearchHit => {
          const field = firstMatch(row, r.fields, q) ?? r.fields[0];
          const v = row.vehicle as { serial: string; type: { code: string } };
          const d = row[r.date];
          return {
            group: 'record',
            serial: v.serial,
            type: v.type.code,
            kind: r.kind,
            id: String(row.id),
            field,
            text: snippet(String(row[field] ?? ''), q),
            date: d instanceof Date ? d.toISOString() : null,
          };
        });
      }),
    );
    // Progress updates on a malfunction lead to that malfunction.
    const progress = await app.db.malfunctionProgress.findMany({
      where: { deletedAt: null, body: has(q), malfunction: { deletedAt: null } },
      orderBy: { at: 'desc' },
      take: 4,
      select: { at: true, body: true, malfunction: { select: { id: true, vehicle: veh } } },
    });
    const records = [
      ...lists.flat(),
      ...progress.map((p): SearchHit => ({
        group: 'record',
        serial: p.malfunction.vehicle.serial,
        type: p.malfunction.vehicle.type.code,
        kind: 'malfunctions',
        id: p.malfunction.id,
        field: 'progress',
        text: snippet(p.body, q),
        date: p.at.toISOString(),
      })),
    ]
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
      .slice(0, PER_GROUP);
    hits.push(...records);

    // Items (equipment and tools), with the vehicle they are on.
    const items = await app.db.item.findMany({
      where: { OR: anyOf<Prisma.ItemWhereInput>(ITEM_FIELDS, q) },
      orderBy: { name: 'asc' },
      take: PER_GROUP,
      select: {
        id: true,
        kind: true,
        name: true,
        model: true,
        spec: true,
        serial: true,
        currentVehicle: veh,
      },
    });
    for (const it of items) {
      const field = firstMatch(it, ITEM_FIELDS, q) ?? 'name';
      hits.push({
        group: 'item',
        serial: it.currentVehicle?.serial ?? null,
        type: it.currentVehicle?.type.code ?? null,
        kind: it.kind,
        id: it.id,
        field,
        text: snippet(String(it[field as keyof typeof it] ?? it.name), q),
        date: null,
      });
    }
    hits.push(...(await documents(app.db, q)), ...(await options(app.db, q)));
    return { hits };
  });
};

/** Which record kind each attachment owner is, for files attached to records. */
const OWNER_KINDS = Object.fromEntries(
  RECORDS.map((r) => [r.model[0]!.toUpperCase() + r.model.slice(1), r]),
) as Record<string, (typeof RECORDS)[number]>;
/** Wiggle tests aren't searched as text, but a file on one still is. */
OWNER_KINDS.WiggleTest = {
  kind: 'wiggleTests',
  model: 'wiggleTest',
  date: 'date',
  fields: [],
} as never;

type Db = Parameters<FastifyPluginAsync>[0]['db'];

/**
 * Documents (Sagi, 2026-11-23): files attached to records and vehicles, by file name, and
 * receipts by vendor and notes. Price quotes keep their own visibility rules, so their files
 * aren't searched here.
 */
async function documents(db: Db, q: string): Promise<SearchHit[]> {
  const files = await db.attachment.findMany({
    where: {
      deletedAt: null,
      fileName: has(q),
      ownerType: { in: [...Object.keys(OWNER_KINDS), 'Vehicle', 'Document'] },
    },
    orderBy: { createdAt: 'desc' },
    take: PER_GROUP,
    select: { id: true, ownerType: true, ownerId: true, fileName: true, createdAt: true },
  });
  // The vehicle of each file: its own, or its record's (a deleted record hides the file).
  const owners = new Map<string, { id: string; serial: string; type: string } | null>();
  for (const [ownerType, r] of Object.entries(OWNER_KINDS)) {
    const ids = files.filter((f) => f.ownerType === ownerType).map((f) => f.ownerId);
    if (!ids.length) continue;
    const rows = await (db[r.model] as unknown as Delegate).findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true, vehicle: veh },
    });
    for (const row of rows) {
      const v = row.vehicle as { serial: string; type: { code: string } };
      owners.set(`${ownerType}:${String(row.id)}`, {
        id: String(row.id),
        serial: v.serial,
        type: v.type.code,
      });
    }
  }
  const vehicleIds = files.filter((f) => f.ownerType === 'Vehicle').map((f) => f.ownerId);
  if (vehicleIds.length)
    for (const v of await db.vehicle.findMany({
      where: { id: { in: vehicleIds } },
      select: { id: true, serial: true, type: { select: { code: true } } },
    }))
      owners.set(`Vehicle:${v.id}`, { id: v.id, serial: v.serial, type: v.type.code });

  const hits: SearchHit[] = [];
  for (const f of files) {
    const date = f.createdAt.toISOString();
    const text = snippet(f.fileName, q);
    if (f.ownerType === 'Document') {
      hits.push({
        group: 'document',
        serial: null,
        type: null,
        kind: 'receipt',
        id: f.ownerId,
        field: 'fileName',
        text,
        date,
      });
      continue;
    }
    const o = owners.get(`${f.ownerType}:${f.ownerId}`);
    if (!o) continue;
    hits.push({
      group: 'document',
      serial: o.serial,
      type: o.type,
      kind: f.ownerType === 'Vehicle' ? 'vehicle' : OWNER_KINDS[f.ownerType]!.kind,
      id: o.id,
      field: 'fileName',
      text,
      date,
    });
  }

  const receipts = await db.document.findMany({
    where: { deletedAt: null, OR: [{ vendor: has(q) }, { notes: has(q) }] },
    orderBy: { date: 'desc' },
    take: 4,
    select: { id: true, date: true, vendor: true, notes: true },
  });
  for (const r of receipts) {
    const field = firstMatch(r, ['vendor', 'notes'], q) ?? 'vendor';
    hits.push({
      group: 'document',
      serial: null,
      type: null,
      kind: 'receipt',
      id: r.id,
      field,
      text: snippet(String(r[field as 'vendor'] ?? ''), q),
      date: r.date.toISOString(),
    });
  }
  return hits.slice(0, PER_GROUP);
}

/** The lists' choices (Sagi, 2026-11-23), in either language. */
const LISTS = [
  ['location', 'locations'],
  ['department', 'departments'],
  ['vehicleType', 'vehicleTypes'],
  ['fluidType', 'fluidTypes'],
  ['fuelType', 'fuelTypes'],
  ['receiptCategory', 'receiptCategories'],
] as const;

async function options(db: Db, q: string): Promise<SearchHit[]> {
  const found = await Promise.all(
    LISTS.map(async ([list, kind]) => {
      const rows = await (db[list] as unknown as Delegate).findMany({
        where: { active: true, OR: [{ nameEn: has(q) }, { nameHe: has(q) }] },
        orderBy: { nameEn: 'asc' },
        take: 3,
        select: { id: true, code: true, nameEn: true, nameHe: true },
      });
      return rows.map((r): SearchHit => {
        const he = String(r.nameHe).toLowerCase().includes(q.toLowerCase());
        return {
          group: 'option',
          serial: null,
          type: null,
          kind,
          id: String(r.code),
          field: he ? 'nameHe' : 'nameEn',
          text: snippet(String(he ? r.nameHe : r.nameEn), q),
          date: null,
        };
      });
    }),
  );
  return found.flat().slice(0, PER_GROUP);
}
