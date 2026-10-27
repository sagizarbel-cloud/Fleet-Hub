import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { decryptStartCode } from '@fleet-hub/shared/crypto';
import { sanitizeSvg } from '../src/lib/svg';
import { createUser, login, makeApp, ORIGIN } from './helpers';

let app: Awaited<ReturnType<typeof makeApp>>;
let uploadDir: string;
let admin: string;
let codeAdmin: string;
let editor: string;
let viewer: string;

type Json = Record<string, unknown>;
const req = (
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  cookie: string,
  payload?: object,
) => app.inject({ method, url, headers: { cookie, origin: ORIGIN }, payload });

// Fake numbers only: a made-up VIN and plate.
const FAKE_VIN = 'FAKEVHN0000000001';
const PICKUP: Json = {
  type: 'vw_pickup',
  serial: 'vw-1',
  vin: FAKE_VIN.toLowerCase(),
  licenseNo: '12-345-67',
  make: 'Test',
  model: 'Pickup',
  year: 2022,
  department: 'vw_dept',
  odometerKm: 12_000,
  annualTestExpiry: '2027-03-01',
};

beforeAll(async () => {
  uploadDir = await mkdtemp(path.join(tmpdir(), 'fh-vw-'));
  process.env.UPLOAD_DIR = uploadDir;
  process.env.UPLOAD_MAX_MB = '2';
  app = await makeApp();
  admin = await login(app, await createUser(app, 'ADMIN'));
  codeAdmin = await login(app, await createUser(app, 'ADMIN', { canViewStartCodes: true }));
  editor = await login(app, await createUser(app, 'EDITOR'));
  viewer = await login(app, await createUser(app, 'VIEWER'));
  await app.db.vehicleType.createMany({
    data: [
      { code: 'vw_pickup', nameEn: 'Pickup', nameHe: 'טנדר', category: 'ROAD', usageUnit: 'KM' },
      {
        code: 'vw_digger',
        nameEn: 'Excavator',
        nameHe: 'מחפר',
        category: 'EQUIPMENT',
        usageUnit: 'HOURS',
      },
    ],
  });
  await app.db.department.create({
    data: { code: 'vw_dept', nameEn: 'Earthworks', nameHe: 'עפר' },
  });
});
afterAll(async () => {
  await app.close();
});

describe('add and edit a vehicle', () => {
  it('editors add one; serial, VIN and plate are normalized; an event is written', async () => {
    expect((await req('POST', '/api/vehicles', viewer, PICKUP)).statusCode).toBe(403);
    const res = await req('POST', '/api/vehicles', editor, PICKUP);
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ serial: 'VW-1', created: true });
    const v = await app.db.vehicle.findUniqueOrThrow({ where: { serial: 'VW-1' } });
    expect(v).toMatchObject({ vin: FAKE_VIN, licenseNo: '1234567', odometerKm: 12_000 });
    const events = await app.db.event.findMany({ where: { vehicleId: v.id } });
    expect(events.map((e) => e.type)).toContain('VEHICLE_CREATED');
  });

  it('checks the VIN for road vehicles only, the plate, and unknown types', async () => {
    const bad = await req('POST', '/api/vehicles', editor, {
      ...PICKUP,
      serial: 'VW-2',
      vin: 'SHORT',
      licenseNo: '12',
      type: 'vw_pickup',
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().issues).toEqual(
      expect.arrayContaining([
        { path: 'vin', code: 'vin' },
        { path: 'licenseNo', code: 'plate' },
      ]),
    );
    const machine = await req('POST', '/api/vehicles', editor, {
      ...PICKUP,
      serial: 'VW-3',
      type: 'vw_digger',
      vin: 'PIN-ANY-FORMAT',
      licenseNo: null,
    });
    expect(machine.statusCode).toBe(201);
    const unknown = await req('POST', '/api/vehicles', editor, {
      ...PICKUP,
      serial: 'VW-4',
      type: 'nope',
    });
    expect(unknown.json().issues).toContainEqual({ path: 'type', code: 'unknown' });
  });

  it('a taken serial, VIN or plate is an error on that field', async () => {
    const serial = await req('POST', '/api/vehicles', editor, {
      ...PICKUP,
      vin: null,
      licenseNo: null,
    });
    expect(serial.json().issues).toEqual([{ path: 'serial', code: 'taken' }]);
    const vin = await req('POST', '/api/vehicles', editor, {
      ...PICKUP,
      serial: 'VW-5',
      licenseNo: null,
    });
    expect(vin.json().issues).toEqual([{ path: 'vin', code: 'taken' }]);
  });

  it('an edit names the changed fields, and the form never carries the start code', async () => {
    const form = (await req('GET', '/api/vehicles/VW-1/form', editor)).json();
    expect(form.hasStartCode).toBe(false);
    expect(form.values).not.toHaveProperty('startCode');
    const res = await req('PUT', '/api/vehicles/VW-1', editor, {
      ...form.values,
      model: 'Pickup XL',
      odometerKm: 12_500,
    });
    expect(res.json().changed).toEqual(['model', 'odometerKm']);
    const v = await app.db.vehicle.findUniqueOrThrow({ where: { serial: 'VW-1' } });
    const updated = await app.db.event.findFirstOrThrow({
      where: { vehicleId: v.id, type: 'VEHICLE_UPDATED' },
    });
    expect(updated.params).toEqual({ fields: ['model', 'odometerKm'] });
    const same = await req('PUT', '/api/vehicles/VW-1', editor, {
      ...form.values,
      model: 'Pickup XL',
      odometerKm: 12_500,
    });
    expect(same.json().changed).toEqual([]);
  });

  it('only users with the start-code permission set one; it is encrypted and audited', async () => {
    const form = (await req('GET', '/api/vehicles/VW-1/form', admin)).json();
    const denied = await req('PUT', '/api/vehicles/VW-1', admin, {
      ...form.values,
      startCode: '4821',
    });
    expect(denied.statusCode).toBe(403);
    const ok = await req('PUT', '/api/vehicles/VW-1', codeAdmin, {
      ...form.values,
      startCode: '4821',
    });
    expect(ok.json().changed).toEqual(['startCode']);
    expect(ok.body).not.toContain('4821');
    const v = await app.db.vehicle.findUniqueOrThrow({ where: { serial: 'VW-1' } });
    expect(v.hasStartCode).toBe(true);
    expect(decryptStartCode(v.startCodeEnc!, process.env.FLEET_CODE_KEY!)).toBe('4821');
    const audit = await app.db.auditLog.findFirstOrThrow({
      where: { action: 'startCode.set', targetId: v.id },
    });
    expect(JSON.stringify(audit)).not.toContain('4821');
    const event = await app.db.event.findFirstOrThrow({
      where: { vehicleId: v.id, type: 'VEHICLE_UPDATED' },
      orderBy: { createdAt: 'desc' },
    });
    expect(JSON.stringify(event)).not.toContain('4821');
    // Leaving the code out keeps it.
    await req('PUT', '/api/vehicles/VW-1', editor, { ...form.values, model: 'Pickup' });
    expect(
      (await app.db.vehicle.findUniqueOrThrow({ where: { serial: 'VW-1' } })).hasStartCode,
    ).toBe(true);
    await req('PUT', '/api/vehicles/VW-1', codeAdmin, { ...form.values, startCode: null });
    expect(
      (await app.db.vehicle.findUniqueOrThrow({ where: { serial: 'VW-1' } })).hasStartCode,
    ).toBe(false);
    expect(
      await app.db.auditLog.count({ where: { action: 'startCode.remove', targetId: v.id } }),
    ).toBe(1);
  });
});

