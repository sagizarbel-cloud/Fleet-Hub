import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import type {
  DocumentKind,
  ItemKind,
  LineCondition,
  QuoteBody,
  QuoteStatus,
  QuoteVisibility,
  ReceiptBody,
  ReceiptState,
  RecordKind,
} from '@fleet-hub/shared';
import { api } from '@/lib/api';
import { uploadFiles, type Attachment } from '@/vehicle/records/api';

const enc = encodeURIComponent;
const PAGE = 60;

export interface VehicleTag {
  serial: string;
  type: string;
}

function qs(filters: Record<string, string | undefined>, extra: Record<string, string> = {}) {
  const q = new URLSearchParams(extra);
  for (const [k, v] of Object.entries(filters)) if (v) q.set(k, v);
  return q;
}

/** After a write that touches vehicles: their pages, timelines, the dashboard and the fleet table. */
export function refreshMoney(qc: QueryClient) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: ['receipts'] }),
    qc.invalidateQueries({ queryKey: ['quotes'] }),
    qc.invalidateQueries({ queryKey: ['items'] }),
    qc.invalidateQueries({ queryKey: ['records'] }),
    qc.invalidateQueries({ queryKey: ['vehicle'] }),
    qc.invalidateQueries({ queryKey: ['events'] }),
    qc.invalidateQueries({ queryKey: ['dashboard'] }),
    qc.invalidateQueries({ queryKey: ['fleet', 'table'] }),
  ]);
}

// ---------- Receipts ----------

export interface Receipt {
  id: string;
  kind: DocumentKind;
  date: string;
  vendor: string | null;
  amount: number | null;
  category: string | null;
  notes: string | null;
  state: ReceiptState;
  linked: { kind: RecordKind; id: string } | null;
  createdById: string | null;
  createdBy: string | null;
  createdAt: string;
  approvedAt: string | null;
  canEdit: boolean;
  vehicles: VehicleTag[];
  attachments: Attachment[];
}

export type ReceiptFilters = Partial<
  Record<
    'vehicle' | 'category' | 'state' | 'from' | 'to' | 'min' | 'max' | 'q' | 'sort' | 'dir',
    string
  >
>;

export interface ReceiptPage {
  items: Receipt[];
  total: number;
  nextOffset: number | null;
  totals: {
    sum: number;
    count: number;
    byVehicle: { serial: string; amount: number }[];
    byMonth: { month: string; amount: number }[];
  };
  suggested: number;
}

export function useReceipts(filters: ReceiptFilters) {
  return useInfiniteQuery({
    queryKey: ['receipts', filters],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      api<ReceiptPage>(
        `/receipts?${qs(filters, { offset: String(pageParam), limit: String(PAGE) })}`,
      ),
    getNextPageParam: (last) => last.nextOffset ?? undefined,
    placeholderData: (prev) => prev,
  });
}

export const fetchAllReceipts = (filters: ReceiptFilters) =>
  api<ReceiptPage>(`/receipts?${qs(filters, { all: '1' })}`).then((p) => p.items);

/** Saves a receipt and uploads its files; returns the saved receipt. */
export function useSaveReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body, files }: { id?: string; body: ReceiptBody; files: File[] }) => {
      const saved = await api<Receipt>(id ? `/receipts/${enc(id)}` : '/receipts', {
        method: id ? 'PUT' : 'POST',
        json: body,
      });
      if (files.length) await uploadFiles('Document', saved.id, files);
      return saved;
    },
    onSettled: () => refreshMoney(qc),
  });
}

export function useReceiptAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      action,
    }: {
      id: string;
      action: 'delete' | 'restore' | 'approve' | 'reject';
    }) =>
      action === 'delete'
        ? api(`/receipts/${enc(id)}`, { method: 'DELETE' })
        : action === 'restore'
          ? api(`/receipts/${enc(id)}/restore`, { method: 'POST' })
          : api(`/receipts/${enc(id)}/review`, {
              method: 'POST',
              json: { approve: action === 'approve' },
            }),
    onSuccess: () => refreshMoney(qc),
  });
}

// ---------- Quotes ----------

