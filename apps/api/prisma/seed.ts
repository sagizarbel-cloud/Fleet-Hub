// Fake seed fleet (SPEC A2). Every value here is generated: no real VINs, plates, codes or people.
import { faker } from '@faker-js/faker';
import { hash } from '@node-rs/argon2';
import {
  EventType,
  InspectionKind,
  MalfunctionSeverity,
  MalfunctionState,
  Prisma,
  PrismaClient,
  type VehicleCategory,
} from '@prisma/client';
import {
  DEFAULT_FLEET_VIEW,
  deriveStatus,
  type FleetViewSettings,
  type VehicleTypeCode,
} from '@fleet-hub/shared';
import { encryptStartCode } from '@fleet-hub/shared/crypto';
import { rm } from 'node:fs/promises';
import sharp from 'sharp';
import { resolveStored, storeUpload } from '../src/lib/uploads';

if (process.env.NODE_ENV === 'production') {
  throw new Error('Refusing to seed a production database.');
}
const codeKey = process.env.FLEET_CODE_KEY ?? '';
if (!codeKey) throw new Error('FLEET_CODE_KEY is not set. Run `pnpm env:init` first.');

faker.seed(20261025);
const db = new PrismaClient();
const NOW = new Date();
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);
const daysAhead = (n: number) => new Date(NOW.getTime() + n * DAY);

// ---------- Lookups ----------

const departments = [
  { code: 'earthworks', nameEn: 'Earthworks', nameHe: 'עבודות עפר' },
  { code: 'roads', nameEn: 'Roads', nameHe: 'כבישים' },
  { code: 'logistics', nameEn: 'Logistics', nameHe: 'לוגיסטיקה' },
  { code: 'maintenance', nameEn: 'Maintenance', nameHe: 'אחזקה' },
];

const locations = [
  { code: 'north_yard', nameEn: 'North yard', nameHe: 'חצר צפון' },
  { code: 'central_depot', nameEn: 'Central depot', nameHe: 'מחסן מרכזי' },
  { code: 'site_a', nameEn: 'Site A', nameHe: 'אתר א׳' },
  { code: 'site_b', nameEn: 'Site B', nameHe: 'אתר ב׳' },
  { code: 'workshop', nameEn: 'Workshop', nameHe: 'מוסך' },
];

const vehicleTypes: {
  code: VehicleTypeCode;
  nameEn: string;
  nameHe: string;
  category: VehicleCategory;
}[] = [
  {
    code: 'tracked_excavator',
    nameEn: 'Tracked excavator',
    nameHe: 'מחפר זחלי',
    category: 'EQUIPMENT',
  },
  {
    code: 'wheeled_excavator',
    nameEn: 'Wheeled excavator',
    nameHe: 'מחפר גלגלי',
    category: 'EQUIPMENT',
  },
  { code: 'backhoe_loader', nameEn: 'Backhoe loader', nameHe: 'מחפרון', category: 'EQUIPMENT' },
  { code: 'wheel_loader', nameEn: 'Wheel loader', nameHe: 'שופל', category: 'EQUIPMENT' },
  { code: 'skid_steer', nameEn: 'Skid-steer', nameHe: 'בובקט', category: 'EQUIPMENT' },
  { code: 'tractor', nameEn: 'Tractor', nameHe: 'טרקטור', category: 'EQUIPMENT' },
  { code: 'forklift', nameEn: 'Forklift', nameHe: 'מלגזה', category: 'EQUIPMENT' },
  { code: 'truck', nameEn: 'Truck', nameHe: 'משאית', category: 'ROAD' },
  { code: 'pickup', nameEn: 'Pickup', nameHe: 'טנדר', category: 'ROAD' },
  { code: 'van', nameEn: 'Van', nameHe: 'מסחרית', category: 'ROAD' },
  { code: 'trailer', nameEn: 'Equipment trailer', nameHe: 'נגרר ציוד', category: 'ROAD' },
  { code: 'compressor', nameEn: 'Mobile compressor', nameHe: 'מדחס נייד', category: 'EQUIPMENT' },
  { code: 'other', nameEn: 'Other', nameHe: 'אחר', category: 'EQUIPMENT' },
];

