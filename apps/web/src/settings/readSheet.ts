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

/**
 * Text bytes as a string. "CSV UTF-8" files read as they are; Excel's plain "CSV" on a Hebrew
 * Windows is Windows-1255, so bytes that aren't UTF-8 are read as that.
 */
export function decodeText(data: ArrayBuffer): string {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(data);
  } catch {
    text = new TextDecoder('windows-1255').decode(data);
  }
  return text.replace(/^\uFEFF/, '');
}

/** RFC 4180 rows: quoted cells may hold the delimiter, doubled quotes and line breaks. */
function splitCsv(text: string, d: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell.trim() === '') {
      quoted = true;
      cell = '';
    } else if (ch === d) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** Comma, semicolon or tab: whichever splits the first lines most evenly into the most cells. */
function guessDelimiter(text: string): string {
  const head = text
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '')
    .slice(0, 10)
    .join('\n');
  let best = ',';
  let bestScore = 0;
  for (const d of [',', ';', '\t']) {
    const counts = splitCsv(head, d).map((r) => r.length);
    const most = Math.max(1, ...counts);
    const score = most > 1 ? counts.filter((c) => c === most).length * most : 0;
    if (score > bestScore) [best, bestScore] = [d, score];
  }
  return best;
}

/** A .csv (or tab-separated .tsv / .txt) file as one sheet, named after the file. */
export function readCsv(data: ArrayBuffer, name: string): SheetData[] {
  const text = decodeText(data);
  const cells = new Map<number, Cell[]>();
  splitCsv(text, guessDelimiter(text)).forEach((r, i) => {
    const line = r.slice(0, MAX_COLUMNS).map((c) => cellValue(c));
    if (line.some((c) => c !== null)) cells.set(i + 1, line);
  });
  const numbers = [...cells.keys()].sort((a, b) => a - b);
  const sheet: SheetData = {
    name: name.replace(/\.[^.]+$/, '').slice(0, 100) || 'CSV',
    headerRow: 1,
    headers: [],
    rows: [],
    cut: 0,
    headerChoices: numbers.slice(0, HEADER_SEARCH),
    cells,
  };
  return [atHeaderRow(sheet, guessHeaderRow(cells, numbers))];
}

const TEXT_FILE = /\.(csv|tsv|txt)$/i;

/** Any file the import takes: .xlsx workbooks, or .csv / .tsv / .txt text tables. */
export async function readTableFile(file: {
  name: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}): Promise<SheetData[]> {
  const data = await file.arrayBuffer();
  return TEXT_FILE.test(file.name) ? readCsv(data, file.name) : readWorkbook(data);
}
