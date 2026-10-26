import { isRecordKind } from '@fleet-hub/shared';
import type { VehicleDetail } from '../data';
import type { RecordKey } from '../Records';
import { DocumentsPanel, OwnershipPanel, QuotesPanel } from './OtherPanels';
import RecordPanel from './RecordPanel';

/** The open panel's contents. Loaded on first open, so tables, forms and zod stay out of the page bundle. */
export default function PanelBody({
  recordKey,
  vehicle,
  reduced,
}: {
  recordKey: RecordKey;
  vehicle: VehicleDetail;
  reduced: boolean;
}) {
  if (isRecordKind(recordKey))
    return <RecordPanel key={recordKey} kind={recordKey} vehicle={vehicle} reduced={reduced} />;
  if (recordKey === 'ownership') return <OwnershipPanel vehicle={vehicle} reduced={reduced} />;
  if (recordKey === 'documents') return <DocumentsPanel vehicle={vehicle} />;
  return <QuotesPanel vehicle={vehicle} />;
}
