import { ALL_FLEET_COLUMNS, RECORD_KINDS, type UsageUnit } from '@fleet-hub/shared';
import { downloadWorkbook, type SheetSpec } from '@/vehicle/records/exportXlsx';
import { createdByCol, KIND_UI, localDay, type FormatCtx } from '@/vehicle/records/kinds';
import type { RecordRow } from '@/vehicle/records/api';
import { fetchFleetRecords } from './data';
import {
  excelColumns,
  FLEET_COLUMN_DEFS,
  SERIAL_COLUMN,
  type FleetColumnDef,
  type FleetRow,
} from './model';

const asRecords = (rows: FleetRow[]) =>
  rows.map(
    (r) =>
      ({
        id: r.serial,
        createdById: null,
        createdBy: null,
        attachments: [],
        ...r,
      }) as unknown as RecordRow,
  );

/** The table as shown: these rows, in this order, with these columns. */
export async function exportView(opts: {
  rows: FleetRow[];
  columns: FleetColumnDef[];
  viewName: string;
  ctx: FormatCtx;
}) {
  const { ctx } = opts;
  const today = new Date();
  await downloadWorkbook({
    title: ctx.t('nav.fleetTable'),
    lines: [opts.viewName, ctx.t('records.exportedOn', { date: ctx.date(today.toISOString()) })],
    columns: excelColumns(opts.columns),
    rows: asRecords(opts.rows),
    ctx,
    files: false,
    fileName: `fleet view ${localDay(today)}.xlsx`,
  });
}

/**
 * The whole fleet as one workbook: a Vehicles sheet with every column, then one sheet per
 * record type across all vehicles, and the assigned items. No start codes anywhere.
 */
export async function exportFleet(opts: { rows: FleetRow[]; ctx: FormatCtx }) {
  const { ctx, rows } = opts;
  const today = new Date();
  const lines = [ctx.t('records.exportedOn', { date: ctx.date(today.toISOString()) })];
  const unitOf = new Map<string, UsageUnit>(rows.map((r) => [r.serial, r.usageUnit]));
  const records = await Promise.all(RECORD_KINDS.map((kind) => fetchFleetRecords(kind)));

  const sheets: SheetSpec[] = [
    {
      title: ctx.t('fleet.export.vehiclesSheet'),
      lines,
      columns: excelColumns(ALL_FLEET_COLUMNS.map((id) => FLEET_COLUMN_DEFS[id])),
      rows: asRecords(rows),
      ctx,
      files: false,
      fileName: '',
    },
    ...RECORD_KINDS.map((kind, i) => ({
      title: ctx.t(`vehicle.records.${kind}`),
      lines,
      columns: [SERIAL_COLUMN, ...KIND_UI[kind].columns, createdByCol],
      rows: records[i]!,
      ctx,
      rowCtx: (r: RecordRow) => ({ ...ctx, unit: unitOf.get(r.serial as string) ?? ctx.unit }),
      fileName: '',
    })),
    {
      title: ctx.t('vehicle.items.title'),
      lines,
      columns: [
        SERIAL_COLUMN,
        { key: 'item', header: 'vehicle.items.item', kind: 'text', value: (r) => r.item as string },
      ],
      rows: rows.flatMap((r) =>
        r.items.map(
          (item) =>
            ({
              id: `${r.serial}:${item}`,
              serial: r.serial,
              item,
              createdById: null,
              createdBy: null,
              attachments: [],
            }) as RecordRow,
        ),
      ),
      ctx,
      files: false,
      fileName: '',
    },
  ];
  await downloadWorkbook({ fileName: `fleet ${localDay(today)}.xlsx`, sheets });
}
