import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { toHolidays } from '../lib/holidays';

export type { Holiday, HolidayType } from '../lib/holidays';

export function useHolidays(year: number) {
  return useQuery({
    queryKey: ['holidays', year],
    queryFn: async () => {
      const res = await api.get('/holidays', { params: { year } });
      return toHolidays(res.data);
    },
  });
}
