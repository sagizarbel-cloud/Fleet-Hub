import { lazy, Suspense } from 'react';
import type { VehicleDetail } from './data';
import { useRecordLink } from './records/recordLink';

// The report, its form and zod load only when a report opens.
const RecordReport = lazy(() => import('./records/RecordReport'));

/** Shows the record report named in `?record=` (Revisions 1) over the vehicle page. */
export function ReportHost({
  vehicle,
  reduced,
}: {
  vehicle: VehicleDetail | undefined;
  reduced: boolean;
}) {
  const { target } = useRecordLink();
  if (!target || !vehicle) return null;
  return (
    <Suspense>
      <RecordReport vehicle={vehicle} target={target} reduced={reduced} />
    </Suspense>
  );
}
