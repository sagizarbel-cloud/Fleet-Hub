import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { guessMapping, IMPORT_FIELDS, type ImportTarget } from '@fleet-hub/shared';
import { atHeaderRow, readWorkbook } from './readSheet';

const SAMPLES = '../../docs/samples';
const SAMPLE_TARGETS: Record<string, ImportTarget> = {
  'fleet-list': 'vehicles',
  'service-log': 'service',
  malfunctions: 'malfunctions',
  fluids: 'fluids',
  fuel: 'fuel',
  movements: 'movements',
  inspections: 'inspections',
  notes: 'notes',
  equipment: 'equipment',
};
const load = (file: string) => {
  const b = readFileSync(`${SAMPLES}/${file}.xlsx`);
  return readWorkbook(b.buffer.slice(b.byteOffset, b.byteOffset + b.length) as ArrayBuffer);
};

describe('readWorkbook', () => {
  it('reads headers, dates, formulas and rich text, keeping blank rows in place', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Fuel');
    ws.addRow([]);
    ws.addRow(['כלי', 'תאריך', 'ליטרים', 'הערות']);
    ws.addRow([
      'EX-1',
      new Date(Date.UTC(2026, 8, 1)),
      180,
      { richText: [{ text: 'full ' }, { text: 'tank' }] },
    ]);
    ws.addRow([]);
    ws.addRow(['EX-2', '08/09/2026', { formula: '100+75', result: 175 }, '  ']);
    wb.addWorksheet('Empty');
    const data = (await wb.xlsx.writeBuffer()) as ArrayBuffer;

    const [fuel, empty] = await readWorkbook(data);
    expect(fuel).toMatchObject({
      name: 'Fuel',
      headerRow: 2,
      headers: ['כלי', 'תאריך', 'ליטרים', 'הערות'],
    });
    expect(fuel!.rows).toEqual([
      ['EX-1', '2026-09-01', 180, 'full tank'],
      [null, null, null, null],
      ['EX-2', '08/09/2026', 175, null],
    ]);
    expect(empty).toMatchObject({ name: 'Empty', headers: [], rows: [], cut: 0 });
  });

  it('finds the headers under a merged title, and can read the sheet from another row', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('List');
    ws.addRow(['Fleet list 2026']);
    ws.mergeCells(1, 1, 1, 4);
    ws.addRow([]);
    ws.addRow(['Unit', 'Type', 'Make', 'Model']);
    ws.addRow(['EX-1', 'Excavator', 'Test', 'X1']);
    const [list] = await readWorkbook((await wb.xlsx.writeBuffer()) as ArrayBuffer);
    expect(list).toMatchObject({ headerRow: 3, headers: ['Unit', 'Type', 'Make', 'Model'] });
    expect(list!.rows).toEqual([['EX-1', 'Excavator', 'Test', 'X1']]);
    expect(list!.headerChoices).toEqual([1, 3, 4]);
    const fromTop = atHeaderRow(list!, 1);
    expect(fromTop.headers[0]).toBe('Fleet list 2026');
    expect(fromTop.rows).toHaveLength(3);
  });
});

describe('the sample sheets in docs/samples', () => {
  for (const [file, target] of Object.entries(SAMPLE_TARGETS))
    it(`${file}: every sheet's headers are found and its must-have columns matched`, async () => {
      for (const sheet of await load(file)) {
        expect(sheet.rows.length, sheet.name).toBeGreaterThan(0);
        const mapping = guessMapping(target, sheet.headers);
        for (const f of IMPORT_FIELDS[target].filter((x) => x.required)) {
          // A vehicle list only must have its serial: the rest can come from the fleet.
          if (target === 'vehicles' && f.key !== 'serial') continue;
          expect(mapping[f.key], `${sheet.name}: ${f.key}`).not.toBeNull();
        }
      }
    });
});
