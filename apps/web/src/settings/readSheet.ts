import ExcelJS from 'exceljs';
import { IMPORT_MAX_ROWS } from '@fleet-hub/shared';

export type Cell = string | number | boolean | null;

// What one import takes (the API checks the same).
const MAX_COLUMNS = 100;
const MAX_TEXT = 2_000;

export interface SheetData {
  name: string;
  /** The sheet row the headers are on: the first row that looks like headers. */
  headerRow: number;
  headers: string[];
  rows: Cell[][];
  /** Data rows past the import limit, dropped. */
  cut: number;
  /** The first rows with anything in them, any of which the user may pick as the header row. */
  headerChoices: number[];
  /** Every non-empty row by its sheet row number, to read the sheet again from another header row. */
  cells: Map<number, Cell[]>;
}

const HEADER_SEARCH = 10;

/**
 * Hand-kept sheets often have a title (merged across the columns) or a note above the
 * headers. The header row is the first one with about as many different text cells as the
 * fullest of the top rows.
 */
export function guessHeaderRow(cells: Map<number, Cell[]>, numbers: number[]): number {
  const top = numbers.slice(0, HEADER_SEARCH);
  const texts = top.map(
    (n) => new Set((cells.get(n) ?? []).filter((c) => typeof c === 'string')).size,
  );
  const most = Math.max(0, ...texts);
  const need = Math.max(2, Math.ceil(most * 0.6));
  const i = texts.findIndex((t) => t >= need);
  return top[i === -1 ? 0 : i] ?? 1;
}

/** The sheet read with its headers on `headerRow`. */
export function atHeaderRow(sheet: SheetData, headerRow: number): SheetData {
  const { cells } = sheet;
  const numbers = [...cells.keys()].sort((a, b) => a - b);
  const head = cells.get(headerRow) ?? [];
  const last = numbers.at(-1) ?? headerRow;
  // Blank rows stay in place (the server skips them), so row numbers match the sheet.
  const body = Array.from({ length: Math.max(0, last - headerRow) }, (_, i) => {
    return cells.get(headerRow + 1 + i) ?? [];
  });
  const width = Math.min(MAX_COLUMNS, Math.max(head.length, ...body.map((r) => r.length), 0));
  const headers = Array.from({ length: width }, (_, i) => {
    const h = head[i];
    return h === null || h === undefined ? '' : String(h);
  });
  const rows = body.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? null));
  return {
    ...sheet,
    headerRow,
    headers,
    rows: rows.slice(0, IMPORT_MAX_ROWS),
    cut: Math.max(0, rows.length - IMPORT_MAX_ROWS),
  };
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

/** Every sheet of an .xlsx file, each read from the row that looks like its headers. */
export async function readWorkbook(data: ArrayBuffer): Promise<SheetData[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data);
  return wb.worksheets.map((ws) => {
    const cells = new Map<number, Cell[]>();
    ws.eachRow({ includeEmpty: false }, (row) => {
      // row.values is 1-based.
      const values = row.values as ExcelJS.CellValue[];
      const line = Array.from({ length: Math.max(0, values.length - 1) }, (_, c) =>
        cellValue(values[c + 1]),
      );
      if (line.some((c) => c !== null)) cells.set(row.number, line);
    });
    const numbers = [...cells.keys()].sort((a, b) => a - b);
    const sheet: SheetData = {
      name: ws.name,
      headerRow: 1,
      headers: [],
      rows: [],
      cut: 0,
      headerChoices: numbers.slice(0, HEADER_SEARCH),
      cells,
    };
    return atHeaderRow(sheet, guessHeaderRow(cells, numbers));
  });
}
