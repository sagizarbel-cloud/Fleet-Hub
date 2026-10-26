import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LoginBody, SessionUser } from '@fleet-hub/shared';
import { api, ApiError } from '@/lib/api';

const ME = ['auth', 'me'] as const;

export function useSession() {
  return useQuery({
    queryKey: ME,
    queryFn: async () => {
      try {
        return (await api<{ user: SessionUser }>('/auth/me')).user;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: 5 * 60_000,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: LoginBody) =>
      api<{ user: SessionUser }>('/auth/login', { method: 'POST', json: body }),
    onSuccess: ({ user }) => qc.setQueryData(ME, user),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ ok: true }>('/auth/logout', { method: 'POST', json: {} }),
    onSettled: () => {
      qc.setQueryData(ME, null);
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'auth' });
    },
  });
}
