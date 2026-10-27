import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ImportAction,
  ImportBody,
  ImportTarget,
  LookupBody,
  LookupKind,
  Role,
  UserBody,
} from '@fleet-hub/shared';
import { api } from '@/lib/api';

const enc = encodeURIComponent;

// ---------- Settings lists ----------

export interface AdminLookup {
  id: string;
  code: string;
  nameEn: string;
  nameHe: string;
  active: boolean;
  sortOrder: number;
  inUse: number;
  category?: 'ROAD' | 'EQUIPMENT';
  usageUnit?: 'KM' | 'HOURS';
}
export type AdminLookups = Record<LookupKind, AdminLookup[]>;

const LISTS = ['settings', 'lookups'] as const;

export const useAdminLookups = () =>
  useQuery({ queryKey: LISTS, queryFn: () => api<AdminLookups>('/settings/lookups') });

/** After a list change: the editor's copy and the lists every picker uses. */
function useRefreshLists() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: LISTS }),
      qc.invalidateQueries({ queryKey: ['lookups'] }),
    ]);
}

export function useSaveLookup(kind: LookupKind) {
  const qc = useQueryClient();
  const refresh = useRefreshLists();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: LookupBody }) =>
      api<AdminLookup>(`/settings/lookups/${kind}${id ? `/${enc(id)}` : ''}`, {
        method: id ? 'PUT' : 'POST',
        json: body,
      }),
    // An edit (e.g. hiding a value) shows at once.
    onMutate: ({ id, body }) => {
      const lists = qc.getQueryData<AdminLookups>(LISTS);
      if (!id || !lists) return;
      qc.setQueryData(LISTS, {
        ...lists,
        [kind]: lists[kind].map((l) => (l.id === id ? { ...l, ...body } : l)),
      });
    },
    onSettled: refresh,
  });
}

export function useDeleteLookup(kind: LookupKind) {
  const refresh = useRefreshLists();
  return useMutation({
    mutationFn: (id: string) =>
      api<{ ok: true }>(`/settings/lookups/${kind}/${enc(id)}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });
}

export function useReorderLookups(kind: LookupKind) {
  const qc = useQueryClient();
  const refresh = useRefreshLists();
  return useMutation({
    mutationFn: (ids: string[]) =>
      api<{ ok: true }>(`/settings/lookups/${kind}/order`, { method: 'PUT', json: { ids } }),
    // The new order shows at once.
    onMutate: (ids) => {
      const lists = qc.getQueryData<AdminLookups>(LISTS);
      if (!lists) return;
      const byId = new Map(lists[kind].map((l) => [l.id, l]));
      qc.setQueryData(LISTS, {
        ...lists,
        [kind]: ids.map((id) => byId.get(id)).filter(Boolean),
      });
    },
    onSettled: refresh,
  });
}

// ---------- Users ----------

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  canViewStartCodes: boolean;
  active: boolean;
  createdAt: string;
}
export interface ResetLink {
  path: string;
  expiresAt: string;
}

const USERS = ['users'] as const;

export const useUsers = () =>
  useQuery({ queryKey: USERS, queryFn: () => api<{ items: AdminUser[] }>('/users') });

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UserBody) =>
      api<{ user: AdminUser; link: ResetLink }>('/users', { method: 'POST', json: body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: USERS }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<Omit<AdminUser, 'id' | 'email'>> }) =>
      api<AdminUser>(`/users/${enc(id)}`, { method: 'PUT', json: body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: USERS }),
  });
}

export const useResetLink = () =>
  useMutation({
    mutationFn: (id: string) => api<ResetLink>(`/users/${enc(id)}/reset-link`, { method: 'POST' }),
  });

export const useChangePassword = () =>
  useMutation({
    mutationFn: (body: { current: string; next: string }) =>
      api<{ ok: true }>('/auth/password', { method: 'POST', json: body }),
  });

// ---------- Excel import ----------

export interface ImportRow {
  row: number;
  action: ImportAction;
  key: string | null;
  errors: { field: string; code: string }[];
  changes?: string[];
}
export interface ImportResult {
  runId: string | null;
  counts: { created: number; updated: number; skipped: number; errors: number };
  results: ImportRow[];
}

export const fetchSavedMapping = (target: ImportTarget, signature: string) =>
  api<{ mapping: ImportBody['mapping'] | null }>(
    `/import/mapping?target=${target}&signature=${enc(signature)}`,
  ).then((r) => r.mapping);

export function useRunImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      target,
      body,
      commit,
    }: {
      target: ImportTarget;
      body: ImportBody;
      commit: boolean;
    }) =>
      api<ImportResult>(`/import/${target}/${commit ? 'commit' : 'preview'}`, {
        method: 'POST',
        json: body,
      }),
    onSuccess: (_r, { commit }) => {
      if (!commit) return;
      // An import can touch any vehicle and list.
      void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'auth' });
    },
  });
}
