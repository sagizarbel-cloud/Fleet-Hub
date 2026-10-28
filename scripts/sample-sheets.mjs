// Writes made-up Excel sheets to docs/samples/, shaped like the ones a fleet office keeps by hand:
// a title above the headers, Hebrew and English headers, units in the cells, plates instead of
// serials, dates as text, a totals row. Every value is fake; the serials match the seed fleet.
// Run: pnpm samples
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ExcelJS = createRequire(join(root, 'apps/web/package.json'))('exceljs');
const OUT = join(root, 'docs/samples');
mkdirSync(OUT, { recursive: true });

const d = (y, m, day) => new Date(Date.UTC(y, m - 1, day));

/** One sheet: an optional title row (merged across), a blank row, headers, then rows. */
function addSheet(wb, name, { title, headers, rows, rtl = true, total }) {
  const ws = wb.addWorksheet(name, { views: [{ rightToLeft: rtl }] });
  if (title) {
    ws.addRow([title]).font = { bold: true, size: 14 };
    ws.mergeCells(1, 1, 1, headers.length);
    ws.addRow([]);
  }
  const head = ws.addRow(headers);
  head.font = { bold: true };
  head.eachCell((c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E5E5' } };
  });
  for (const r of rows) ws.addRow(r);
  if (total) {
    const first = head.number + 1;
    const last = head.number + rows.length;
    const cells = headers.map((_, i) =>
      i === 0
        ? total.label
        : total.columns.includes(i)
          ? { formula: `SUM(${col(i)}${first}:${col(i)}${last})` }
          : null,
    );
    ws.addRow(cells).font = { bold: true };
  }
  ws.columns.forEach((c) => (c.width = 16));
  for (const c of total?.dateColumns ?? []) ws.getColumn(c + 1).numFmt = 'dd/mm/yyyy';
  return ws;
}
const col = (i) => String.fromCharCode(65 + i);

async function save(wb, file) {
  await wb.xlsx.writeFile(join(OUT, file));
  console.log(`docs/samples/${file}`);
}

// ---------- Fleet list ----------
{
  const wb = new ExcelJS.Workbook();
  addSheet(wb, 'רשימת כלים', {
    title: 'רשימת כלי צמ"ה ורכבים - 2026',
    headers: [
      "מס' כלי",
      'סוג כלי',
      'יצרן',
      'דגם',
      'שנת ייצור',
      "מס' שלדה",
      "מס' רישוי",
      'מחלקה',
      'מיקום',
      'מפעיל / נהג',
      'ק"מ',
      'שעות מנוע',
      'טסט בתוקף עד',
      'ביטוח עד',
      'תסקיר עד',
      'הערות',
    ],
    rows: [
      [
        'EX-101',
        'מחפר זחלי',
        'Komatsu',
        'PC210',
        2019,
        null,
        null,
        'עבודות עפר',
        "אתר א'",
        'ישראל ישראלי',
        null,
        "8,450 ש'",
        null,
        d(2026, 12, 31),
        '1.3.27',
        null,
      ],
      [
        'ex 102',
        'מחפר זחלי',
        'Caterpillar',
        '330',
        2021,
        null,
        null,
        'עבודות עפר',
        'אתר ב׳',
        'משה כהן',
        null,
        6120,
        null,
        d(2026, 11, 30),
        d(2027, 2, 15),
        'הוחלף צמיד',
      ],
      [
        'WL-401',
        'שופל',
        'Caterpillar',
        '966',
        2020,
        null,
        null,
        'עבודות עפר',
        'חצר צפון',
        null,
        null,
        5300,
        null,
        d(2026, 10, 1),
        d(2026, 12, 1),
        null,
      ],
      [
        'PU-901',
        'טנדר',
        'Toyota',
        'Hilux',
        2022,
        null,
        '60-519-82',
        'לוגיסטיקה',
        'מחסן מרכזי',
        'דנה לוי',
        '61,240 ק"מ',
        null,
        '15/08/2027',
        '15/08/2027',
        null,
        null,
      ],
      [
        'EX-301',
        'מחפר זחלי',
        'Volvo',
        'EC220E',
        2023,
        'FAKEVLV0EC2200001',
        null,
        'עבודות עפר',
        "אתר א'",
        'יוסי מזרחי',
        null,
        1240,
        null,
        d(2027, 4, 30),
        d(2027, 1, 31),
        'כלי חדש',
      ],
      [
        'TK-803',
        'משאית',
        'Volvo',
        'FMX 460',
        2021,
        'FAKEVLVFMX4600002',
        '71-234-56',
        'לוגיסטיקה',
        'מחסן מרכזי',
        'אבי פרץ',
        184500,
        null,
        d(2027, 3, 1),
        d(2027, 3, 1),
        null,
        null,
      ],
      [
        'WL-403',
        'מעמיס אופני',
        'Caterpillar',
        '950',
        2018,
        null,
        null,
        'עבודות עפר',
        'חצר צפון',
        null,
        null,
        11200,
        null,
        d(2026, 12, 15),
        d(2027, 2, 1),
        'סוג לא ברשימה',
      ],
      [
        'PU-904',
        'טנדר',
        'Isuzu',
        'D-Max',
        2024,
        'FAKEJSZDMAX000003',
        '123-45-678',
        'אחזקה',
        'מוסך',
        'רונית שמש',
        12400,
        null,
        d(2027, 6, 1),
        d(2027, 6, 1),
        null,
        null,
      ],
    ],
  });
  addSheet(wb, 'Fleet (EN)', {
    rtl: false,
    headers: [
      'Unit No.',
      'Type',
      'Make',
      'Model',
      'Year',
      'VIN',
      'Plate',
      'Dept.',
      'Site',
      'Driver',
      'Odometer (km)',
      'Hours',
      'Test due',
      'Insurance due',
    ],
    rows: [
      [
        'TK-801',
        'Truck',
        'Mercedes',
        'Arocs',
        2020,
        null,
        null,
        'Logistics',
        'Central depot',
        'Ron Bar',
        '212,300',
        null,
        '01/05/2027',
        '01/05/2027',
      ],
      [
        'VN-951',
        'van',
        'Ford',
        'Transit',
        2021,
        null,
        null,
        'Maintenance',
        'workshop',
        null,
        98500,
        null,
        '2027-02-20',
        '2027-02-20',
      ],
      [
        'SS-502',
        'Skid-steer',
        'Bobcat',
        'S650',
        2022,
        'FAKEBOBS650000004',
        null,
        'Roads',
        'Site B',
        null,
        null,
        2100,
        null,
        '2027-01-10',
      ],
    ],
  });
  await save(wb, 'fleet-list.xlsx');
}

