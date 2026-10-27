import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { guessMapping, headerSignature, type ImportTarget } from '@fleet-hub/shared';
import { readDate, readNumber } from '../src/lib/import';
import { createUser, login, makeApp, ORIGIN } from './helpers';

let app: Awaited<ReturnType<typeof makeApp>>;
let admin: string;
let editor: string;

type Cell = string | number | boolean | null;
const req = (method: 'GET' | 'POST', url: string, cookie: string, payload?: object) =>
  app.inject({ method, url, headers: { cookie, origin: ORIGIN }, payload });

/** A sheet as the browser sends it, matched the way the import page first guesses. */
function sheet(target: ImportTarget, headers: string[], rows: Cell[][]) {
  return {
    fileName: 'fleet.xlsx',
    sheet: 'Sheet1',
    headers,
    mapping: guessMapping(target, headers),
    rows,
  };
}
const preview = (target: ImportTarget, body: object, cookie = admin) =>
  req('POST', `/api/import/${target}/preview`, cookie, body);
const commit = (target: ImportTarget, body: object) =>
  req('POST', `/api/import/${target}/commit`, admin, body);

// Hebrew headers, day-first dates and a start-code column, like an old office sheet. All fake.
const VEHICLES = sheet(
  'vehicles',
  ['מספר סידורי', 'סוג', 'יצרן', 'דגם', 'שנה', 'מספר רישוי', 'שעות מנוע', 'טסט', 'קוד התנעה'],
  [
    ['IM-1', 'מחפר', 'Test', 'Digger 30', 2019, null, 4_200, '01/03/2027', '9911'],
    ['IM-2', 'Pickup', 'Test', 'Pickup', 2021, '12-345-68', null, '15.6.27', '9912'],
    ['IM-3', 'Spaceship', 'Test', 'X', 2020, null, null, null, null],
    ['IM-4', 'Pickup', 'Test', 'Pickup', 2021, '1234568', null, 'soon', null],
    [null, null, null, null, null, null, null, null, null],
  ],
);

beforeAll(async () => {
  app = await makeApp();
  admin = await login(app, await createUser(app, 'ADMIN', { canViewStartCodes: true }));
  editor = await login(app, await createUser(app, 'EDITOR'));
  await app.db.vehicleType.createMany({
    data: [
      {
        code: 'im_digger',
        nameEn: 'Excavator',
        nameHe: 'מחפר',
        category: 'EQUIPMENT',
        usageUnit: 'HOURS',
      },
      { code: 'im_pickup', nameEn: 'Pickup', nameHe: 'טנדר', category: 'ROAD', usageUnit: 'KM' },
    ],
  });
  await app.db.location.createMany({
    data: [
      { code: 'im_yard', nameEn: 'Yard', nameHe: 'מגרש' },
      { code: 'im_site', nameEn: 'North site', nameHe: 'אתר צפון' },
    ],
  });
});
afterAll(async () => {
  await app.close();
});

describe('reading cells', () => {
  it('reads day-first, ISO and Excel dates, and money with symbols', () => {
    expect(readDate('27/10/2026')?.toISOString().slice(0, 10)).toBe('2026-10-27');
    expect(readDate('1.2.27')?.toISOString().slice(0, 10)).toBe('2027-02-01');
    expect(readDate('2026-10-27T00:00:00.000Z')?.toISOString().slice(0, 10)).toBe('2026-10-27');
    expect(readDate(46_322)?.toISOString().slice(0, 10)).toBe('2026-10-27');
    expect(readDate('31/02/2026')).toBeNull();
    expect(readNumber('₪ 1,250.50')).toBe(1250.5);
    expect(readNumber('900 ש"ח')).toBe(900);
    expect(readNumber('abc')).toBeNull();
  });

  it('guesses the matching from Hebrew headers and never offers a start-code field', () => {
    const m = VEHICLES.mapping;
    expect(m).toMatchObject({ serial: 0, type: 1, make: 2, model: 3, year: 4, licenseNo: 5 });
    expect(m.engineHours).toBe(6);
    expect(m.annualTestExpiry).toBe(7);
    expect(Object.keys(m)).not.toContain('startCode');
  });
});

