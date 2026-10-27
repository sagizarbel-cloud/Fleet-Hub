import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import type { RecordKind, UsageUnit, VehicleStatus } from '@fleet-hub/shared';
import { api, ApiError } from '@/lib/api';

export interface Attachment {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  hasThumb: boolean;
  createdAt: string;
}

/** One row of a record panel. Fields depend on the kind; see kinds.tsx. */
export type RecordRow = Record<string, unknown> & {
  id: string;
  createdById: string | null;
  createdBy: string | null;
  attachments: Attachment[];
};

export interface RecordPage {
  items: RecordRow[];
  total: number;
  nextOffset: number | null;
}

/** Filter and sort state of a panel; also what the Excel export asks for. */
export type RecordFilters = Partial<
  Record<
    | 'q'
    | 'from'
    | 'to'
    | 'state'
    | 'severity'
    | 'fluid'
    | 'location'
    | 'inspection'
    | 'accident'
    | 'drops'
    | 'mine'
    | 'sort'
    | 'dir',
    string
  >
>;

const enc = encodeURIComponent;
const PAGE = 50;

function query(filters: RecordFilters, extra: Record<string, string> = {}) {
  const qs = new URLSearchParams(extra);
  for (const [k, v] of Object.entries(filters)) if (v) qs.set(k, v);
  return qs;
}

export const recordsKey = (serial: string, kind?: RecordKind) =>
  kind ? (['records', serial, kind] as const) : (['records', serial] as const);

export function useRecords(serial: string, kind: RecordKind, filters: RecordFilters) {
  return useInfiniteQuery({
    queryKey: [...recordsKey(serial, kind), filters],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      api<RecordPage>(
        `/vehicles/${enc(serial)}/records/${kind}?${query(filters, { offset: String(pageParam), limit: String(PAGE) })}`,
      ),
    getNextPageParam: (last) => last.nextOffset ?? undefined,
    placeholderData: (prev) => prev,
  });
}

/** Every row matching the panel's filters, for the export. */
export const fetchAllRecords = (serial: string, kind: RecordKind, filters: RecordFilters) =>
  api<RecordPage>(`/vehicles/${enc(serial)}/records/${kind}?${query(filters, { all: '1' })}`);

/** After any write: the panel, the vehicle (vitals, counts, status), timelines and the dashboard. */
export function refreshAfterWrite(qc: QueryClient, serial: string) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: recordsKey(serial) }),
    qc.invalidateQueries({ queryKey: ['vehicle', serial] }),
    qc.invalidateQueries({ queryKey: ['fuel-economy', serial] }),
    qc.invalidateQueries({ queryKey: ['ownership', serial] }),
    qc.invalidateQueries({ queryKey: ['events'] }),
    qc.invalidateQueries({ queryKey: ['dashboard'] }),
    // Receipts and quotes carry files too.
    qc.invalidateQueries({ queryKey: ['receipts'] }),
    qc.invalidateQueries({ queryKey: ['quotes'] }),
  ]);
}

export function useSaveRecord(serial: string, kind: RecordKind) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: object }) =>
      api<{ item: RecordRow; status: VehicleStatus }>(
        `/vehicles/${enc(serial)}/records/${kind}${id ? `/${enc(id)}` : ''}`,
        { method: id ? 'PUT' : 'POST', json: body },
      ),
    onSuccess: () => refreshAfterWrite(qc, serial),
  });
}

/** Delete (deleted: true) or Undo (deleted: false). */
export function useSetDeleted(serial: string, kind: RecordKind) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, deleted }: { id: string; deleted: boolean }) =>
      api<{ ok: true; status: VehicleStatus }>(
        `/vehicles/${enc(serial)}/records/${kind}/${enc(id)}${deleted ? '' : '/restore'}`,
        { method: deleted ? 'DELETE' : 'POST' },
      ),
    onSuccess: () => refreshAfterWrite(qc, serial),
  });
}