const fluidTypes = [
  { code: 'engine_oil', nameEn: 'Engine oil', nameHe: 'שמן מנוע' },
  { code: 'hydraulic_oil', nameEn: 'Hydraulic oil', nameHe: 'שמן הידראולי' },
  { code: 'coolant', nameEn: 'Coolant', nameHe: 'נוזל קירור' },
  { code: 'brake_fluid', nameEn: 'Brake fluid', nameHe: 'נוזל בלמים' },
  { code: 'adblue', nameEn: 'AdBlue', nameHe: 'AdBlue' },
  { code: 'grease', nameEn: 'Grease', nameHe: 'גריז' },
];

const receiptCategories = [
  { code: 'fuel', nameEn: 'Fuel', nameHe: 'דלק' },
  { code: 'service', nameEn: 'Service', nameHe: 'טיפול' },
  { code: 'parts', nameEn: 'Parts', nameHe: 'חלקים' },
  { code: 'tools', nameEn: 'Tools', nameHe: 'כלים' },
  { code: 'tires', nameEn: 'Tires', nameHe: 'צמיגים' },
  { code: 'inspection', nameEn: 'Inspection', nameHe: 'בדיקה' },
  { code: 'insurance', nameEn: 'Insurance', nameHe: 'ביטוח' },
  { code: 'other', nameEn: 'Other', nameHe: 'אחר' },
];

// ---------- Fleet plan: 16 vehicles, 10 green / 4 amber / 2 red ----------

type Plan = 'green' | 'amber' | 'red_malfunction' | 'red_test';

const fleet: {
  serial: string;
  type: VehicleTypeCode;
  make: string;
  model: string;
  dept: string;
  plan: Plan;
}[] = [
  {
    serial: 'EX-101',
    type: 'tracked_excavator',
    make: 'Caterpillar',
    model: '320',
    dept: 'earthworks',
    plan: 'green',
  },
  {
    serial: 'EX-102',
    type: 'tracked_excavator',
    make: 'Komatsu',
    model: 'PC210',
    dept: 'earthworks',
    plan: 'red_malfunction',
  },
  {
    serial: 'EX-201',
    type: 'wheeled_excavator',
    make: 'Volvo',
    model: 'EW160',
    dept: 'roads',
    plan: 'green',
  },
  {
    serial: 'WL-401',
    type: 'wheel_loader',
    make: 'Volvo',
    model: 'L90',
    dept: 'earthworks',
    plan: 'amber',
  },
  {
    serial: 'WL-402',
    type: 'wheel_loader',
    make: 'Caterpillar',
    model: '966',
    dept: 'roads',
    plan: 'amber',
  },
  {
    serial: 'EX-103',
    type: 'tracked_excavator',
    make: 'Caterpillar',
    model: '330',
    dept: 'earthworks',
    plan: 'green',
  },
  {
    serial: 'SS-501',
    type: 'skid_steer',
    make: 'Bobcat',
    model: 'S650',
    dept: 'roads',
    plan: 'green',
  },
  {
    serial: 'TR-601',
    type: 'tractor',
    make: 'John Deere',
    model: '6120M',
    dept: 'maintenance',
    plan: 'amber',
  },
  {
    serial: 'FL-701',
    type: 'forklift',
    make: 'Toyota',
    model: '8FD25',
    dept: 'logistics',
    plan: 'green',
  },
  {
    serial: 'TK-801',
    type: 'truck',
    make: 'Volvo',
    model: 'FH 500',
    dept: 'logistics',
    plan: 'green',
  },
  {
    serial: 'TK-802',
    type: 'truck',
    make: 'Mercedes-Benz',
    model: 'Actros',
    dept: 'logistics',
    plan: 'red_test',
  },
  {
    serial: 'PU-901',
    type: 'pickup',
    make: 'Toyota',
    model: 'Hilux',
    dept: 'maintenance',
    plan: 'green',
  },
  {
    serial: 'PU-902',
    type: 'pickup',
    make: 'Mitsubishi',
    model: 'Triton',
    dept: 'roads',
    plan: 'amber',
  },
  {
    serial: 'PU-903',
    type: 'pickup',
    make: 'Toyota',
    model: 'Hilux',
    dept: 'earthworks',
    plan: 'green',
  },
  {
    serial: 'VN-951',
    type: 'van',
    make: 'Ford',
    model: 'Transit',
    dept: 'logistics',
    plan: 'green',
  },
  {
    serial: 'TL-971',
    type: 'trailer',
    make: 'Humbaur',
    model: 'HS 653',
    dept: 'logistics',
    plan: 'green',
  },
  {
    serial: 'CP-991',
    type: 'compressor',
    make: 'Atlas Copco',
    model: 'XAS 185',
    dept: 'maintenance',
    plan: 'green',
  },
];

