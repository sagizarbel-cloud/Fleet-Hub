// @vitest-environment node
import { describe, expect, it } from 'vitest';
import i18n from 'i18next';
import { DEFAULT_FLEET_VIEW, type FleetViewSettings } from '@fleet-hub/shared';
import en from '@/i18n/en.json';
import he from '@/i18n/he.json';
import { buildBook } from '@/vehicle/records/exportXlsx';
import type { FormatCtx } from '@/vehicle/records/kinds';
import {
  decodeSettings,
  encodeSettings,
  excelColumns,
  FLEET_COLUMN_DEFS,
  filterRows,
  groupRows,
  isDueSoon,
  sortRows,
  visibleColumns,
  type FleetRow,
} from './model';

async function ctxFor(lang: 'en' | 'he'): Promise<FormatCtx> {
  const inst = i18n.createInstance();
  await inst.init({
    showSupportNotice: false,
    lng: lang,
    resources: { en: { translation: en }, he: { translation: he } },
  });
  return {
    t: inst.t,
    lang,
    lookups: {
      departments: [{ id: 'd', code: 'roads', nameEn: 'Roads', nameHe: 'כבישים' }],
      locations: [],
      vehicleTypes: [
        {
          id: 'p',
          code: 'pickup',
          nameEn: 'Pickup',
          nameHe: 'טנדר',
          category: 'ROAD',
          usageUnit: 'KM',
        },
        {
          id: 'w',
          code: 'wheel_loader',
          nameEn: 'Wheel loader',
          nameHe: 'שופל',
          category: 'EQUIPMENT',
          usageUnit: 'HOURS',
        },
      ],
      fluidTypes: [],
      receiptCategories: [],
    },
    unit: 'KM',
    date: (iso) => iso.slice(0, 10),
    number: (n) => String(n),
    money: (n) => `₪${n}`,
  };
}

const NOW = new Date('2026-10-26T12:00:00Z');
const day = (offset: number) => new Date(NOW.getTime() + offset * 86_400_000).toISOString();

function vehicle(over: Partial<FleetRow>): FleetRow {
  return {
    serial: 'X-1',
    vin: null,
    licenseNo: null,
    make: 'Make',
    model: 'Model',
    year: null,
    operatorName: null,
    odometerKm: null,
    engineHours: null,
    nextServiceKm: null,
    nextServiceHours: null,
    nextServiceDate: null,
    readinessPct: 100,
    annualTestExpiry: null,
    insuranceExpiry: null,
    safetyCheckExpiry: null,
    status: 'GREEN',
    statusOverride: null,
    purchaseDate: null,
    purchasePrice: null,
    warrantyExpiry: null,
    supplier: null,
    type: 'pickup',
    category: 'ROAD',
    usageUnit: 'KM',
    department: null,
    location: null,
    items: [],
    openIssues: 0,
    lastActivity: null,
    lastService: null,
    services12m: 0,
    economy30: null,
    lastFuel: null,
    costs: {
      maintenance12m: 0,
      fuel12m: 0,
      total12m: 0,
      maintenance3m: 0,
      fuel3m: 0,
      total3m: 0,
    },
    ...over,
  };
}

const rows = [
  vehicle({
    serial: 'PU-2',
    make: 'Toyota',
    model: 'Hilux',
    status: 'AMBER',
    openIssues: 1,
    department: 'roads',
  }),
  vehicle({ serial: 'PU-10', make: 'Mitsubishi', model: 'Triton', insuranceExpiry: day(10) }),
  vehicle({
    serial: 'WL-1',
    type: 'wheel_loader',
    usageUnit: 'HOURS',
    status: 'RED',
    engineHours: 4_000,
    nextServiceHours: 3_990,
    readinessPct: 0,
  }),
];
const view = (over: Partial<FleetViewSettings>) => ({ ...DEFAULT_FLEET_VIEW, ...over });

