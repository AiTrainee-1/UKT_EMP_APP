import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuth } from './useAuth';
import { normalizeHistory, type CompensationHistory } from '../lib/compensationHistory';

export type { CompensationHistory } from '../lib/compensationHistory';

/**
 * GET /my/compensation-history?year=: every compensation of the year (detected, given by HR, announced for everybody),
 * the balance and the overtime pay each month's salary slip paid. Staff only: a production employee gets `isStaff:
 * false` and a message. Read-only on the server. A reply that is not the contract is an ERROR (Retry), never "nothing".
 */
export function useCompensationHistory(year: number | null, enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['compensation-history', user?.employeeId ?? null, year],
    queryFn: async (): Promise<CompensationHistory> => {
      const res = await api.get('/my/compensation-history', { params: year ? { year } : undefined });
      const data = normalizeHistory(res.data);
      if (!data) throw new Error('Unexpected reply from /my/compensation-history');
      return data;
    },
    enabled: !!user && enabled,
    staleTime: 30_000,
  });
}
