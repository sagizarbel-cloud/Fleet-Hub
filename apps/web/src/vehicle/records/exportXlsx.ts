import ExcelJS from 'exceljs';
import type { Column, FormatCtx } from './kinds';
import type { RecordRow } from './api';

export interface SheetSpec {
  /** The panel's name, e.g. "Service history". */
  title: string;
  /** Header lines above the table: vehicle, export date. */
  lines: string[];
  columns: Column[];
  rows: RecordRow[];
  ctx: FormatCtx;
  fileName: string;
  /** Adds a Files column listing each row's attachments (default true). */
  files?: boolean;
  /** Rows from several vehicles: each row formats with its own vehicle's unit. */
  rowCtx?: (row: RecordRow) => FormatCtx;
}

const HEADER_ROW = 4;

/** Units in the header so the cells can stay plain numbers that sum. */
function header(col: Column, ctx: FormatCtx, mixed: boolean) {
  const name = ctx.t(col.header as never) as string;
  const unit =
    mixed && (col.key === 'reading' || col.key === 'economy')
      ? ''
      : col.key === 'reading'
        ? ctx.t(ctx.unit === 'KM' ? 'records.unit.km' : 'records.unit.hours')
        : col.key === 'economy'
          ? ctx.t(ctx.unit === 'KM' ? 'records.unit.kmPerL' : 'records.unit.lPerHour')
          : col.key === 'liters'
            ? ctx.t('records.unit.liters')
            : col.key === 'downtimeHours'
              ? ctx.t('records.unit.hours')
              : col.kind === 'money'
                ? ctx.t('records.unit.ils')
                : '';
  return unit ? `${name} (${unit})` : name;
}

function cell(col: Column, row: RecordRow, ctx: FormatCtx): ExcelJS.CellValue {
  const v = col.value(row, ctx);
  if (v === null || v === '') return null;
  if (v instanceof Date) return v;
  if (typeof v === 'boolean') return ctx.t(v ? 'records.yes' : 'records.no');
  if (typeof v === 'number') return v;
  // Enum columns (severity, state, kind) export their translated label, not the code.
  return col.text ? col.text(row, ctx) : v;
}

/**
 * One panel as an .xlsx, in the active language; a Hebrew sheet reads right to left.
 * Rows come from the record API, which never carries start codes.
 */
export async function buildWorkbook(spec: SheetSpec) {
  return buildBook([spec]);
}

/** Several sheets in one workbook, e.g. the whole-fleet export. */
export async function buildBook(sheets: SheetSpec[]) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Fleet Hub';
  wb.created = new Date();
  for (const spec of sheets) addSheet(wb, spec);
  return wb;
}

function addSheet(wb: ExcelJS.Workbook, spec: SheetSpec) {
  const { ctx } = spec;
  const rtl = ctx.lang === 'he';
  // Sheet names: at most 31 characters, none of : \ / ? * [ ].
  const name = spec.title.replace(/\s*[:\\/?*[\]]\s*/g, ' - ').slice(0, 31);
  const ws = wb.addWorksheet(name, {
    views: [{ rightToLeft: rtl, state: 'frozen', ySplit: HEADER_ROW }],
  });

  ws.getCell('A1').value = spec.title;
  ws.getCell('A1').font = { bold: true, size: 14 };
  spec.lines.forEach((line, i) => {
    ws.getCell(`A${i + 2}`).value = line;
    ws.getCell(`A${i + 2}`).font = { color: { argb: 'FF555555' } };
  });

  const columns = [...spec.columns];
  const files = spec.files !== false;
  const headers = [
    ...columns.map((c) => header(c, ctx, !!spec.rowCtx)),
    ...(files ? [ctx.t('records.files')] : []),
  ];
  const head = ws.getRow(HEADER_ROW);
  head.values = headers as ExcelJS.CellValue[];
  head.font = { bold: true };
  head.eachCell((c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFCD11' } };
    c.border = { bottom: { style: 'thin' } };
  });

  for (const row of spec.rows) {
    const rowCtx = spec.rowCtx?.(row) ?? ctx;
    ws.addRow([
      ...columns.map((c) => cell(c, row, rowCtx)),
      ...(files ? [row.attachments.map((a) => a.fileName).join(', ') || null] : []),
    ]);
  }

  columns.forEach((col, i) => {
    const c = ws.getColumn(i + 1);
    if (col.kind === 'date') c.numFmt = 'dd/mm/yyyy';
    else if (col.numFmt) c.numFmt = col.numFmt;
    else if (col.kind === 'money') c.numFmt = '#,##0.00';
  });
  // Widths from the longest value, within reason.
  ws.columns.forEach((c, i) => {
    let width = String(headers[i] ?? '').length;
    c.eachCell?.({ includeEmpty: false }, (cellRef) => {
      if (Number(cellRef.row) < HEADER_ROW) return;
      const v = cellRef.value;
      const len = v instanceof Date ? 10 : String(v ?? '').length;
      width = Math.max(width, len);
    });
    c.width = Math.min(60, Math.max(10, width + 2));
  });
  ws.autoFilter = {
    from: { row: HEADER_ROW, column: 1 },
    to: { row: HEADER_ROW, column: headers.length },
  };
}

export async function downloadWorkbook(
  spec: SheetSpec | { fileName: string; sheets: SheetSpec[] },
) {
  const wb = await buildBook('sheets' in spec ? spec.sheets : [spec]);
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = spec.fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
