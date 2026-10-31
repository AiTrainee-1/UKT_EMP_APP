import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuth } from './useAuth';
import {
  normalizePendingRequests,
  readRemindResult,
  type PendingRequest,
  type PendingRequests,
} from '../lib/pendingReminders';

export type { PendingRequest, PendingRequests } from '../lib/pendingReminders';

const key = (employeeId: number | null | undefined) => ['my-pending-requests', employeeId ?? null] as const;

/**
 * GET /my/pending-requests: the signed-in employee's own requests that are still waiting for an answer (every kind),
 * where each one stands in its approval pipeline and whether it can be reminded now. A reply that does not match the
 * contract (an older backend has no such route) is an ERROR, not an empty list: the screen shows a Retry state.
 */
export function usePendingRequests() {
  const { user } = useAuth();
  return useQuery({
    queryKey: key(user?.employeeId),
    queryFn: async (): Promise<PendingRequests> => {
      const res = await api.get('/my/pending-requests');
      const data = normalizePendingRequests(res.data);
      if (!data) throw new Error('Unexpected reply from /my/pending-requests');
      return data;
    },
    enabled: !!user,
    staleTime: 30_000,
  });
}

/**
 * POST /my/pending-requests/<module>/<id>/remind: remind whoever has to act on the request now (the Department Head on
 * their phone, or HR in the HR portal). Allowed once per request every 24 hours; a refusal carries the server's message.
 * On success the row is replaced with the server's fresh copy, so the countdown starts at once.
 */
export function useRemindApprover() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (item: Pick<PendingRequest, 'module' | 'id'>) => {
      const res = await api.post(`/my/pending-requests/${encodeURIComponent(item.module)}/${item.id}/remind`, {});
      return readRemindResult(res.data);
    },
    onSuccess: (result) => {
      const fresh = result.item;
      if (fresh) {
        queryClient.setQueryData<PendingRequests>(key(user?.employeeId), (old) =>
          old ? { ...old, items: old.items.map((i) => (i.key === fresh.key ? fresh : i)) } : old,
        );
      }
    },
    // Either way the list is read again: a refusal may mean the request was just decided, or reminded from another phone.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key(user?.employeeId) });
    },
  });
}