export interface QuoteLine {
  id: string;
  item: string;
  partNo: string | null;
  condition: LineCondition;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface Quote {
  id: string;
  date: string;
  validUntil: string | null;
  status: QuoteStatus;
  visibility: QuoteVisibility;
  notes: string | null;
  createdById: string;
  createdBy: string;
  createdAt: string;
  supplier: { id: string; name: string };
  mine: boolean;
  canEdit: boolean;
  expired: boolean;
  lines: QuoteLine[];
  total: number;
  vehicles: VehicleTag[];
  attachments: Attachment[];
}

export type QuoteFilters = Partial<
  Record<'status' | 'supplier' | 'vehicle' | 'visibility' | 'from' | 'to' | 'q', string>
>;

export function useQuotes(filters: QuoteFilters) {
  return useInfiniteQuery({
    queryKey: ['quotes', 'list', filters],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      api<{ items: Quote[]; total: number; nextOffset: number | null }>(
        `/quotes?${qs(filters, { offset: String(pageParam), limit: String(PAGE) })}`,
      ),
    getNextPageParam: (last) => last.nextOffset ?? undefined,
    placeholderData: (prev) => prev,
  });
}

export const fetchAllQuotes = (filters: QuoteFilters) =>
  api<{ items: Quote[] }>(`/quotes?${qs(filters, { all: '1' })}`).then((p) => p.items);

export const useQuote = (id: string | null) =>
  useQuery({
    queryKey: ['quotes', 'one', id],
    queryFn: () => api<Quote>(`/quotes/${enc(id!)}`),
    enabled: !!id,
  });

export const useSuppliers = () =>
  useQuery({
    queryKey: ['quotes', 'suppliers'],
    queryFn: () => api<{ items: { id: string; name: string }[] }>('/quotes/suppliers'),
  });

export interface Part {
  key: string;
  item: string;
  partNo: string | null;
  quotes: number;
}
export const useParts = () =>
  useQuery({
    queryKey: ['quotes', 'parts'],
    queryFn: () => api<{ items: Part[] }>('/quotes/parts').then((r) => r.items),
  });

export interface CompareLine {
  id: string;
  item: string;
  partNo: string | null;
  condition: LineCondition;
  quantity: number;
  unitPrice: number;
  quote: {
    id: string;
    date: string;
    validUntil: string | null;
    status: QuoteStatus;
    visibility: QuoteVisibility;
    expired: boolean;
    supplier: { id: string; name: string };
  };
}
export const usePartComparison = (part: string | null) =>
  useQuery({
    queryKey: ['quotes', 'compare', 'part', part],
    queryFn: () =>
      api<{ lines: CompareLine[] }>(`/quotes/compare?${qs({ part: part! })}`).then((r) => r.lines),
    enabled: !!part,
  });
export const useQuoteComparison = (ids: string[]) =>
  useQuery({
    queryKey: ['quotes', 'compare', 'ids', ids],
    queryFn: () =>
      api<{ quotes: Quote[] }>(`/quotes/compare?${qs({ ids: ids.join(',') })}`).then(
        (r) => r.quotes,
      ),
    enabled: ids.length >= 2,
  });

export function useSaveQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body, files }: { id?: string; body: QuoteBody; files: File[] }) => {
      const saved = await api<Quote>(id ? `/quotes/${enc(id)}` : '/quotes', {
        method: id ? 'PUT' : 'POST',
        json: body,
      });
      if (files.length) await uploadFiles('Quote', saved.id, files);
      return saved;
    },
    onSettled: () => refreshMoney(qc),
  });
}

export function useQuoteAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      a:
        | { id: string; action: 'delete' | 'restore' }
        | { id: string; action: 'status'; status: QuoteStatus }
        | { id: string; action: 'visibility'; visibility: QuoteVisibility }
        | { id: string; action: 'vehicles'; vehicles: string[] },
    ) => {
      const url = `/quotes/${enc(a.id)}`;
      switch (a.action) {
        case 'delete':
          return api(url, { method: 'DELETE' });
        case 'restore':
          return api(`${url}/restore`, { method: 'POST' });
        case 'status':
          return api(`${url}/status`, { method: 'POST', json: { status: a.status } });
        case 'visibility':
          return api(`${url}/visibility`, { method: 'PUT', json: { visibility: a.visibility } });
        case 'vehicles':
          return api(`${url}/vehicles`, { method: 'PUT', json: { vehicles: a.vehicles } });
      }
    },
    onSuccess: () => refreshMoney(qc),
  });
}

// ---------- Equipment ----------

export interface Item {
  id: string;
  kind: ItemKind;
  name: string;
  model: string | null;
  spec: string | null;
  serial: string | null;
  retiredAt: string | null;
  vehicle: VehicleTag | null;
  since: string | null;
}
export interface ItemDetail extends Item {
  history: { serial: string; type: string; assignedAt: string; removedAt: string | null }[];
}
export type ItemFilters = Partial<Record<'q' | 'kind' | 'vehicle' | 'where' | 'retired', string>>;

export const useItems = (filters: ItemFilters) =>
  useQuery({
    queryKey: ['items', 'catalog', filters],
    queryFn: () => api<{ items: Item[] }>(`/items?${qs(filters)}`).then((r) => r.items),
    placeholderData: (prev) => prev,
  });

export const useItem = (id: string | null) =>
  useQuery({
    queryKey: ['items', 'one', id],
    queryFn: () => api<ItemDetail>(`/items/${enc(id!)}`),
    enabled: !!id,
  });

export function useSaveItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: object }) =>
      api<Item>(id ? `/items/${enc(id)}` : '/items', { method: id ? 'PUT' : 'POST', json: body }),
    onSuccess: () => refreshMoney(qc),
  });
}

/** Assign to a vehicle (moving it off another), remove, retire or bring back. */
export function useItemMove() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      action,
      vehicle,
    }: {
      id: string;
      action: 'assign' | 'remove' | 'retire' | 'unretire';
      vehicle?: string;
    }) =>
      api(`/items/${enc(id)}/${action}`, {
        method: 'POST',
        json: action === 'assign' ? { vehicle } : {},
      }),
    onSuccess: () => refreshMoney(qc),
  });
}
