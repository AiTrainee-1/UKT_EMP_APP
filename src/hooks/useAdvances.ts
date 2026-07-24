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
  // Backend field is "createdAt" (see settlement_views.py::advance_json) —
  // was "dateTaken" here, which doesn't exist in the response, so this was
  // always undefined at runtime (rendered as "Invalid Date").
  createdAt: string;
  totalRepaid: number;
  // Backend field is "outstanding" — was "remainingBalance" here, which
  // doesn't exist in the response, so this was always undefined at runtime
  // (crashed the screen: undefined.toLocaleString() throws).
  outstanding: number;
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