describe('fleet table model', () => {
  it('searches, filters by status and list, and finds what is due', () => {
    expect(filterRows(rows, view({ q: 'hilux' }), NOW).map((r) => r.serial)).toEqual(['PU-2']);
    expect(filterRows(rows, view({ status: ['RED', 'AMBER'] }), NOW)).toHaveLength(2);
    expect(filterRows(rows, view({ departments: ['roads'] }), NOW)).toHaveLength(1);
    expect(filterRows(rows, view({ issues: true }), NOW).map((r) => r.serial)).toEqual(['PU-2']);
    // Insurance in 10 days, and a service overdue by engine hours.
    expect(filterRows(rows, view({ due: true }), NOW).map((r) => r.serial)).toEqual([
      'PU-10',
      'WL-1',
    ]);
    expect(isDueSoon(rows[0]!, NOW)).toBe(false);
  });

  it('sorts serials naturally, worst status first, and empty values last', async () => {
    const ctx = await ctxFor('en');
    expect(sortRows(rows, [{ id: 'serial', desc: false }], ctx).map((r) => r.serial)).toEqual([
      'PU-2',
      'PU-10',
      'WL-1',
    ]);
    expect(sortRows(rows, [{ id: 'status', desc: false }], ctx)[0]!.serial).toBe('WL-1');
    for (const desc of [false, true]) {
      expect(sortRows(rows, [{ id: 'insurance', desc }], ctx).at(-1)!.serial).not.toBe('PU-10');
    }
  });

  it('groups by type, by name, and by department with the unassigned last', async () => {
    const ctx = await ctxFor('he');
    const byType = groupRows(rows, view({ groupBy: 'type' }), ctx);
    expect(byType.map((g) => [g.label, g.rows.length])).toEqual([
      ['טנדר', 2],
      ['שופל', 1],
    ]);
    const byDept = groupRows(rows, view({ groupBy: 'department' }), ctx);
    expect(byDept.map((g) => g.label)).toEqual(['כבישים', 'ללא מחלקה']);
  });

  it('collapses a group to its first chosen column', () => {
    const groups = visibleColumns(view({ collapsed: ['identity'] }));
    expect(groups[0]).toMatchObject({ group: 'identity' });
    expect(groups[0]!.columns.map((c) => c.key)).toEqual(['type']);
    expect(groups.find((g) => g.group === 'compliance')!.columns).toHaveLength(4);
  });

  it('keeps settings in the URL, Hebrew search included, and drops anything invalid', () => {
    const s = view({ q: 'טנדר', groupBy: 'department', sort: [{ id: 'status', desc: true }] });
    expect(decodeSettings(encodeSettings(s))).toEqual(s);
    expect(decodeSettings('not-base64!')).toBeNull();
    const tampered = encodeSettings({
      ...s,
      columns: ['type', 'startCode'] as never,
      groupBy: 'x' as never,
    });
    expect(decodeSettings(tampered)).toMatchObject({ columns: ['type'], groupBy: 'none' });
  });

  it('exports usage as separate km and hours columns, in Hebrew right to left', async () => {
    const ctx = await ctxFor('he');
    const columns = excelColumns([FLEET_COLUMN_DEFS.type, FLEET_COLUMN_DEFS.usage]);
    const wb = await buildBook([
      {
        title: ctx.t('nav.fleetTable'),
        lines: [],
        columns,
        rows: rows.map((r) => ({
          ...r,
          id: r.serial,
          createdById: null,
          createdBy: null,
          attachments: [],
        })) as never,
        ctx,
        files: false,
        fileName: '',
      },
    ]);
    const ws = wb.worksheets[0]!;
    expect(ws.views[0]?.rightToLeft).toBe(true);
    expect(ws.getRow(4).values).toEqual([
      undefined,
      'מספר סידורי',
      'סוג',
      'קילומטראז׳ (ק״מ)',
      'שעות מנוע (ש׳)',
    ]);
    expect((ws.getRow(7).values as unknown[]).slice(1)).toEqual(
      // The odometer cell stays empty for a machine counted in engine hours.
      ['WL-1', 'שופל', undefined, 4_000],
    );
  });
});
