import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { isRecordKind, type RecordKind } from '@fleet-hub/shared';

/** Event.sourceType / Attachment.ownerType → the record kind it belongs to. */
const KIND_OF_SOURCE: Record<string, RecordKind> = {
  ServiceRecord: 'service',
  Malfunction: 'malfunctions',
  FluidAddition: 'fluids',
  FuelEntry: 'fuel',
  Movement: 'movements',
  Inspection: 'inspections',
  Note: 'notes',
};

/** What the record report shows: one record, or the vehicle's open malfunctions to pick from. */
export type ReportTarget = { kind: RecordKind; id: string } | { kind: 'malfunctions'; id: 'open' };

/** A timeline entry's record, when it is about one of the seven record kinds. */
export function recordOfEvent(e: { sourceType: string | null; sourceId: string | null }) {
  const kind = e.sourceType ? KIND_OF_SOURCE[e.sourceType] : undefined;
  return kind && e.sourceId ? { kind, id: e.sourceId } : null;
}

/** `?record=<kind>.<id>` on the vehicle page. */
export const recordParam = (kind: RecordKind, id: string) => `${kind}.${id}`;

export function parseRecordParam(value: string | null): ReportTarget | null {
  if (!value) return null;
  const dot = value.indexOf('.');
  const kind = value.slice(0, dot);
  const id = value.slice(dot + 1);
  if (dot < 1 || !id || !isRecordKind(kind)) return null;
  return { kind, id };
}

/**
 * Opens and closes the record report on the vehicle page. The report is in the URL, so Back
 * closes it, a reload keeps it and a link to it can be shared.
 */
export function useRecordLink() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as { reportPushed?: boolean } | null;
  const target = parseRecordParam(params.get('record'));

  const open = (kind: RecordKind, id: string) => {
    const next = new URLSearchParams(params);
    next.set('record', recordParam(kind, id));
    // Moving between reports (e.g. from the open list to one) replaces, so Back closes in one step.
    setParams(next, {
      replace: !!target,
      state: { ...(location.state as object), reportPushed: true },
    });
  };
  const close = () => {
    if (state?.reportPushed) {
      navigate(-1);
      return;
    }
    const next = new URLSearchParams(params);
    next.delete('record');
    setParams(next, { replace: true, state: location.state });
  };
  return { target, open, close };
}