describe('importing vehicles', () => {
  it('only admins import', async () => {
    expect((await preview('vehicles', VEHICLES, editor)).statusCode).toBe(403);
  });

  it('a dry run reports each row and writes nothing', async () => {
    const res = await preview('vehicles', VEHICLES);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.runId).toBeNull();
    expect(body.counts).toEqual({ created: 2, updated: 0, skipped: 2, errors: 2 });
    expect(body.results).toEqual([
      expect.objectContaining({ row: 2, action: 'create', key: 'IM-1' }),
      expect.objectContaining({ row: 3, action: 'create', key: 'IM-2' }),
      expect.objectContaining({
        row: 4,
        action: 'error',
        errors: [{ field: 'type', code: 'unknown' }],
      }),
      expect.objectContaining({
        row: 5,
        action: 'error',
        errors: [{ field: 'annualTestExpiry', code: 'date' }],
      }),
    ]);
    expect(await app.db.vehicle.count({ where: { serial: { startsWith: 'IM-' } } })).toBe(0);
    expect(await app.db.importRun.count()).toBe(0);
  });

  it('the import writes the good rows, marks their events, saves the matching and skips start codes', async () => {
    const res = await commit('vehicles', VEHICLES);
    const body = res.json();
    expect(body.runId).toEqual(expect.any(String));
    expect(body.counts.created).toBe(2);
    const v1 = await app.db.vehicle.findUniqueOrThrow({ where: { serial: 'IM-1' } });
    expect(v1).toMatchObject({ engineHours: 4_200, hasStartCode: false, startCodeEnc: null });
    expect(v1.annualTestExpiry?.toISOString().slice(0, 10)).toBe('2027-03-01');
    const v2 = await app.db.vehicle.findUniqueOrThrow({ where: { serial: 'IM-2' } });
    expect(v2.licenseNo).toBe('1234568');
    const created = await app.db.event.findFirstOrThrow({
      where: { vehicleId: v1.id, type: 'VEHICLE_CREATED' },
    });
    expect(created.importRunId).toBe(body.runId);
    const run = await app.db.importRun.findUniqueOrThrow({ where: { id: body.runId } });
    expect(run).toMatchObject({ target: 'vehicles', created: 2, updated: 0, skipped: 2 });
    const saved = await req(
      'GET',
      `/api/import/mapping?target=vehicles&signature=${encodeURIComponent(headerSignature(VEHICLES.headers))}`,
      admin,
    );
    expect(saved.json().mapping).toEqual(VEHICLES.mapping);
    const timeline = (await req('GET', `/api/events?vehicle=IM-1`, admin)).json();
    expect(timeline.items[0].imported).toBe(true);
  });

  it('importing again changes nothing, and a later sheet updates only the cells it fills', async () => {
    const again = (await commit('vehicles', VEHICLES)).json();
    expect(again.counts).toMatchObject({ created: 0, updated: 0 });
    expect(again.results[0]).toMatchObject({ key: 'IM-1', action: 'unchanged' });

    const hours = sheet('vehicles', ['serial', 'make', 'engine hours'], [['im-1', null, 4_350]]);
    const res = (await commit('vehicles', hours)).json();
    expect(res.results).toEqual([
      expect.objectContaining({ action: 'update', changes: ['engineHours'] }),
    ]);
    const v1 = await app.db.vehicle.findUniqueOrThrow({ where: { serial: 'IM-1' } });
    expect(v1).toMatchObject({ engineHours: 4_350, make: 'Test', model: 'Digger 30' });
  });

  it('a new vehicle still needs its type, make and model; a taken plate is a row error', async () => {
    const res = (
      await preview(
        'vehicles',
        sheet(
          'vehicles',
          ['serial', 'make', 'plate'],
          [
            ['IM-9', 'Test', null],
            ['IM-10', null, '1234568'],
          ],
        ),
      )
    ).json();
    expect(res.results[0].errors).toEqual([
      { field: 'type', code: 'required' },
      { field: 'model', code: 'required' },
    ]);
    expect(res.results[1].errors).toEqual([{ field: 'licenseNo', code: 'taken' }]);
  });
});