// ---------- Service log: vehicles by plate, costs with ₪, a totals row ----------
{
  const wb = new ExcelJS.Workbook();
  addSheet(wb, 'טיפולים 2026', {
    title: 'יומן טיפולים',
    headers: ['תאריך', 'מספר רישוי', 'תיאור העבודה', 'מוסך', 'עלות (₪)', 'ק"מ', 'שעות'],
    rows: [
      [
        '12/03/2026 08:30',
        '60-519-82',
        'טיפול 60,000 ק"מ',
        'מוסך הצפון',
        '1,250 ₪',
        '60,050',
        null,
      ],
      [d(2026, 4, 2), '64-273-68', 'החלפת רפידות בלמים', 'מוסך הצפון', 2480, 201200, null],
      ['2.5.26', '9009417', 'טיפול 8,000 שעות', 'שירות שטח', '₪ 3,900', null, '8,010'],
      [d(2026, 6, 14), '88-330-396', 'החלפת שיניים בכף', 'שירות שטח', 1150, null, 6050],
      [d(2026, 7, 1), '11-111-11', 'טיפול שנתי', 'מוסך הצפון', 900, null, null],
    ],
    total: { label: 'סה"כ', columns: [4] },
  });
  addSheet(wb, 'Service (EN)', {
    rtl: false,
    headers: ['Date', 'Vehicle', 'Work done', 'Garage', 'Cost', 'Mileage'],
    rows: [
      ['2026-05-20', 'VN-951', 'Oil and filters', 'City Garage', 'NIS 640', '97,900 km'],
      ['2026-08-11', 'PU-903', 'Tyres x4', 'City Garage', 2600, 88400],
    ],
  });
  await save(wb, 'service-log.xlsx');
}

// ---------- Malfunctions ----------
{
  const wb = new ExcelJS.Workbook();
  addSheet(wb, 'תקלות', {
    headers: [
      'תאריך דיווח',
      'כלי',
      'תיאור התקלה',
      'חומרה',
      'סטטוס',
      'תאריך תיקון',
      'עלות תיקון',
      'שעות השבתה',
    ],
    rows: [
      [
        d(2026, 2, 3),
        'EX-103',
        'דליפת שמן מצילינדר זרוע',
        'גבוה',
        'טופל',
        d(2026, 2, 6),
        '4,300',
        26,
      ],
      ['17/04/2026', 'WL-402', 'נורת מנוע דולקת', 'נמוך', 'פתוח', null, null, null],
      [d(2026, 5, 9), 'TK-802', 'בעיה במזגן', 'בינוני', 'בטיפול', null, 850, 0],
      [d(2026, 6, 21), 'SS-501', "צמיג פנצ'ר", 'קל', 'סגור', '22.6.2026', 300, 4],
    ],
  });
  await save(wb, 'malfunctions.xlsx');
}

