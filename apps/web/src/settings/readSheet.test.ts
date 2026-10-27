import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { readWorkbook } from './readSheet';

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
});