export interface EconomyPoint {
  id: string;
  date: string;
  value: number;
  baseline: number | null;
  drop: boolean;
}
export const useFuelEconomy = (serial: string) =>
  useQuery({
    queryKey: ['fuel-economy', serial],
    queryFn: () =>
      api<{ unit: UsageUnit; points: EconomyPoint[] }>(`/vehicles/${enc(serial)}/fuel-economy`),
  });

export interface Ownership {
  id: string;
  purchaseDate: string | null;
  purchasePrice: number | null;
  warrantyTerms: string | null;
  warrantyExpiry: string | null;
  supplier: { id: string; name: string } | null;
  attachments: Attachment[];
  suppliers: { id: string; name: string }[];
}
export const useOwnership = (serial: string) =>
  useQuery({
    queryKey: ['ownership', serial],
    queryFn: () => api<Ownership>(`/vehicles/${enc(serial)}/ownership`),
  });
export function useSaveOwnership(serial: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: object) =>
      api<{ ok: true; changed: string[] }>(`/vehicles/${enc(serial)}/ownership`, {
        method: 'PUT',
        json: body,
      }),
    onSuccess: () => refreshAfterWrite(qc, serial),
  });
}

export function useStatusOverride(serial: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      body: { mode: 'set'; status: VehicleStatus; reason: string } | { mode: 'clear' },
    ) =>
      api<{ status: VehicleStatus; override: VehicleStatus | null }>(
        `/vehicles/${enc(serial)}/status-override`,
        { method: 'PUT', json: body },
      ),
    onSuccess: () => refreshAfterWrite(qc, serial),
  });
}

export interface DocumentRow {
  id: string;
  kind: 'RECEIPT' | 'INVOICE' | 'OTHER';
  date: string;
  vendor: string | null;
  amount: number | null;
  category: string | null;
  notes: string | null;
  attachments: Attachment[];
}
export const useDocuments = (serial: string) =>
  useQuery({
    queryKey: [...recordsKey(serial), 'documents'],
    queryFn: () => api<{ items: DocumentRow[] }>(`/vehicles/${enc(serial)}/documents`),
  });

export interface QuoteRow {
  id: string;
  date: string;
  validUntil: string | null;
  status: 'REQUESTED' | 'RECEIVED' | 'APPROVED' | 'ORDERED' | 'REJECTED';
  notes: string | null;
  supplier: string;
  lineCount: number;
  total: number;
}
export const useQuotes = (serial: string) =>
  useQuery({
    queryKey: [...recordsKey(serial), 'quotes'],
    queryFn: () => api<{ items: QuoteRow[] }>(`/vehicles/${enc(serial)}/quotes`),
  });

// ---------- Attachments ----------

export const attachmentUrl = (a: Pick<Attachment, 'id'>, variant: 'file' | 'thumb' = 'file') =>
  `/api/attachments/${enc(a.id)}${variant === 'thumb' ? '/thumb' : ''}`;

export const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';

/** Uploads files to a record; multipart, so not through the JSON helper. */
export async function uploadFiles(ownerType: string, ownerId: string, files: File[]) {
  const form = new FormData();
  for (const f of files) form.append('file', f, f.name);
  const res = await fetch(`/api/attachments?ownerType=${enc(ownerType)}&ownerId=${enc(ownerId)}`, {
    method: 'POST',
    body: form,
    credentials: 'same-origin',
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, body.error ?? 'unknown');
  }
  return (await res.json()) as { items: Attachment[] };
}

export function useAttachmentDelete(serial: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, deleted }: { id: string; deleted: boolean }) =>
      api<{ ok: true }>(`/attachments/${enc(id)}${deleted ? '' : '/restore'}`, {
        method: deleted ? 'DELETE' : 'POST',
      }),
    onSuccess: () => refreshAfterWrite(qc, serial),
  });
}
