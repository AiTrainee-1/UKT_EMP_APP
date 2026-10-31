import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { pickOpenPass } from '../lib/outpassOpen';
import type { OutpassRequestItem } from './useOutpass';

/**
 * Home's view of the employee's gate passes, for the "Out on a gate pass" row.
 *
 * It shares the cache entry of useOutpassRequests (same key, same request, same list shape), so the Outpass screen and
 * Home never disagree and a pass opened on one shows on the other at once. The difference is the polling: the Outpass
 * screen polls every 30 s, but Home stays mounted all day, so here the list is polled only while a pass is actually open
 * (once a minute, to notice the return scan); the row's own timer ticks on the phone. Nothing open = no polling.
 */
export function useHomeOutpass(employeeId: number | null) {
  return useQuery({
    queryKey: ['outpass-requests', employeeId],
    queryFn: async (): Promise<OutpassRequestItem[]> => {
      const res = await api.get('/outpass-requests');
      return Array.isArray(res.data) ? res.data : [];
    },
    enabled: !!employeeId,
    staleTime: 30_000,
    refetchInterval: (query) => (pickOpenPass(query.state.data ?? [], Date.now()) ? 60_000 : false),
  });
}
