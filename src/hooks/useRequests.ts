import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

export interface PermissionRequest {
  id: number;
  type: 'Early Out' | 'Late In' | 'Short Leave';
  date: string;
  time: string;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  appliedOn: string;
}

export function usePermissions(employeeId: number | null) {
  return useQuery({
    queryKey: ['permissions', employeeId],
    queryFn: async () => {
      const res = await api.get('/permissions', { params: { employeeId } });
      return res.data as PermissionRequest[];
    },
    enabled: !!employeeId,
  });
}

export function useSubmitPermission(employeeId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      type: string;
      date: string;
      time: string;
      reason: string;
    }) => {
      const res = await api.post('/permissions', { employeeId, ...data });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['permissions', employeeId] });
    },
  });
}
