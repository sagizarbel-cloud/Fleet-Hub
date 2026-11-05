import type { RecordKind } from '@fleet-hub/shared';

/** What a vehicle report can hold (Revisions 1), in the order it prints. */
export const REPORT_KINDS = [
  'workCards',
  'service',
  'malfunctions',
  'fuel',
  'fluids',
  'movements',
  'inspections',
  'notes',
] as const satisfies RecordKind[];
export const REPORT_PARTS = [...REPORT_KINDS, 'receipts', 'costs'] as const;
export type ReportPart = (typeof REPORT_PARTS)[number];

export interface ReportOptions {
  from: string;
  to: string;
  parts: ReportPart[];
  logo: boolean;
}

export const reportPath = (serial: string, o: ReportOptions) => {
  const qs = new URLSearchParams();
  if (o.from) qs.set('from', o.from);
  if (o.to) qs.set('to', o.to);
  qs.set('parts', o.parts.join(','));
  if (o.logo) qs.set('logo', '1');
  return `/vehicles/${encodeURIComponent(serial)}/report?${qs}`;
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;
export function parseReport(params: URLSearchParams): ReportOptions {
  const day = (k: string) => {
    const v = params.get(k) ?? '';
    return DAY.test(v) ? v : '';
  };
  const parts = (params.get('parts') ?? '')
    .split(',')
    .filter((p): p is ReportPart => (REPORT_PARTS as readonly string[]).includes(p));
  return {
    from: day('from'),
    to: day('to'),
    parts: parts.length ? parts : [...REPORT_PARTS],
    logo: params.get('logo') === '1',
  };
}
