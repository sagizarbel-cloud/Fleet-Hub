import { useState } from 'react';
import type { RecordKind } from '@fleet-hub/shared';
import type { VehicleDetail } from '../data';
import { fetchAllRecords, type RecordFilters, type RecordRow } from './api';
import type { Column, FormatCtx } from './kinds';
import { localDay } from './kinds';

/** File names: no characters Windows refuses. */
const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, ' ').trim();

export interface ExportJob {
  serial: string;
  kind: RecordKind | 'documents' | 'quotes' | 'ownership';
  vehicle: VehicleDetail;
  columns: Column[];
  ctx: FormatCtx;
  /** Record panels fetch every matching row; other panels pass the rows they already have. */
  filters?: RecordFilters;
  rows?: RecordRow[];
}

/** Excel export for a panel. ExcelJS is loaded only when someone presses Export. */
export function useExport() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const run = async (job: ExportJob) => {
    setBusy(true);
    setError(false);
    try {
      const [{ downloadWorkbook }, rows] = await Promise.all([
        import('./exportXlsx'),
        job.rows
          ? Promise.resolve(job.rows)
          : fetchAllRecords(job.serial, job.kind as RecordKind, job.filters ?? {}).then(
              (p) => p.items,
            ),
      ]);
      const { t } = job.ctx;
      const v = job.vehicle;
      const title = t(`vehicle.records.${job.kind}`);
      const today = new Date();
      await downloadWorkbook({
        title,
        lines: [
          [v.serial, `${v.make} ${v.model}`, v.licenseNo].filter(Boolean).join(' · '),
          t('records.exportedOn', { date: job.ctx.date(today.toISOString()) }),
        ],
        columns: job.columns,
        rows,
        ctx: job.ctx,
        // ASCII file names: some browsers and phones drop non-Latin download names.
        fileName: `${safe(`${v.serial} ${job.kind} ${localDay(today)}`)}.xlsx`,
      });
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return { run, busy, error };
}
