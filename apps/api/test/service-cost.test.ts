import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createUser, login, makeApp, ORIGIN } from './helpers';

// A service's cost note and its link to a receipt or price quote (Sagi, 2026-11-15).

let app: Awaited<ReturnType<typeof makeApp>>;
let admin: string;
let editor: string;
let editorId: string;
let adminId: string;
let seq = 0;
const DAY = 86_400_000;
const isoDay = (offset = 0) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);
const req = (
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  cookie: string,
  payload?: object,
) => app.inject({ method, url, headers: { cookie, origin: ORIGIN }, payload });

async function vehicle() {
  const serial = `SC-${++seq}`;
  const type = await app.db.vehicleType.findUniqueOrThrow({ where: { code: 'sc_road' } });
  const v = await app.db.vehicle.create({
    data: { serial, make: 'Test', model: 'Unit', typeId: type.id },
  });
  return { serial, id: v.id };
}

const receipt = (vehicleId: string, extra: object = {}) =>
  app.db.document.create({
    data: {
      date: new Date(),
      vendor: 'Package Garage',
      amount: 2000,
      approvedAt: new Date(),
      vehicles: { create: { vehicleId } },
      ...extra,
    },
  });

async function quote(vehicleId: string, createdById: string, visibility = 'STANDARD') {
  const supplier = await app.db.supplier.create({ data: { name: 'Quote Supplier' } });
  return app.db.quote.create({
    data: {
      supplierId: supplier.id,
      date: new Date(),
      createdById,
      visibility: visibility as 'STANDARD',
      lines: { create: { item: '10 services', quantity: 10, unitPrice: 200 } },
      vehicles: { create: { vehicleId } },
    },
  });
}

const service = (extra: object = {}) => ({
  date: isoDay(-1),
  description: 'Service 3 of 10',
  ...extra,
});

beforeAll(async () => {
  app = await makeApp();
  const adminEmail = await createUser(app, 'ADMIN');
  const editorEmail = await createUser(app, 'EDITOR');
  admin = await login(app, adminEmail);
  editor = await login(app, editorEmail);
  adminId = (await app.db.user.findUniqueOrThrow({ where: { email: adminEmail } })).id;
  editorId = (await app.db.user.findUniqueOrThrow({ where: { email: editorEmail } })).id;
  await app.db.vehicleType.create({
    data: { code: 'sc_road', nameEn: 'Road', nameHe: 'כביש', category: 'ROAD', usageUnit: 'KM' },
  });
});

afterAll(async () => {
  await app.close();
});

describe('service cost note and link', () => {
  it('keeps a note with no amount, and search finds it', async () => {
    const v = await vehicle();
    const url = `/api/vehicles/${v.serial}/records/service`;
    const res = await req('POST', url, editor, service({ costNote: 'Package: 10 for 2,000' }));
    expect(res.statusCode).toBe(201);
    expect(res.json().item).toMatchObject({
      cost: null,
      costNote: 'Package: 10 for 2,000',
      costSource: null,
    });
    expect(res.json().item).not.toHaveProperty('costReceiptId');
    const found = (await req('GET', `${url}?q=package`, editor)).json();
    expect(found.items).toHaveLength(1);
  });

  it('links a receipt of the vehicle, counted once in the costs', async () => {
    const v = await vehicle();
    const other = await vehicle();
    const mine = await receipt(v.id);
    const theirs = await receipt(other.id);
    const pending = await receipt(v.id, { approvedAt: null });
    const url = `/api/vehicles/${v.serial}/records/service`;
    const link = (id: string) => ({ costSource: { kind: 'receipt', id } });

    expect((await req('POST', url, editor, service(link(theirs.id)))).statusCode).toBe(400);
    expect((await req('POST', url, editor, service(link(pending.id)))).statusCode).toBe(400);
    // The receipt already counts on its own, so an amount here too is refused.
    const twice = await req('POST', url, editor, service({ ...link(mine.id), cost: 200 }));
    expect(twice.statusCode).toBe(400);
    expect(twice.json().issues).toEqual([{ path: 'cost', code: 'receipt_counts' }]);

    for (let i = 0; i < 3; i++) {
      const res = await req('POST', url, editor, service(link(mine.id)));
      expect(res.statusCode).toBe(201);
      expect(res.json().item.costSource).toMatchObject({
        kind: 'receipt',
        id: mine.id,
        label: 'Package Garage',
        amount: 2000,
        counted: true,
      });
    }
    const detail = (await req('GET', `/api/vehicles/${v.serial}`, editor)).json();
    expect(detail.computed.maintenanceCostYtd).toBe(2000);
  });

  it('allows an amount when the receipt is linked to a record, whose cost counts instead', async () => {
    const v = await vehicle();
    const doc = await receipt(v.id, { linkedRecordType: 'Malfunction', linkedRecordId: 'x' });
    const res = await req(
      'POST',
      `/api/vehicles/${v.serial}/records/service`,
      editor,
      service({ cost: 200, costSource: { kind: 'receipt', id: doc.id } }),
    );
    expect(res.statusCode).toBe(201);
    expect(res.json().item.costSource).toMatchObject({ kind: 'receipt', counted: false });
  });

  it('links a quote the user can see, and keeps one they cannot when editing', async () => {
    const v = await vehicle();
    const url = `/api/vehicles/${v.serial}/records/service`;
    const own = await quote(v.id, editorId);
    const hidden = await quote(v.id, adminId, 'ADMINS');

    const refused = await req(
      'POST',
      url,
      editor,
      service({ costSource: { kind: 'quote', id: hidden.id } }),
    );
    expect(refused.statusCode).toBe(400);

    const res = await req(
      'POST',
      url,
      editor,
      service({ cost: 200, costSource: { kind: 'quote', id: own.id } }),
    );
    expect(res.statusCode).toBe(201);
    expect(res.json().item).toMatchObject({
      cost: 200,
      costSource: { kind: 'quote', id: own.id, label: 'Quote Supplier', amount: 2000 },
    });

    // An admin links their admins-only quote; the editor sees only that there is one.
    const byAdmin = await req(
      'POST',
      url,
      admin,
      service({ costSource: { kind: 'quote', id: hidden.id } }),
    );
    const id = byAdmin.json().item.id as string;
    const seen = (await req('GET', `${url}/${id}`, editor)).json().item;
    expect(seen.costSource).toEqual({ kind: 'quote', id: hidden.id, hidden: true });
    // Editing the service keeps the link.
    const edit = await req(
      'PUT',
      `${url}/${id}`,
      editor,
      service({ description: 'Edited', costSource: { kind: 'quote', id: hidden.id } }),
    );
    expect(edit.statusCode).toBe(200);
    const row = await app.db.serviceRecord.findUniqueOrThrow({ where: { id } });
    expect(row.costQuoteId).toBe(hidden.id);

    // Leaving the link out clears it.
    await req('PUT', `${url}/${id}`, admin, service());
    const cleared = await app.db.serviceRecord.findUniqueOrThrow({ where: { id } });
    expect(cleared.costQuoteId).toBeNull();
  });
});
