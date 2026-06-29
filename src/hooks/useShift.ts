import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

export interface ShiftAssignment {
  id: number;
  shiftName: string;
  startTime: string;
  endTime: string;
  gracePeriod: number;
  workingDays: string[];
  saturdayOff: boolean;
}

export function useShift(employeeId: number | null) {
  return useQuery({
    queryKey: ['shift', employeeId],
    queryFn: async () => {
      const res = await api.get('/shift-assignments', { params: { employeeId } });
      return res.data as ShiftAssignment;
    },
    enabled: !!employeeId,
  });
}