const serviceTexts = [
  'Periodic service: oil and filters',
  'Hydraulic hose replaced',
  'Brake pads replaced',
  'Air filter and fuel filter',
  'Greased pivot points',
  'Track tension adjusted',
  'Battery replaced',
  'Tire rotation and alignment',
];
const malfunctionTexts = [
  'Hydraulic leak at boom cylinder',
  'Engine warning light',
  'Starter motor intermittent',
  'Cracked mirror',
  'AC not cooling',
  'Coolant temperature high',
];

/** Fake Israeli-format license number: 7 or 8 digits, unique within the seed. */
const usedPlates = new Set<string>();
function fakePlate(): string {
  for (;;) {
    const plate = faker.string.numeric({
      length: faker.helpers.arrayElement([7, 8]),
      allowLeadingZeros: false,
    });
    if (!usedPlates.has(plate)) {
      usedPlates.add(plate);
      return plate;
    }
  }
}

const money = (min: number, max: number) => new Prisma.Decimal(faker.number.int({ min, max }));

/** Vehicles whose fuel log shows one sudden drop in economy, about three weeks ago. */
const DROP_VEHICLES = new Set(['PU-901', 'EX-103']);
const uploadDir = process.env.UPLOAD_DIR ?? './uploads';

/** A plain fake receipt image: no real vendor, amount or plate. */
async function fakeReceiptPng(title: string, lines: string[]) {
  const text = [title, ...lines]
    .map((l, i) => `<text x="32" y="${70 + i * 44}" font-size="${i ? 24 : 34}">${l}</text>`)
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="#f4f1ea"/><g font-family="monospace" fill="#222">${text}</g><text x="32" y="760" font-size="20" fill="#a8181a" font-family="monospace">SAMPLE - NOT A REAL DOCUMENT</text></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** A one-page PDF with a few lines of text, with a correct cross-reference table. */
function fakePdf(lines: string[]) {
  const content = lines
    .map((l, i) => `BT /F1 ${i ? 14 : 20} Tf 60 ${760 - i * 30} Td (${l}) Tj ET`)
    .join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

async function wipe() {
  // Remove the files of the attachments about to be wiped, so uploads/ doesn't fill with orphans.
  const files = await db.attachment.findMany({ select: { storagePath: true, thumbPath: true } });
  for (const f of files) {
    for (const rel of [f.storagePath, f.thumbPath]) {
      if (rel) await rm(resolveStored(uploadDir, rel), { force: true }).catch(() => undefined);
    }
  }
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length) {
    const list = tables.map((t) => `"${t.tablename}"`).join(', ');
    await db.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
  }
}

async function main() {
  await wipe();

  // Users
  const password = await hash(process.env.SEED_PASSWORD ?? 'fleethub-dev');
  const [admin, editor, viewer] = await Promise.all(
    [
      { email: 'admin@fleethub.test', role: 'ADMIN' as const, canViewStartCodes: true },
      { email: 'editor@fleethub.test', role: 'EDITOR' as const, canViewStartCodes: false },
      { email: 'viewer@fleethub.test', role: 'VIEWER' as const, canViewStartCodes: false },
    ].map((u) =>
      db.user.create({ data: { ...u, name: faker.person.fullName(), passwordHash: password } }),
    ),
  );
  const userIds = [admin!.id, editor!.id];
  const quoteAuthors = [admin!.id, editor!.id, viewer!.id];

  // Lookups
  await db.department.createMany({ data: departments.map((d, i) => ({ ...d, sortOrder: i })) });
  await db.location.createMany({ data: locations.map((d, i) => ({ ...d, sortOrder: i })) });
  await db.vehicleType.createMany({
    data: vehicleTypes.map((t, i) => ({
      ...t,
      usageUnit: t.category === 'ROAD' ? 'KM' : 'HOURS',
      defaultHasStartCode: t.code === 'pickup',
      sortOrder: i,
    })),
  });
  await db.fluidType.createMany({ data: fluidTypes.map((d, i) => ({ ...d, sortOrder: i })) });
  await db.receiptCategory.createMany({
    data: receiptCategories.map((d, i) => ({ ...d, sortOrder: i })),
  });

  const byCode = async <T extends { id: string; code: string }>(rows: Promise<T[]>) =>
    Object.fromEntries((await rows).map((r) => [r.code, r]));
  const deptBy = await byCode(db.department.findMany());
  const locBy = await byCode(db.location.findMany());
  const typeBy = await byCode(db.vehicleType.findMany());
  const fluidList = await db.fluidType.findMany();
  const catBy = await byCode(db.receiptCategory.findMany());

  const suppliers = await Promise.all(
    Array.from({ length: 4 }, () =>
      db.supplier.create({ data: { name: faker.company.name(), phone: faker.phone.number() } }),
    ),
  );

  const events: Prisma.EventCreateManyInput[] = [];
  const event = (
    type: EventType,
    vehicleId: string,
    occurredAt: Date,
    params: Prisma.InputJsonObject = {},
    source?: { type: string; id: string },
  ) =>
    events.push({
      type,
      vehicleId,
      occurredAt,
      params,
      userId: faker.helpers.arrayElement(userIds),
      sourceType: source?.type ?? null,
      sourceId: source?.id ?? null,
    });

  const vehicleIds: Record<string, string> = {};
  const locCodes = locations.map((l) => l.code);

  for (const plan of fleet) {
    const type = typeBy[plan.type]!;
    const road = type.category === 'ROAD';
    const isPickup = plan.type === 'pickup';
    const startUsage = road
      ? faker.number.int({ min: 20_000, max: 180_000 })
      : faker.number.int({ min: 800, max: 9_000 });
    const homeLoc = faker.helpers.arrayElement(locCodes);
    const testDate = daysAgo(faker.number.int({ min: 30, max: 160 }));
    const annualTestExpiry =
      plan.plan === 'red_test' ? daysAgo(12) : new Date(testDate.getTime() + 365 * DAY);
    const insuranceDate = daysAgo(faker.number.int({ min: 20, max: 170 }));
    const insuranceExpiry = new Date(insuranceDate.getTime() + 365 * DAY);
    const purchaseDate = faker.date.past({ years: 8, refDate: daysAgo(200) });

    const vehicle = await db.vehicle.create({
      data: {
        serial: plan.serial,
        vin: faker.vehicle.vin(),
        licenseNo: fakePlate(),
        typeId: type.id,
        make: plan.make,
        model: plan.model,
        year: purchaseDate.getFullYear(),
        departmentId: deptBy[plan.dept]!.id,
        locationId: locBy[homeLoc]!.id,
        operatorName: faker.person.fullName(),
        annualTestExpiry,
        insuranceExpiry,
        safetyCheckExpiry: road ? null : daysAhead(faker.number.int({ min: 20, max: 300 })),
        hasStartCode: isPickup,
        startCodeEnc: isPickup ? encryptStartCode(faker.string.numeric(4), codeKey) : null,
        purchaseDate,
        supplierId: faker.helpers.arrayElement(suppliers).id,
        purchasePrice: road ? money(150_000, 650_000) : money(250_000, 1_200_000),
        warrantyTerms: '24 months / 3,000 hours',
        warrantyExpiry: new Date(purchaseDate.getTime() + 730 * DAY),
        createdAt: daysAgo(185),
      },
    });
    vehicleIds[plan.serial] = vehicle.id;
    event('VEHICLE_CREATED', vehicle.id, daysAgo(182));

    // Fuel log, roughly weekly, with usage climbing over six months. Litres follow a steady
    // economy with a little noise; a few vehicles get one sudden drop to show the flag.
    let usage = startUsage;
    const economy = road
      ? faker.number.float({ min: 7.5, max: 11, fractionDigits: 1 }) // km per litre
      : faker.number.float({ min: 12, max: 24, fractionDigits: 1 }); // litres per hour
    const dropAt = DROP_VEHICLES.has(plan.serial) ? 24 : -1;
    let first = true;
    // Trailers have no engine: no fuel log.
    for (
      let d = 180;
      plan.type !== 'trailer' && d > 0;
      d -= faker.number.int({ min: 5, max: 10 })
    ) {
      // About one tank between fill-ups.
      const step = road
        ? faker.number.int({ min: 300, max: 650 })
        : faker.number.int({ min: 14, max: 32 });
      usage += step;
      const noise = faker.number.float({ min: 0.93, max: 1.07 });
      const worse = dropAt >= 0 && d <= dropAt && d > dropAt - 10 ? 1.45 : 1;
      const liters = first
        ? faker.number.int({ min: 40, max: 120 })
        : Math.round((road ? step / economy : step * economy) * noise * worse * 10) / 10;
      first = false;
      const entry = await db.fuelEntry.create({
        data: {
          vehicleId: vehicle.id,
          date: daysAgo(d),
          liters: new Prisma.Decimal(liters),
          odometerKm: road ? usage : null,
          engineHours: road ? null : usage,
          cost: new Prisma.Decimal(Math.round(liters * 7.4)),
        },
      });
      event('FUEL_ADDED', vehicle.id, entry.date, { liters }, { type: 'FuelEntry', id: entry.id });
    }

    // Services every ~2 months
    for (const d of [170, 110, 50].map((x) => x + faker.number.int({ min: -8, max: 8 }))) {
      const description = faker.helpers.arrayElement(serviceTexts);
      const service = await db.serviceRecord.create({
        data: {
          vehicleId: vehicle.id,
          date: daysAgo(d),
          description,
          vendor: faker.company.name(),
          cost: money(600, 9_000),
          odometerKm: road ? usage - d * 120 : null,
          engineHours: road ? null : usage - d * 6,
        },
      });
      event(
        'SERVICE',
        vehicle.id,
        service.date,
        { description },
        { type: 'ServiceRecord', id: service.id },
      );
    }

    // Fluid top-ups
    for (let i = 0; i < faker.number.int({ min: 3, max: 6 }); i++) {
      const fluid = faker.helpers.arrayElement(fluidList);
      const liters = faker.number.int({ min: 1, max: 20 });
      const add = await db.fluidAddition.create({
        data: {
          vehicleId: vehicle.id,
          date: daysAgo(faker.number.int({ min: 2, max: 178 })),
          fluidTypeId: fluid.id,
          liters: new Prisma.Decimal(liters),
        },
      });
      event(
        'FLUID_ADDED',
        vehicle.id,
        add.date,
        { fluid: fluid.code, liters },
        { type: 'FluidAddition', id: add.id },
      );
    }

    // Movements between fake sites, ending at the current location
    let from = faker.helpers.arrayElement(locCodes.filter((c) => c !== homeLoc));
    const moves = faker.number.int({ min: 1, max: 3 });
    for (let i = 0; i < moves; i++) {
      const to =
        i === moves - 1 ? homeLoc : faker.helpers.arrayElement(locCodes.filter((c) => c !== from));
      const move = await db.movement.create({
        data: {
          vehicleId: vehicle.id,
          date: daysAgo(150 - i * 45 + faker.number.int({ min: 0, max: 10 })),
          fromLocationId: locBy[from]!.id,
          toLocationId: locBy[to]!.id,
        },
      });
      event('MOVEMENT', vehicle.id, move.date, { from, to }, { type: 'Movement', id: move.id });
      from = to;
    }

    // Inspections: annual test, insurance, and a certified-inspector check for equipment
    const inspections: { kind: InspectionKind; date: Date; validUntil: Date }[] = [
      {
        kind: 'ANNUAL_TEST',
        date: plan.plan === 'red_test' ? daysAgo(377) : testDate,
        validUntil: annualTestExpiry,
      },
      { kind: 'INSURANCE', date: insuranceDate, validUntil: insuranceExpiry },
    ];
    if (!road) {
      inspections.push({
        kind: 'SAFETY_CHECK',
        date: daysAgo(faker.number.int({ min: 30, max: 160 })),
        validUntil: vehicle.safetyCheckExpiry!,
      });
    }
    for (const insp of inspections) {
      const row = await db.inspection.create({
        data: {
          vehicleId: vehicle.id,
          ...insp,
          inspector: insp.kind === 'INSURANCE' ? null : faker.person.fullName(),
          cost: money(300, 4_500),
        },
      });
      if (insp.date > daysAgo(185)) {
        event(
          'INSPECTION',
          vehicle.id,
          row.date,
          { kind: insp.kind },
          { type: 'Inspection', id: row.id },
        );
      }
    }

    // Malfunctions: some resolved history, plus the open ones the plan calls for
    const malfunctions: {
      severity: MalfunctionSeverity;
      state: MalfunctionState;
      daysAgo: number;
    }[] = [];
    for (let i = 0; i < faker.number.int({ min: 0, max: 2 }); i++) {
      malfunctions.push({
        severity: faker.helpers.arrayElement(['LOW', 'MEDIUM', 'HIGH'] as const),
        state: 'RESOLVED',
        daysAgo: faker.number.int({ min: 40, max: 170 }),
      });
    }
    if (plan.plan === 'amber') {
      malfunctions.push({
        severity: faker.helpers.arrayElement(['LOW', 'MEDIUM', 'HIGH'] as const),
        state: faker.helpers.arrayElement(['OPEN', 'IN_PROGRESS'] as const),
        daysAgo: faker.number.int({ min: 2, max: 20 }),
      });
    }
    if (plan.plan === 'red_malfunction') {
      malfunctions.push({ severity: 'CRITICAL', state: 'OPEN', daysAgo: 4 });
    }
    for (const m of malfunctions) {
      const description = faker.helpers.arrayElement(malfunctionTexts);
      const reportedAt = daysAgo(m.daysAgo);
      const resolvedAt = m.state === 'RESOLVED' ? new Date(reportedAt.getTime() + 3 * DAY) : null;
      const row = await db.malfunction.create({
        data: {
          vehicleId: vehicle.id,
          reportedAt,
          resolvedAt,
          severity: m.severity,
          state: m.state,
          description,
          downtimeHours: m.state === 'RESOLVED' ? faker.number.int({ min: 2, max: 72 }) : null,
          cost: m.state === 'RESOLVED' ? money(200, 12_000) : null,
        },
      });
      const src = { type: 'Malfunction', id: row.id };
      event(
        'MALFUNCTION_REPORTED',
        vehicle.id,
        reportedAt,
        { severity: m.severity, description },
        src,
      );
      if (resolvedAt) event('MALFUNCTION_RESOLVED', vehicle.id, resolvedAt, { description }, src);
    }

    const note = await db.note.create({
      data: {
        vehicleId: vehicle.id,
        body: faker.lorem.sentence(),
        createdAt: daysAgo(faker.number.int({ min: 5, max: 90 })),
      },
    });
    event('NOTE_ADDED', vehicle.id, note.createdAt, {}, { type: 'Note', id: note.id });

    const lastService = 50;
    await db.vehicle.update({
      where: { id: vehicle.id },
      data: {
        odometerKm: road ? usage : null,
        engineHours: road ? null : usage,
        nextServiceKm: road ? usage + faker.number.int({ min: 500, max: 9_000 }) : null,
        nextServiceHours: road ? null : usage + faker.number.int({ min: 20, max: 240 }),
        nextServiceDate: daysAhead(120 - lastService + faker.number.int({ min: -20, max: 40 })),
        readinessPct:
          plan.plan === 'green'
            ? 100
            : plan.plan === 'amber'
              ? faker.number.int({ min: 60, max: 85 })
              : 0,
        status: deriveStatus({ malfunctions, annualTestExpiry, insuranceExpiry }, NOW),
      },
    });
  }

  // Items and their assignment history
  const itemDefs = [
    { kind: 'bucket', name: 'Digging bucket 1.2 m³', model: 'GP-1200', spec: '1.2 m³' },
    { kind: 'bucket', name: 'Grading bucket', model: 'GR-1800', spec: '1800 mm' },
    { kind: 'hydraulic_breaker', name: 'Hydraulic breaker', model: 'HB-2000', spec: '2,000 kg' },
    { kind: 'concrete_crusher', name: 'Concrete crusher', model: 'CC-25', spec: '25 t' },
    { kind: 'generator', name: 'Generator', model: 'G-20', spec: '20 kVA' },
    { kind: 'equipment_box', name: 'Equipment box', model: 'EB-L', spec: 'Large' },
    { kind: 'equipment_box', name: 'Equipment box', model: 'EB-M', spec: 'Medium' },
    { kind: 'adapter', name: 'Quick coupler', model: 'QC-20', spec: '20 t class' },
    { kind: 'pallet_forks', name: 'Pallet forks', model: 'PF-1500', spec: '1,500 mm' },
    { kind: 'tool', name: 'Diagnostic scanner', model: 'DS-4', spec: 'OBD / J1939' },
  ];
  const hosts = [
    'EX-101',
    'EX-102',
    'EX-201',
    'WL-402',
    'WL-401',
    'SS-501',
    'TK-801',
    'PU-901',
    'PU-903',
    'VN-951',
  ];
  for (const [i, def] of itemDefs.entries()) {
    const current = hosts[i]!;
    const previous = faker.helpers.arrayElement(hosts.filter((h) => h !== current));
    const item = await db.item.create({
      data: {
        ...def,
        serial: `IT-${faker.string.alphanumeric({ length: 6, casing: 'upper' })}`,
        currentVehicleId: vehicleIds[current]!,
      },
    });
    const movedAt = daysAgo(faker.number.int({ min: 20, max: 90 }));
    await db.itemAssignment.createMany({
      data: [
        {
          itemId: item.id,
          vehicleId: vehicleIds[previous]!,
          assignedAt: daysAgo(175),
          removedAt: movedAt,
        },
        { itemId: item.id, vehicleId: vehicleIds[current]!, assignedAt: movedAt },
      ],
    });
    const params = { item: def.name, serial: item.serial };
    event('ITEM_REMOVED', vehicleIds[previous]!, movedAt, params, { type: 'Item', id: item.id });
    event('ITEM_ASSIGNED', vehicleIds[current]!, movedAt, params, { type: 'Item', id: item.id });
  }

  // Receipts tagged to vehicles
  const serials = Object.keys(vehicleIds);
  for (let i = 0; i < 32; i++) {
    const cat = faker.helpers.arrayElement(receiptCategories).code;
    const tagged = faker.helpers.arrayElements(
      serials,
      faker.helpers.weightedArrayElement([
        { weight: 8, value: 1 },
        { weight: 2, value: 2 },
      ]),
    );
    const amount = money(80, 8_000);
    const doc = await db.document.create({
      data: {
        kind: faker.helpers.arrayElement(['RECEIPT', 'RECEIPT', 'INVOICE'] as const),
        date: daysAgo(faker.number.int({ min: 1, max: 180 })),
        vendor: faker.company.name(),
        amount,
        categoryId: catBy[cat]!.id,
        vehicles: { create: tagged.map((s) => ({ vehicleId: vehicleIds[s]! })) },
      },
    });
    for (const s of tagged) {
      event(
        'DOCUMENT_ADDED',
        vehicleIds[s]!,
        doc.date,
        { category: cat, amount: amount.toNumber() },
        { type: 'Document', id: doc.id },
      );
    }
  }

  // Price quotes with line items, linked to vehicles
  const quoteStatuses = ['REQUESTED', 'RECEIVED', 'APPROVED', 'ORDERED', 'REJECTED'] as const;
  for (let i = 0; i < 5; i++) {
    const supplier = suppliers[i % suppliers.length]!;
    const date = daysAgo(faker.number.int({ min: 3, max: 120 }));
    const linked = faker.helpers.arrayElements(serials, faker.number.int({ min: 1, max: 3 }));
    const quote = await db.quote.create({
      data: {
        supplierId: supplier.id,
        date,
        validUntil: new Date(date.getTime() + 30 * DAY),
        status: quoteStatuses[i]!,
        // Mix of creators and visibility levels so the quote rules have something to filter.
        createdById: quoteAuthors[i % quoteAuthors.length]!,
        visibility: (['STANDARD', 'PUBLIC', 'STANDARD', 'ADMINS', 'PUBLIC'] as const)[i]!,
        lines: {
          create: Array.from({ length: faker.number.int({ min: 2, max: 5 }) }, (_, n) => ({
            item: faker.helpers.arrayElement([
              'Hydraulic pump',
              'Bucket teeth set',
              'Track roller',
              'Alternator',
              'Tire 12R22.5',
              'Filter kit',
              'Seat',
            ]),
            partNo: faker.string.alphanumeric({ length: 8, casing: 'upper' }),
            condition: faker.helpers.arrayElement([
              'IN_STOCK',
              'NEW',
              'NEEDS_REPLACEMENT',
            ] as const),
            quantity: faker.number.int({ min: 1, max: 8 }),
            unitPrice: money(90, 14_000),
            sortOrder: n,
          })),
        },
        vehicles: { create: linked.map((s) => ({ vehicleId: vehicleIds[s]! })) },
      },
    });
    for (const s of linked) {
      event(
        'QUOTE_LINKED',
        vehicleIds[s]!,
        date,
        { supplier: supplier.name },
        { type: 'Quote', id: quote.id },
      );
    }
  }

  await db.event.createMany({ data: events });

  // A few fake attachments: an invoice photo on recent services, a certificate on annual tests.
  let attachments = 0;
  for (const serial of ['EX-101', 'WL-401', 'PU-901', 'TK-801']) {
    const vehicleId = vehicleIds[serial]!;
    const service = await db.serviceRecord.findFirst({
      where: { vehicleId },
      orderBy: { date: 'desc' },
    });
    const test = await db.inspection.findFirst({
      where: { vehicleId, kind: 'ANNUAL_TEST' },
      orderBy: { date: 'desc' },
    });
    const files: { ownerType: string; ownerId: string; fileName: string; buf: Buffer }[] = [];
    if (service) {
      files.push({
        ownerType: 'ServiceRecord',
        ownerId: service.id,
        fileName: `invoice-${serial}.png`,
        buf: await fakeReceiptPng('INVOICE (SAMPLE)', [
          `Vehicle ${serial}`,
          service.date.toISOString().slice(0, 10),
          service.description.slice(0, 32),
          `Total ${service.cost?.toNumber() ?? 0} ILS`,
        ]),
      });
    }
    if (test) {
      files.push({
        ownerType: 'Inspection',
        ownerId: test.id,
        fileName: `annual-test-${serial}.pdf`,
        buf: fakePdf([
          'Annual test certificate (SAMPLE)',
          `Vehicle ${serial}`,
          `Valid until ${test.validUntil.toISOString().slice(0, 10)}`,
          'Not a real document',
        ]),
      });
    }
    for (const f of files) {
      const stored = await storeUpload(uploadDir, f.buf);
      await db.attachment.create({
        data: { ownerType: f.ownerType, ownerId: f.ownerId, fileName: f.fileName, ...stored },
      });
      attachments++;
    }
  }

  // Two shared fleet-table views (SPEC 5.4).
  const viewSettings = (v: Partial<FleetViewSettings>) =>
    ({ ...DEFAULT_FLEET_VIEW, ...v }) as unknown as Prisma.InputJsonObject;
  await db.savedView.createMany({
    data: [
      {
        name: 'Due within 30 days',
        createdById: admin!.id,
        settings: viewSettings({ due: true, sort: [{ id: 'nextExpiry', desc: false }] }),
      },
      {
        name: 'Machines by department',
        createdById: editor!.id,
        settings: viewSettings({
          groupBy: 'department',
          types: ['tracked_excavator', 'wheel_loader'],
          columns: [...DEFAULT_FLEET_VIEW.columns, 'economy30', 'maintenance3m', 'fuel3m'],
        }),
      },
    ],
  });

  const counts = await db.vehicle.groupBy({ by: ['status'], _count: true });
  const summary = Object.fromEntries(counts.map((c) => [c.status, c._count]));
  console.log(
    `Seeded ${fleet.length} vehicles (${JSON.stringify(summary)}), ${events.length} events, ${attachments} attachments.`,
  );
  console.log(
    'Users: admin@fleethub.test, editor@fleethub.test, viewer@fleethub.test (password from SEED_PASSWORD).',
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