/** A one-file multipart body, as a browser sends it. */
function multipart(name: string, type: string, data: Buffer) {
  const boundary = '----fh' + Math.random().toString(16).slice(2);
  return {
    payload: Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: ${type}\r\n\r\n`,
      ),
      data,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}
const putPicture = (cookie: string, slot: string, name: string, type: string, data: Buffer) => {
  const body = multipart(name, type, data);
  return app.inject({
    method: 'PUT',
    url: `/api/vehicles/VW-1/pictures/${slot}`,
    headers: { cookie, origin: ORIGIN, 'content-type': body.contentType },
    payload: body.payload,
  });
};

describe('photos and drawings', () => {
  it('stores a photo as WebP, links it to the vehicle and serves it', async () => {
    const png = await sharp({
      create: { width: 2400, height: 1200, channels: 3, background: '#ffcd11' },
    })
      .png()
      .toBuffer();
    expect((await putPicture(viewer, 'top', 'top.png', 'image/png', png)).statusCode).toBe(403);
    const res = await putPicture(editor, 'top', 'top.png', 'image/png', png);
    expect(res.statusCode).toBe(200);
    expect(res.json().mimeType).toBe('image/webp');
    const v = await app.db.vehicle.findUniqueOrThrow({ where: { serial: 'VW-1' } });
    expect(v.topPhotoId).toBe(res.json().id);
    const file = await app.inject({
      method: 'GET',
      url: `/api/attachments/${v.topPhotoId}`,
      headers: { cookie: viewer },
    });
    expect(file.statusCode).toBe(200);
    const meta = await sharp(file.rawPayload).metadata();
    expect(meta.width).toBeLessThanOrEqual(1600);
    const detail = (await req('GET', '/api/vehicles/VW-1', viewer)).json();
    expect(JSON.stringify(detail)).toContain(v.topPhotoId);
  });

  it('a photo slot refuses SVG; the drawing slot cleans it', async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(2)</script>' +
        '<a href="javascript:alert(3)"><rect width="10" height="10" fill="#ffcd11"/></a>' +
        '<foreignObject><div>x</div></foreignObject><image href="https://example.com/x.png"/></svg>',
    );
    expect((await putPicture(editor, 'side', 'side.svg', 'image/svg+xml', svg)).statusCode).toBe(
      415,
    );
    const res = await putPicture(editor, 'drawing', 'drawing.svg', 'image/svg+xml', svg);
    expect(res.json().mimeType).toBe('image/svg+xml');
    const att = await app.db.attachment.findUniqueOrThrow({ where: { id: res.json().id } });
    const stored = await readFile(path.join(uploadDir, att.storagePath), 'utf8');
    expect(stored).toContain('<rect');
    for (const bad of ['onload', '<script', 'javascript:', 'foreignObject', '<image'])
      expect(stored).not.toContain(bad);
    expect(sanitizeSvg('<p>not a drawing</p>')).toBeNull();
  });

  it('removing a picture clears the slot and writes an event', async () => {
    const res = await req('DELETE', '/api/vehicles/VW-1/pictures/top', editor);
    expect(res.statusCode).toBe(200);
    const v = await app.db.vehicle.findUniqueOrThrow({ where: { serial: 'VW-1' } });
    expect(v.topPhotoId).toBeNull();
    const last = await app.db.event.findFirstOrThrow({
      where: { vehicleId: v.id, type: 'VEHICLE_UPDATED' },
      orderBy: { createdAt: 'desc' },
    });
    expect(last.params).toEqual({ fields: ['photos'] });
  });
});
