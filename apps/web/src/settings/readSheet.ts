import ExcelJS from 'exceljs';
import { IMPORT_MAX_ROWS } from '@fleet-hub/shared';

export type Cell = string | number | boolean | null;

// What one import takes (the API checks the same).
const MAX_COLUMNS = 100;
const MAX_TEXT = 2_000;

export interface SheetData {
  name: string;
  /** The sheet row the headers are on (1 when nothing is above them). */
  headerRow: number;
  headers: string[];
  rows: Cell[][];
  /** Data rows past the import limit, dropped. */
  cut: number;
}

/** A cell as plain JSON: dates as ISO days, formulas as their result, rich text as text. */
export function cellValue(v: ExcelJS.CellValue): Cell {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'string') return v.trim() === '' ? null : v.trim().slice(0, MAX_TEXT);
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  if (typeof v === 'object') {
    if ('result' in v) return cellValue(v.result as ExcelJS.CellValue);
    if ('richText' in v) return cellValue(v.richText.map((r) => r.text).join(''));
    if ('text' in v) return cellValue(String(v.text));
    if ('error' in v) return null;
  }
  return null;
}

/** Every sheet of an .xlsx file: the first non-empty row is the header row. */
export async function readWorkbook(data: ArrayBuffer): Promise<SheetData[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data);
  return wb.worksheets.map((ws) => {
    const byNumber = new Map<number, Cell[]>();
    ws.eachRow({ includeEmpty: false }, (row) => {
      // row.values is 1-based.
      const values = row.values as ExcelJS.CellValue[];
      const cells = Array.from({ length: Math.max(0, values.length - 1) }, (_, c) =>
        cellValue(values[c + 1]),
      );
      if (cells.some((c) => c !== null)) byNumber.set(row.number, cells);
    });
    const numbers = [...byNumber.keys()].sort((a, b) => a - b);
    const headerRow = numbers[0] ?? 1;
    const head = byNumber.get(headerRow) ?? [];
    const last = numbers.at(-1) ?? headerRow;
    // Blank rows stay in place (the server skips them), so row numbers match the sheet.
    const body = Array.from(
      { length: last - headerRow },
      (_, i) => byNumber.get(headerRow + 1 + i) ?? [],
    );
    const width = Math.min(MAX_COLUMNS, Math.max(head.length, ...body.map((r) => r.length), 0));
    const headers = Array.from({ length: width }, (_, i) => {
      const h = head[i];
      return h === null || h === undefined ? '' : String(h);
    });
    const rows = body.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? null));
    return {
      name: ws.name,
      headerRow,
      headers,
      rows: rows.slice(0, IMPORT_MAX_ROWS),
      cut: Math.max(0, rows.length - IMPORT_MAX_ROWS),
    };
  });
}
