import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

export interface RepaymentEntry {
  date: string;
  amount: number;
}

export interface Advance {
  id: number;
  amount: number;
  purpose: string;
  dateTaken: string;
  totalRepaid: number;
  remainingBalance: number;
  repayments: RepaymentEntry[];
}

export function useAdvances(employeeId: number | null) {
  return useQuery({
    queryKey: ['advances', employeeId],
    queryFn: async () => {
      const res = await api.get('/advances', { params: { employeeId } });
      return res.data as Advance[];
    },
    enabled: !!employeeId,
  });
}
