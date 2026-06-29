import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

export interface Holiday {
  id: number;
  name: string;
  date: string;
  type: 'National' | 'Regional' | 'Company';
}

export function useHolidays(year: number) {
  return useQuery({
    queryKey: ['holidays', year],
    queryFn: async () => {
      const res = await api.get('/holidays', { params: { year } });
      return res.data as Holiday[];
    },
  });
}
