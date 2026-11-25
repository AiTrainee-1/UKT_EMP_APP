import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { normalizeMyInsights, type MyInsights } from '../lib/myInsights';

export type { MyInsights } from '../lib/myInsights';

export const MY_INSIGHTS_KEY = 'my-analytics';

/**
 * Home's "My Insights" (owner 2026-11-25): GET /my/analytics?months=N, the employee's own counts month by month
 * (backend api/mobile_analytics.py). A reply that is not one is an error (Retry), never "no data".
 */
export function useMyInsights(employeeId: number | null, months = 6) {
  return useQuery({
    queryKey: [MY_INSIGHTS_KEY, employeeId, months],
    queryFn: async (): Promise<MyInsights> => {
      const res = await api.get('/my/analytics', { params: { months } });
      const data = normalizeMyInsights(res.data);
      if (!data) throw new Error('Unexpected reply from /my/analytics');
      return data;
    },
    enabled: !!employeeId,
    // Past months do not move; the current one changes with each punch, which Home's pull-to-refresh picks up.
    staleTime: 5 * 60 * 1000,
  });
}