// ---------- Fluids ----------
{
  const wb = new ExcelJS.Workbook();
  addSheet(wb, 'שמנים ונוזלים', {
    headers: ['תאריך', 'כלי', 'סוג שמן / נוזל', 'כמות (ליטר)', 'הערות'],
    rows: [
      [d(2026, 3, 1), 'EX-101', 'שמן הידראולי', "20 ל'", null],
      [d(2026, 3, 1), 'EX-101', 'שמן מנוע 15W40', 8, 'לפני טיפול'],
      [d(2026, 3, 15), 'WL-401', 'גריז', '2', null],
      [d(2026, 4, 4), 'TK-801', 'AdBlue', '30 ליטר', null],
      [d(2026, 4, 4), 'TK-801', 'נוזל קירור', 5, null],
    ],
  });
  await save(wb, 'fluids.xlsx');
}

// ---------- Fuel: a sheet per month ----------
{
  const wb = new ExcelJS.Workbook();
  const month = (name, m, rows) =>
    addSheet(wb, name, {
      headers: ['תאריך', "מס' רכב", 'ליטר', 'סכום', 'מד אוץ', 'מונה שעות'],
      rows: rows.map(([day, ...r]) => [d(2026, m, day), ...r]),
      total: { label: 'סה"כ', columns: [2, 3] },
    });
  month('ינואר', 1, [
    [5, 'PU-901', 62.4, '₪430.50', 60210, null],
    [9, 'EX-101', 210, 1460, null, 8320],
    [19, 'TK-801', 280, 1950, 209800, null],
  ]);
  month('פברואר', 2, [
    [3, 'PU-901', 58, 401, 60890, null],
    [11, 'EX-102', 240, 1670, null, 5990],
    [27, 'WL-401', 180, 1250, null, 5210],
  ]);
  await save(wb, 'fuel.xlsx');
}

// ---------- Movements ----------
{
  const wb = new ExcelJS.Workbook();
  addSheet(wb, 'העברות', {
    headers: ['תאריך', 'כלי', 'מאתר', 'לאתר', 'הערות'],
    rows: [
      [d(2026, 1, 12), 'EX-102', 'חצר צפון', "אתר א'", 'על מוביל'],
      [d(2026, 3, 2), 'EX-102', "אתר א'", 'אתר ב׳', null],
      [d(2026, 5, 17), 'SS-501', 'מחסן מרכזי', 'Site A', null],
      [d(2026, 6, 1), 'FL-701', null, 'מחסן מרכזי', null],
    ],
  });
  await save(wb, 'movements.xlsx');
}

// ---------- Inspections ----------
{
  const wb = new ExcelJS.Workbook();
  addSheet(wb, 'בדיקות ורישוי', {
    headers: ['כלי', 'סוג בדיקה', 'תאריך בדיקה', 'בתוקף עד', 'בודק', 'תוצאה', 'עלות', 'הערות'],
    rows: [
      ['PU-902', 'טסט שנתי', d(2026, 2, 10), d(2027, 2, 9), 'מכון רישוי דרום', 'עבר', 380, null],
      ['EX-101', 'תסקיר', d(2026, 3, 1), d(2027, 3, 1), 'בודק מוסמך', 'תקין', 650, null],
      [
        'WL-401',
        'תסקיר',
        d(2026, 4, 12),
        d(2026, 10, 12),
        'בודק מוסמך',
        'לא תקין',
        650,
        'נדרש תיקון בלמים',
      ],
      ['TK-802', 'ביטוח חובה', d(2026, 1, 1), d(2026, 12, 31), null, null, 5200, null],
    ],
  });
  await save(wb, 'inspections.xlsx');
}

// ---------- Notes ----------
{
  const wb = new ExcelJS.Workbook();
  addSheet(wb, 'הערות', {
    headers: ['כלי', 'הערה'],
    rows: [
      ['EX-103', 'לבדוק את הזחלים לפני העבודה בצפון'],
      ['TL-971', 'הנגרר חונה במחסן המרכזי'],
      ['PU-903', 'מפתח רזרבי במשרד'],
    ],
  });
  await save(wb, 'notes.xlsx');
}

// ---------- Equipment ----------
{
  const wb = new ExcelJS.Workbook();
  addSheet(wb, 'ציוד נלווה', {
    headers: ['פריט', 'סוג', 'דגם', 'מפרט', "מס' סידורי", 'משויך לכלי'],
    rows: [
      ['כף חפירה 1.2 קוב', 'כף', 'GP', '1.2 m³', 'BKT-FAKE-0101', 'EX-102'],
      ['פטיש הידראולי', 'פטיש הידראולי', 'HB-2000', '2 טון', 'HB-FAKE-0202', null],
      ['מצמד מהיר', 'מצמד מהיר', 'QC-30', null, 'QC-FAKE-0303', 'EX-101'],
      ['מזלגות למשטחים', 'מזלגות', null, '1.5 מ׳', null, 'WL-402'],
      ['גנרטור 10 קוו"א', 'גנרטור', 'G10', '10 kVA', 'GEN-FAKE-0404', null],
    ],
  });
  await save(wb, 'equipment.xlsx');
}