describe('importing records and equipment', () => {
  it('adds history rows, refuses unknown vehicles, and skips a row imported twice', async () => {
    const fuel = sheet(
      'fuel',
      ['כלי', 'תאריך', 'ליטרים', 'עלות'],
      [
        ['IM-1', '01/09/2026', 180, '₪ 1,260'],
        ['IM-1', '08/09/2026', 175, 1225],
        ['ZZ-404', '08/09/2026', 10, 70],
      ],
    );
    const first = (await commit('fuel', fuel)).json();
    expect(first.results.map((r: { action: string }) => r.action)).toEqual([
      'create',
      'create',
      'error',
    ]);
    expect(first.results[2].errors).toEqual([{ field: 'serial', code: 'unknown' }]);
    const second = (await commit('fuel', fuel)).json();
    expect(second.results.map((r: { action: string }) => r.action)).toEqual([
      'duplicate',
      'duplicate',
      'error',
    ]);
    const v1 = await app.db.vehicle.findUniqueOrThrow({ where: { serial: 'IM-1' } });
    expect(await app.db.fuelEntry.count({ where: { vehicleId: v1.id } })).toBe(2);
    const events = await app.db.event.findMany({ where: { vehicleId: v1.id, type: 'FUEL_ADDED' } });
    expect(events.every((e) => e.importRunId === first.runId)).toBe(true);
  });

  it('reads malfunction words and movement places by their Hebrew names', async () => {
    const faults = sheet(
      'malfunctions',
      ['serial', 'date', 'תקלה', 'חומרה', 'סטטוס', 'תאריך תיקון'],
      [['IM-1', '02/09/2026', 'Track tension low', 'גבוהה', 'תוקן', '05/09/2026']],
    );
    const res = (await commit('malfunctions', faults)).json();
    expect(res.results[0]).toMatchObject({ action: 'create' });
    const m = await app.db.malfunction.findFirstOrThrow({
      where: { description: 'Track tension low' },
    });
    expect(m).toMatchObject({ severity: 'HIGH', state: 'RESOLVED' });

    const moves = sheet(
      'movements',
      ['serial', 'date', 'מ', 'אל'],
      [['IM-1', '06/09/2026', 'מגרש', 'אתר צפון']],
    );
    const move = (await commit('movements', moves)).json();
    expect(move.results[0]).toMatchObject({ action: 'create' });
  });

  it('adds equipment and puts a yard item on the sheet’s vehicle', async () => {
    const items = sheet(
      'equipment',
      ['פריט', 'סוג', 'מספר סידורי', 'משויך'],
      [
        ['Digging bucket 1.2 m³', 'כף', 'BK-T1', 'IM-1'],
        ['Breaker', 'פטיש', 'HB-T1', null],
      ],
    );
    const res = (await commit('equipment', items)).json();
    expect(res.results.map((r: { action: string }) => r.action)).toEqual(['create', 'create']);
    const bucket = await app.db.item.findFirstOrThrow({ where: { serial: 'BK-T1' } });
    const v1 = await app.db.vehicle.findUniqueOrThrow({ where: { serial: 'IM-1' } });
    expect(bucket).toMatchObject({ kind: 'bucket', currentVehicleId: v1.id });
    const again = (await commit('equipment', items)).json();
    expect(again.results.map((r: { action: string }) => r.action)).toEqual([
      'duplicate',
      'duplicate',
    ]);
  });
});
